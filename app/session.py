"""
Session — Configuration and state for an air guitar session.

Tracks everything about the current play session: mode, song, instrument,
MIDI file, soundfont, and recorded MIDI events from the CV session.
"""

from __future__ import annotations

import os
import json
import time
from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional

# ── Paths ────────────────────────────────────────────────────────────────
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOUNDFONT_DIR = os.path.join(REPO_DIR, "soundfonts")
SESSIONS_DIR = os.path.join(REPO_DIR, "app", "sessions")


# ── Mode enum ────────────────────────────────────────────────────────────

class Mode(Enum):
    """Play mode."""
    BEGINNER = "beginner"   # Rhythm only — MIDI provides the notes
    HARD = "hard"           # Rhythm + melody — phone provides the notes


# ── Plucked string instruments ───────────────────────────────────────────
# These are the instruments the user can choose to "play" with air guitar.
# Maps display name → FluidSynth GM instrument name.

PLUCKED_INSTRUMENTS = {
    "Nylon Guitar":       "nylon_guitar",
    "Steel Guitar":       "steel_guitar",
    "Electric Clean":     "electric_guitar_clean",
    "Electric Muted":     "electric_guitar_muted",
    "Overdriven Guitar":  "overdriven_guitar",
    "Distortion Guitar":  "distortion_guitar",
    "Acoustic Bass":      "acoustic_bass",
    "Electric Bass":      "electric_bass_finger",
    "Slap Bass":          "slap_bass_1",
    "Banjo":              "banjo",
    "Sitar":              "sitar",
    "Shamisen":           "shamisen",
    "Koto":               "koto",
    "Ukulele":            "nylon_guitar",     # closest GM match
    "Harp":               "orchestral_harp",
}


# ── Instrument info ──────────────────────────────────────────────────────

@dataclass
class InstrumentInfo:
    """Resolved instrument: name, GM program, and soundfont path."""
    display_name: str = ""
    gm_name: str = "nylon_guitar"
    bank: int = 0
    program: int = 24
    soundfont_path: Optional[str] = None  # None = use default
    source: str = "gm"                    # gm | sf2 | downloaded


# ── Session dataclass ────────────────────────────────────────────────────

@dataclass
class Session:
    """
    Full state of a play session.

    Created at the start of the flow, progressively filled in as each
    step completes, and optionally saved to disk when recording finishes.
    """

    # ── Mode ─────────────────────────────────────────────────────────
    mode: Mode = Mode.BEGINNER

    # ── Song (beginner mode) ─────────────────────────────────────────
    song_name: str = ""
    song_query: str = ""          # what was searched
    song_url: str = ""            # YouTube URL of the cover found
    song_title: str = ""          # title of the YouTube video

    # ── Instrument ───────────────────────────────────────────────────
    instrument: InstrumentInfo = field(default_factory=InstrumentInfo)

    # ── MIDI reference (beginner mode) ───────────────────────────────
    midi_path: Optional[str] = None   # path to the generated MIDI file
    audio_path: Optional[str] = None  # path to the downloaded audio (if kept)

    # ── CV recording ─────────────────────────────────────────────────
    recorded_events: list = field(default_factory=list)
    recording_duration: float = 0.0

    # ── Metadata ─────────────────────────────────────────────────────
    created_at: float = field(default_factory=time.time)
    session_id: str = ""

    def __post_init__(self):
        if not self.session_id:
            self.session_id = f"session_{int(self.created_at)}_{os.getpid()}"

    # ── Helpers ──────────────────────────────────────────────────────

    @property
    def needs_midi(self) -> bool:
        """Beginner mode needs a MIDI reference file."""
        return self.mode == Mode.BEGINNER

    @property
    def needs_phone(self) -> bool:
        """Hard mode requires the phone fretboard for melody."""
        return self.mode == Mode.HARD

    def save(self, output_dir: Optional[str] = None) -> str:
        """Save session state to a JSON file. Returns the file path."""
        if output_dir is None:
            output_dir = SESSIONS_DIR
        os.makedirs(output_dir, exist_ok=True)

        path = os.path.join(output_dir, f"{self.session_id}.json")
        data = {
            "session_id": self.session_id,
            "mode": self.mode.value,
            "song_name": self.song_name,
            "song_query": self.song_query,
            "song_url": self.song_url,
            "song_title": self.song_title,
            "instrument": asdict(self.instrument),
            "midi_path": self.midi_path,
            "audio_path": self.audio_path,
            "recorded_events": self.recorded_events,
            "recording_duration": self.recording_duration,
            "created_at": self.created_at,
        }
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

        return path

    def summary(self) -> str:
        """One-line summary of the session for display."""
        mode_label = "Beginner (rhythm)" if self.mode == Mode.BEGINNER else "Hard (rhythm + melody)"
        parts = [f"Mode: {mode_label}"]
        if self.song_name:
            parts.append(f"Song: {self.song_name}")
        if self.instrument.display_name:
            parts.append(f"Instrument: {self.instrument.display_name}")
        if self.midi_path:
            parts.append(f"MIDI: {os.path.basename(self.midi_path)}")
        return " | ".join(parts)
