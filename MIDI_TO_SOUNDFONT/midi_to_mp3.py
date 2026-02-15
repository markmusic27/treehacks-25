#!/usr/bin/env python3
"""
Convert a MIDI file to MP3 using FluidSynth + ffmpeg.

Usage:
    python midi_to_mp3.py <midi-file> [options]

Examples:
    python midi_to_mp3.py midi_output/song.mid
    python midi_to_mp3.py midi_output/song.mid --soundfont soundfonts/MyFont.sf2
    python midi_to_mp3.py midi_output/song.mid --instrument electric_guitar_clean
    python midi_to_mp3.py midi_output/song.mid -o my_song.mp3

Requirements:
    macOS:  brew install fluid-synth ffmpeg
    Linux:  sudo apt-get install fluidsynth ffmpeg
    Python: pip install pyfluidsynth pretty_midi
"""

import argparse
import os
import sys
import subprocess
import tempfile

# ── Path setup ───────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SOUNDFONT_DIR = os.path.join(SCRIPT_DIR, "soundfonts")


def find_default_soundfont():
    """Find the first .sf2 file in the soundfonts directory."""
    if not os.path.exists(SOUNDFONT_DIR):
        return None
    sf_files = [f for f in os.listdir(SOUNDFONT_DIR) if f.lower().endswith(".sf2")]
    if not sf_files:
        return None
    sf_files.sort()
    return os.path.join(SOUNDFONT_DIR, sf_files[0])


def midi_to_wav(midi_path, wav_path, soundfont_path, gain=0.8):
    """Render MIDI to WAV using the fluidsynth CLI."""
    cmd = [
        "fluidsynth",
        "-ni",                  # no interactive mode
        "-g", str(gain),        # gain
        "-F", wav_path,         # output file
        "-r", "44100",          # sample rate
        soundfont_path,
        midi_path,
    ]
    print(f"  Rendering MIDI -> WAV ...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  fluidsynth error:\n{result.stderr}")
        sys.exit(1)
    print(f"  WAV created: {wav_path}")


def wav_to_mp3(wav_path, mp3_path, bitrate="192k"):
    """Convert WAV to MP3 using ffmpeg."""
    cmd = [
        "ffmpeg",
        "-y",                   # overwrite output
        "-i", wav_path,
        "-b:a", bitrate,        # audio bitrate
        "-q:a", "2",            # quality
        mp3_path,
    ]
    print(f"  Converting WAV -> MP3 ...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ffmpeg error:\n{result.stderr}")
        sys.exit(1)
    print(f"  MP3 created: {mp3_path}")


def main():
    parser = argparse.ArgumentParser(description="Convert MIDI to MP3.")
    parser.add_argument("midi_file", help="Path to the .mid MIDI file.")
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="Output MP3 path. Defaults to same name as input with .mp3 extension.",
    )
    parser.add_argument(
        "--soundfont",
        default=None,
        help="Path to a .sf2 soundfont. Auto-detects from /soundfonts if omitted.",
    )
    parser.add_argument(
        "--gain",
        type=float,
        default=0.8,
        help="Master volume 0.0-1.0 (default: 0.8).",
    )
    parser.add_argument(
        "--bitrate",
        default="192k",
        help="MP3 bitrate (default: 192k). Use 320k for higher quality.",
    )

    args = parser.parse_args()

    # ── Validate input ───────────────────────────────────────────────
    if not os.path.exists(args.midi_file):
        print(f"Error: MIDI file not found: {args.midi_file}")
        sys.exit(1)

    # ── Find soundfont ───────────────────────────────────────────────
    sf_path = args.soundfont or find_default_soundfont()
    if sf_path is None:
        print("\nError: No soundfont found!")
        print(f"  Put a .sf2 file in: {SOUNDFONT_DIR}")
        print("\n  Quick download (FluidR3_GM, 141 MB):")
        print("    https://member.keymusician.com/Member/FluidR3_GM/")
        sys.exit(1)

    # ── Determine output path ────────────────────────────────────────
    if args.output:
        mp3_path = args.output
    else:
        base = os.path.splitext(args.midi_file)[0]
        mp3_path = base + ".mp3"

    # ── Convert ──────────────────────────────────────────────────────
    print("=" * 50)
    print("  MIDI -> MP3 Converter")
    print("=" * 50)
    print(f"  Input:     {args.midi_file}")
    print(f"  Output:    {mp3_path}")
    print(f"  Soundfont: {os.path.basename(sf_path)}")
    print()

    # Use a temp WAV file, then convert to MP3
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        wav_path = tmp.name

    try:
        midi_to_wav(args.midi_file, wav_path, sf_path, gain=args.gain)
        wav_to_mp3(wav_path, mp3_path, bitrate=args.bitrate)
    finally:
        # Clean up temp WAV
        if os.path.exists(wav_path):
            os.remove(wav_path)

    # ── Done ─────────────────────────────────────────────────────────
    size_mb = os.path.getsize(mp3_path) / (1024 * 1024)
    print(f"\n  Done! {mp3_path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
