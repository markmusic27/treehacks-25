#!/usr/bin/env python3
"""
Play a MIDI file through FluidSynth to hear it out loud.

Usage:
    python play_midi.py <midi-file> [--soundfont <path>] [--instrument <name>] [--speed <multiplier>]

Examples:
    # Play with default settings (auto-finds soundfont in /soundfonts)
    python play_midi.py midi_output/song_basic_pitch.mid

    # Pick a specific instrument
    python play_midi.py midi_output/song_basic_pitch.mid --instrument nylon_guitar

    # Play at half speed (to hear notes more clearly)
    python play_midi.py midi_output/song_basic_pitch.mid --speed 0.5

    # Play at double speed
    python play_midi.py midi_output/song_basic_pitch.mid --speed 2.0
"""

import time
import sys
import os
import argparse

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
SOUNDFONT_DIR = os.path.join(PROJECT_DIR, "soundfonts")

sys.path.insert(0, SCRIPT_DIR)

from fluidsynth_player import FluidSynthPlayer


def find_default_soundfont():
    """Find the first .sf2 file in the soundfonts directory."""
    if not os.path.exists(SOUNDFONT_DIR):
        return None
    sf_files = [f for f in os.listdir(SOUNDFONT_DIR) if f.lower().endswith(".sf2")]
    if not sf_files:
        return None
    sf_files.sort()
    return os.path.join(SOUNDFONT_DIR, sf_files[0])


def play_midi_file(midi_path, player, speed=1.0):
    """
    Parse a MIDI file and play it through FluidSynth in real time.

    Uses pretty_midi to read the note events, then schedules noteon/noteoff
    calls with proper timing.

    Args:
        midi_path (str): Path to the .mid file.
        player (FluidSynthPlayer): Initialized player instance.
        speed (float): Playback speed multiplier. 1.0 = normal, 0.5 = half speed.
    """
    import pretty_midi

    # ── Load and analyze the MIDI file ──────────────────────────────
    midi = pretty_midi.PrettyMIDI(midi_path)

    # Collect all note events across all instruments/tracks
    # Each event: (time, type, note, velocity)
    events = []
    for instrument in midi.instruments:
        for note in instrument.notes:
            events.append((note.start, "on", note.pitch, note.velocity))
            events.append((note.end, "off", note.pitch, 0))

    # Sort by time (stable sort keeps on/off order for simultaneous events)
    events.sort(key=lambda e: e[0])

    if not events:
        print("  No notes found in MIDI file!")
        return

    # ── Print MIDI info ─────────────────────────────────────────────
    total_notes = sum(len(inst.notes) for inst in midi.instruments)
    duration = midi.get_end_time()
    print(f"\n  MIDI file: {os.path.basename(midi_path)}")
    print(f"  Notes: {total_notes}")
    print(f"  Duration: {duration:.1f}s (playback: {duration / speed:.1f}s at {speed}x speed)")
    print(f"\n  Playing... (Ctrl+C to stop)\n")

    # ── Play events in real time ────────────────────────────────────
    NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    start_time = time.time()
    last_print_time = -1

    try:
        for event_time, event_type, pitch, velocity in events:
            # Calculate when this event should fire (adjusted for speed)
            target_time = start_time + (event_time / speed)
            now = time.time()

            # Wait until it's time for this event
            wait = target_time - now
            if wait > 0:
                time.sleep(wait)

            # Fire the event
            if event_type == "on":
                player.noteon(pitch, velocity)

                # Print current note (throttled to avoid spamming)
                current_second = int(event_time)
                if current_second != last_print_time:
                    note_name = NOTE_NAMES[pitch % 12]
                    octave = (pitch // 12) - 1
                    elapsed = time.time() - start_time
                    print(f"  [{elapsed:6.1f}s] {note_name}{octave} (MIDI {pitch})")
                    last_print_time = current_second
            else:
                player.noteoff(pitch)

    except KeyboardInterrupt:
        print("\n\n  Playback stopped.")

    # Let the last notes ring out briefly
    time.sleep(0.5)
    player.all_notes_off()
    print(f"\n  Playback finished.")


def main():
    parser = argparse.ArgumentParser(
        description="Play a MIDI file through FluidSynth.",
    )
    parser.add_argument(
        "midi_file",
        help="Path to the .mid MIDI file to play.",
    )
    parser.add_argument(
        "--soundfont",
        default=None,
        help="Path to a .sf2 soundfont file. Auto-detects from /soundfonts if omitted.",
    )
    parser.add_argument(
        "--instrument",
        default="nylon_guitar",
        help="Instrument name (default: nylon_guitar). "
             "Options: acoustic_grand_piano, steel_guitar, electric_guitar_clean, "
             "violin, flute, synth_lead, etc.",
    )
    parser.add_argument(
        "--speed",
        type=float,
        default=1.0,
        help="Playback speed multiplier (default: 1.0). Use 0.5 for half speed.",
    )
    parser.add_argument(
        "--gain",
        type=float,
        default=0.8,
        help="Volume 0.0-1.0 (default: 0.8).",
    )

    args = parser.parse_args()

    # ── Validate MIDI file ──────────────────────────────────────────
    if not os.path.exists(args.midi_file):
        print(f"Error: MIDI file not found: {args.midi_file}")
        sys.exit(1)

    # ── Find soundfont ──────────────────────────────────────────────
    sf_path = args.soundfont or find_default_soundfont()
    if sf_path is None:
        print("\nError: No soundfont found!")
        print(f"  Put a .sf2 file in: {SOUNDFONT_DIR}")
        print("\n  Quick download (FluidR3_GM, 141 MB):")
        print("    https://member.keymusician.com/Member/FluidR3_GM/")
        sys.exit(1)

    # ── Initialize and play ─────────────────────────────────────────
    print("=" * 55)
    print("  MIDI Playback")
    print("=" * 55)

    player = FluidSynthPlayer(
        soundfont_path=sf_path,
        instrument=args.instrument,
        gain=args.gain,
    )

    try:
        play_midi_file(args.midi_file, player, speed=args.speed)
    finally:
        player.cleanup()


if __name__ == "__main__":
    main()
