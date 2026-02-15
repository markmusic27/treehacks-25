#!/usr/bin/env python3
"""
Render MIDI to WAV using FluidSynth.

Takes a MIDI file and a soundfont, produces a WAV audio file.
This is the bridge between your recorded session and Suno generation.

Usage:
    python3 render_midi_to_wav.py session.mid
    python3 render_midi_to_wav.py session.mid --instrument nylon_guitar
    python3 render_midi_to_wav.py session.mid -o output.wav
"""

import os
import sys
import argparse
import subprocess

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
SOUNDFONT_DIR = os.path.join(REPO_DIR, "soundfonts")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "rendered_wav")


def find_soundfont():
    """Find first .sf2 in soundfonts directory."""
    if os.path.exists(SOUNDFONT_DIR):
        for f in sorted(os.listdir(SOUNDFONT_DIR)):
            if f.lower().endswith(".sf2"):
                return os.path.join(SOUNDFONT_DIR, f)
    return None


def render_midi_to_wav(midi_path, output_path=None, soundfont=None, gain=0.8):
    """
    Render a MIDI file to WAV using FluidSynth CLI.

    FluidSynth can render directly to a file (no audio output)
    which is faster than real-time playback.

    Args:
        midi_path: Path to .mid file.
        output_path: Output .wav path. Auto-generated if None.
        soundfont: Path to .sf2. Auto-detected if None.
        gain: Volume 0.0-1.0.

    Returns:
        str: Path to rendered WAV file.
    """
    midi_path = os.path.abspath(midi_path)
    if not os.path.exists(midi_path):
        raise FileNotFoundError(f"MIDI file not found: {midi_path}")

    if soundfont is None:
        soundfont = find_soundfont()
    if soundfont is None:
        raise FileNotFoundError(f"No soundfont found in {SOUNDFONT_DIR}")

    if output_path is None:
        os.makedirs(OUTPUT_DIR, exist_ok=True)
        name = os.path.splitext(os.path.basename(midi_path))[0]
        output_path = os.path.join(OUTPUT_DIR, f"{name}.wav")

    print(f"[Render] MIDI: {os.path.basename(midi_path)}")
    print(f"[Render] Soundfont: {os.path.basename(soundfont)}")
    print(f"[Render] Output: {output_path}")

    # FluidSynth can render MIDI → WAV directly with the -F flag
    cmd = [
        "fluidsynth",
        "-ni",                    # no interactive mode
        "-g", str(gain),          # gain/volume
        "-F", output_path,        # render to file
        "-r", "44100",            # sample rate
        soundfont,
        midi_path,
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)

    if result.returncode != 0:
        raise RuntimeError(f"FluidSynth render failed:\n{result.stderr.strip()}")

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"[Render] Done! {size_mb:.1f} MB → {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Render MIDI to WAV using FluidSynth.")
    parser.add_argument("midi_file", help="Path to .mid file")
    parser.add_argument("-o", "--output", default=None, help="Output WAV path")
    parser.add_argument("--soundfont", default=None, help="Path to .sf2 file")
    parser.add_argument("--gain", type=float, default=0.8, help="Volume 0.0-1.0")

    args = parser.parse_args()

    render_midi_to_wav(
        midi_path=args.midi_file,
        output_path=args.output,
        soundfont=args.soundfont,
        gain=args.gain,
    )


if __name__ == "__main__":
    main()
