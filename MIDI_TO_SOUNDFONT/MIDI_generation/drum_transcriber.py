#!/usr/bin/env python3
"""
Drum Transcriber — Convert drum audio to MIDI using onset detection.

Basic Pitch doesn't work for drums (it's designed for pitched instruments).
This module uses a different approach:

1. Detect onsets (when drum hits occur) using librosa
2. Classify each hit as kick, snare, or hihat using frequency analysis
3. Map to General MIDI percussion note numbers
4. Output a MIDI file that plays correctly on channel 9

GM Percussion mapping (channel 9):
    36 = Bass Drum (Kick)
    38 = Acoustic Snare
    42 = Closed Hi-Hat
    46 = Open Hi-Hat
    49 = Crash Cymbal
    51 = Ride Cymbal

Usage (as a module):
    from drum_transcriber import drums_to_midi
    midi_path = drums_to_midi("drums.wav", output_dir="midi_output")

Usage (CLI):
    python3 drum_transcriber.py drums.wav
    python3 drum_transcriber.py drums.wav -o midi_output/
"""

import os
import sys
import argparse
import numpy as np
from pathlib import Path


# ── GM Percussion note numbers ──────────────────────────────────────────
GM_KICK = 36       # Bass Drum 1
GM_SNARE = 38      # Acoustic Snare
GM_HIHAT_CLOSED = 42  # Closed Hi-Hat
GM_HIHAT_OPEN = 46    # Open Hi-Hat
GM_CRASH = 49      # Crash Cymbal 1
GM_RIDE = 51       # Ride Cymbal 1


def drums_to_midi(
    audio_path,
    output_dir="midi_output",
    sensitivity=0.5,
    min_hit_gap=0.03,
):
    """
    Convert a drum audio file to MIDI using onset detection and
    frequency-based classification.

    Args:
        audio_path (str): Path to drum audio (WAV, MP3, etc.)
        output_dir (str): Where to save the MIDI file.
        sensitivity (float): Onset detection sensitivity (0.0-1.0).
                             Lower = more hits detected. Default 0.5.
        min_hit_gap (float): Minimum time between hits in seconds.
                             Prevents double-triggers. Default 0.03s.

    Returns:
        str: Path to the generated MIDI file.
    """
    import librosa
    import pretty_midi

    audio_path = os.path.abspath(audio_path)
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    audio_name = Path(audio_path).stem
    print(f"[Drums] Processing: {os.path.basename(audio_path)}")

    # ── Load audio ──────────────────────────────────────────────────
    y, sr = librosa.load(audio_path, sr=44100, mono=True)
    duration = len(y) / sr
    print(f"[Drums] Duration: {duration:.1f}s, Sample rate: {sr}")

    # ── Detect onsets ───────────────────────────────────────────────
    # onset_strength gives us a curve of "how likely is an onset here"
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)

    # Pick peaks in the onset strength curve
    # delta controls sensitivity: lower = more onsets
    delta = 0.1 + (1.0 - sensitivity) * 0.4  # map 0-1 to 0.1-0.5
    onset_frames = librosa.onset.onset_detect(
        y=y, sr=sr,
        onset_envelope=onset_env,
        delta=delta,
        wait=int(min_hit_gap * sr / 512),  # min frames between onsets
    )

    onset_times = librosa.frames_to_time(onset_frames, sr=sr)
    print(f"[Drums] Detected {len(onset_times)} hits")

    if len(onset_times) == 0:
        print("[Drums] No hits detected! Try lowering sensitivity.")
        # Create empty MIDI
        midi = pretty_midi.PrettyMIDI()
        os.makedirs(output_dir, exist_ok=True)
        midi_path = os.path.join(output_dir, f"{audio_name}_drums.mid")
        midi.write(midi_path)
        return midi_path

    # ── Classify each hit by frequency content ──────────────────────
    # For each onset, analyze a short window of audio to determine
    # if it's a kick (low freq), snare (mid freq), or hihat (high freq)

    hop_length = 512
    hits = []  # list of (time, drum_type, velocity)

    for onset_time in onset_times:
        # Get a short window around the onset (50ms)
        start_sample = int(onset_time * sr)
        window_size = int(0.05 * sr)  # 50ms
        end_sample = min(start_sample + window_size, len(y))

        if start_sample >= len(y):
            continue

        window = y[start_sample:end_sample]

        if len(window) < 256:
            continue

        # Compute spectrum of this window
        spectrum = np.abs(np.fft.rfft(window))
        freqs = np.fft.rfftfreq(len(window), d=1.0 / sr)

        # Energy in frequency bands
        low_mask = freqs < 200       # Kick drum: below 200 Hz
        mid_mask = (freqs >= 200) & (freqs < 2000)  # Snare: 200-2000 Hz
        high_mask = freqs >= 2000    # Hihat/cymbal: above 2000 Hz

        low_energy = np.sum(spectrum[low_mask] ** 2) if np.any(low_mask) else 0
        mid_energy = np.sum(spectrum[mid_mask] ** 2) if np.any(mid_mask) else 0
        high_energy = np.sum(spectrum[high_mask] ** 2) if np.any(high_mask) else 0

        total_energy = low_energy + mid_energy + high_energy
        if total_energy == 0:
            continue

        # Normalize
        low_ratio = low_energy / total_energy
        mid_ratio = mid_energy / total_energy
        high_ratio = high_energy / total_energy

        # Classify based on dominant frequency band
        if low_ratio > 0.5:
            drum_note = GM_KICK
            drum_name = "kick"
        elif high_ratio > 0.4:
            drum_note = GM_HIHAT_CLOSED
            drum_name = "hihat"
        elif mid_ratio > 0.3:
            drum_note = GM_SNARE
            drum_name = "snare"
        else:
            # Ambiguous — default to snare
            drum_note = GM_SNARE
            drum_name = "snare"

        # Velocity based on amplitude
        amplitude = np.max(np.abs(window))
        velocity = int(np.clip(amplitude * 127 * 2, 40, 127))

        hits.append((onset_time, drum_note, drum_name, velocity))

    # ── Count hits by type ──────────────────────────────────────────
    kick_count = sum(1 for h in hits if h[2] == "kick")
    snare_count = sum(1 for h in hits if h[2] == "snare")
    hihat_count = sum(1 for h in hits if h[2] == "hihat")
    print(f"[Drums] Classification: {kick_count} kicks, {snare_count} snares, {hihat_count} hihats")

    # ── Create MIDI file ────────────────────────────────────────────
    midi = pretty_midi.PrettyMIDI()

    # Use channel 9 (index 9) for GM percussion
    # is_drum=True tells pretty_midi this is a percussion track
    drum_program = pretty_midi.instrument_name_to_program("Steel Drums")
    drum_track = pretty_midi.Instrument(program=0, is_drum=True, name="Drums")

    hit_duration = 0.1  # Each drum hit lasts 100ms

    for onset_time, drum_note, drum_name, velocity in hits:
        note = pretty_midi.Note(
            velocity=velocity,
            pitch=drum_note,
            start=onset_time,
            end=onset_time + hit_duration,
        )
        drum_track.notes.append(note)

    midi.instruments.append(drum_track)

    # ── Save ────────────────────────────────────────────────────────
    os.makedirs(output_dir, exist_ok=True)
    midi_filename = f"{audio_name}_drums.mid"
    midi_path = os.path.join(output_dir, midi_filename)
    midi.write(midi_path)

    print(f"[Drums] Done! {len(hits)} hits → {midi_path}")
    return midi_path


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Convert drum audio to MIDI using onset detection.",
    )
    parser.add_argument("audio_file", help="Path to drum audio (WAV, MP3, etc.)")
    parser.add_argument("-o", "--output-dir", default="midi_output")
    parser.add_argument(
        "--sensitivity",
        type=float,
        default=0.5,
        help="Onset sensitivity 0.0-1.0. Lower = more hits. (default: 0.5)",
    )

    args = parser.parse_args()

    drums_to_midi(
        audio_path=args.audio_file,
        output_dir=args.output_dir,
        sensitivity=args.sensitivity,
    )


if __name__ == "__main__":
    main()
