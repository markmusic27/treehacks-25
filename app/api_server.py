#!/usr/bin/env python3
"""
FastAPI server for song generation pipeline.

Endpoints:
    POST /midi-to-mp3  - Convert MIDI events to MP3
    POST /generate-songs - Full pipeline (MIDI -> MP3 -> Text -> Suno)
"""

import os
import tempfile
import subprocess
from pathlib import Path
from typing import List, Dict
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import pretty_midi

app = FastAPI(title="Maestro Song Generation API")

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────

class MidiEvent(BaseModel):
    time: float
    midi_note: int
    velocity: int
    duration: float
    name: str

class MidiToMp3Request(BaseModel):
    midi_events: List[MidiEvent]
    instrument_id: str = "guitar"
    gain: float = 0.8

# ─────────────────────────────────────────────────────────────────
# Helper Functions
# ─────────────────────────────────────────────────────────────────

REPO_DIR = Path(__file__).parent.parent
SOUNDFONT_PATH = REPO_DIR / "vision" / "soundfont.sf2"
OUTPUT_DIR = REPO_DIR / "app" / "generated"

def events_to_midi_file(events: List[MidiEvent], output_path: str) -> None:
    """Convert MIDI events to a MIDI file."""
    midi = pretty_midi.PrettyMIDI()
    instrument = pretty_midi.Instrument(program=25)  # Acoustic Guitar

    for event in events:
        note = pretty_midi.Note(
            velocity=event.velocity,
            pitch=event.midi_note,
            start=event.time,
            end=event.time + event.duration
        )
        instrument.notes.append(note)

    midi.instruments.append(instrument)
    midi.write(output_path)
    print(f"[MIDI] Created: {output_path}")

def midi_to_wav(midi_path: str, wav_path: str, soundfont_path: str, gain: float = 0.8) -> None:
    """Render MIDI to WAV using FluidSynth CLI."""
    cmd = [
        "fluidsynth",
        "-ni",
        "-g", str(gain),
        "-F", wav_path,
        "-r", "44100",
        str(soundfont_path),
        midi_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FluidSynth error: {result.stderr}")

    print(f"[WAV] Created: {wav_path}")

def wav_to_mp3(wav_path: str, mp3_path: str, bitrate: str = "192k") -> None:
    """Convert WAV to MP3 using ffmpeg."""
    cmd = [
        "ffmpeg",
        "-y",
        "-i", wav_path,
        "-b:a", bitrate,
        "-q:a", "2",
        mp3_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg error: {result.stderr}")

    print(f"[MP3] Created: {mp3_path}")

# ─────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────

@app.post("/midi-to-mp3")
async def convert_midi_to_mp3(request: MidiToMp3Request):
    """Convert MIDI events to MP3 file."""

    if not request.midi_events:
        raise HTTPException(status_code=400, detail="No MIDI events provided")

    if not SOUNDFONT_PATH.exists():
        raise HTTPException(
            status_code=503,
            detail=f"SoundFont not found at {SOUNDFONT_PATH}"
        )

    # Create output directory
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Generate unique filename
    timestamp = int(request.midi_events[0].time * 1000) if request.midi_events else 0
    base_name = f"recording_{timestamp}"

    midi_path = OUTPUT_DIR / f"{base_name}.mid"
    wav_path = OUTPUT_DIR / f"{base_name}.wav"
    mp3_path = OUTPUT_DIR / f"{base_name}.mp3"

    try:
        # Step 1: Convert events to MIDI file
        events_to_midi_file(request.midi_events, str(midi_path))

        # Step 2: MIDI -> WAV
        midi_to_wav(str(midi_path), str(wav_path), str(SOUNDFONT_PATH), request.gain)

        # Step 3: WAV -> MP3
        wav_to_mp3(str(wav_path), str(mp3_path))

        # Clean up intermediate files
        if midi_path.exists():
            midi_path.unlink()
        if wav_path.exists():
            wav_path.unlink()

        return {
            "success": True,
            "mp3_path": str(mp3_path),
            "num_events": len(request.midi_events),
            "file_size_mb": round(mp3_path.stat().st_size / (1024 * 1024), 2)
        }

    except Exception as e:
        # Clean up on error
        for path in [midi_path, wav_path, mp3_path]:
            if path.exists():
                path.unlink()
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "soundfont_exists": SOUNDFONT_PATH.exists()
    }

if __name__ == "__main__":
    import uvicorn
    print("=" * 60)
    print("  Maestro API Server")
    print("=" * 60)
    print(f"  SoundFont: {SOUNDFONT_PATH}")
    print(f"  Output: {OUTPUT_DIR}")
    print()

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
