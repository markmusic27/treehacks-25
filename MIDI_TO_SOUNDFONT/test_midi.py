#!/usr/bin/env python3
"""
Test script for the FluidSynth MIDI pipeline.

What this does:
  1. Finds .sf2 soundfont files in the /soundfonts directory
  2. Lets you pick a soundfont and instrument
  3. Plays a C major scale to verify audio works
  4. Drops into an interactive keyboard mode where keypresses trigger notes

Usage:
    python test_midi.py

Keyboard layout (mimics a piano):
    Black keys:  w  e     t  y  u
    White keys: a  s  d  f  g  h  j  k
    Maps to:    C4 D4 E4 F4 G4 A4 B4 C5

Controls:
    q  = quit
    i  = change instrument
    z  = octave down
    x  = octave up
"""

import time
import sys
import os

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
SOUNDFONT_DIR = os.path.join(PROJECT_DIR, "soundfonts")

# Make sure we can import from the same directory
sys.path.insert(0, SCRIPT_DIR)

from fluidsynth_player import FluidSynthPlayer


# ── Soundfont discovery ─────────────────────────────────────────────────

def find_soundfonts():
    """
    Scan the /soundfonts directory for .sf2 files.
    Creates the directory and prints help if nothing is found.
    """
    if not os.path.exists(SOUNDFONT_DIR):
        os.makedirs(SOUNDFONT_DIR)
        print(f"\nCreated soundfonts directory at:\n  {SOUNDFONT_DIR}")

    sf_files = [f for f in os.listdir(SOUNDFONT_DIR) if f.lower().endswith(".sf2")]
    sf_files.sort()

    if not sf_files:
        print("\n" + "=" * 55)
        print("  No .sf2 soundfont files found!")
        print("=" * 55)
        print(f"\nPlease add a .sf2 file to:\n  {SOUNDFONT_DIR}")
        print("\nRecommended free General MIDI soundfonts:")
        print("  - FluidR3_GM.sf2  (141 MB, full GM set)")
        print("    https://member.keymusician.com/Member/FluidR3_GM/")
        print("  - GeneralUser GS  (30 MB, lighter)")
        print("    https://schristiancollins.com/generaluser.php")
        print("\nA single GM soundfont contains all 128 standard instruments")
        print("(piano, guitar, strings, etc.) — one file is all you need.")
        sys.exit(1)

    return sf_files


def pick_soundfont(sf_files):
    """Prompt the user to select a soundfont file."""
    if len(sf_files) == 1:
        print(f"\nUsing soundfont: {sf_files[0]}")
        return os.path.join(SOUNDFONT_DIR, sf_files[0])

    print("\n--- Available SoundFonts ---")
    for i, name in enumerate(sf_files, 1):
        print(f"  {i}. {name}")

    while True:
        try:
            choice = int(input(f"\nPick a soundfont (1-{len(sf_files)}): "))
            if 1 <= choice <= len(sf_files):
                print(f"  Selected: {sf_files[choice - 1]}")
                return os.path.join(SOUNDFONT_DIR, sf_files[choice - 1])
        except (ValueError, EOFError):
            pass
        print("  Invalid choice, try again.")


# ── Instrument selection ────────────────────────────────────────────────

# Curated list of instruments that sound good for testing.
# (name displayed to user, key in FluidSynthPlayer.INSTRUMENTS)
INSTRUMENT_MENU = [
    ("Acoustic Grand Piano", "acoustic_grand_piano"),
    ("Electric Piano", "electric_piano"),
    ("Nylon Guitar", "nylon_guitar"),
    ("Steel Guitar", "steel_guitar"),
    ("Clean Electric Guitar", "electric_guitar_clean"),
    ("Overdriven Guitar", "overdriven_guitar"),
    ("Distortion Guitar", "distortion_guitar"),
    ("Violin", "violin"),
    ("Cello", "cello"),
    ("Flute", "flute"),
    ("Trumpet", "trumpet"),
    ("Synth Lead", "synth_lead"),
]


def pick_instrument():
    """Prompt the user to select an instrument."""
    print("\n--- Pick an Instrument ---")
    for i, (display_name, _) in enumerate(INSTRUMENT_MENU, 1):
        print(f"  {i:2d}. {display_name}")

    while True:
        try:
            choice = int(input(f"\nPick an instrument (1-{len(INSTRUMENT_MENU)}): "))
            if 1 <= choice <= len(INSTRUMENT_MENU):
                display_name, key = INSTRUMENT_MENU[choice - 1]
                print(f"  Selected: {display_name}")
                return key
        except (ValueError, EOFError):
            pass
        print("  Invalid choice, try again.")


# ── Test scale ──────────────────────────────────────────────────────────

def play_test_scale(player):
    """Play a C major scale (C4 to C5) to verify audio output."""
    print("\n--- Playing C Major Scale ---")

    # MIDI note numbers for C major scale starting at middle C
    scale = [
        (60, "C4"), (62, "D4"), (64, "E4"), (65, "F4"),
        (67, "G4"), (69, "A4"), (71, "B4"), (72, "C5"),
    ]

    for note, name in scale:
        print(f"  {name} (MIDI {note})")
        player.noteon(note, velocity=100)
        time.sleep(0.35)
        player.noteoff(note)
        time.sleep(0.05)  # Small gap between notes

    # Play the full chord to finish
    time.sleep(0.2)
    print("  C Major chord...")
    for note in [60, 64, 67]:  # C E G
        player.noteon(note, velocity=90)
    time.sleep(1.0)
    for note in [60, 64, 67]:
        player.noteoff(note)

    print("  Scale complete! If you heard notes, audio is working.\n")


# ── Interactive keyboard ────────────────────────────────────────────────

def interactive_keyboard(player):
    """
    Read raw keypresses and trigger MIDI notes in real time.

    Each keypress plays a short note. This uses macOS/Linux raw terminal mode
    for instant key detection (no need to press Enter).
    """
    import tty
    import termios

    # ── Key-to-note mapping ─────────────────────────────────────────
    # Layout mimics a piano keyboard on a QWERTY keyboard.
    # The base_offset shifts these up/down by octaves.
    KEY_NOTES = {
        # White keys: a s d f g h j k → C D E F G A B C
        "a": 0,   "s": 2,   "d": 4,   "f": 5,
        "g": 7,   "h": 9,   "j": 11,  "k": 12,
        # Black keys: w e _ t y u → C# D# _ F# G# A#
        "w": 1,   "e": 3,
        "t": 6,   "y": 8,   "u": 10,
    }

    NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    base_note = 60  # Start at middle C (C4)
    note_duration = 0.25  # How long each note sounds (seconds)

    def midi_to_name(midi_num):
        """Convert MIDI note number to human-readable name like C#4."""
        octave = (midi_num // 12) - 1
        name = NOTE_NAMES[midi_num % 12]
        return f"{name}{octave}"

    print("=" * 55)
    print("  Interactive Keyboard Mode")
    print("=" * 55)
    print()
    print("  Black keys:  w  e     t  y  u")
    print("  White keys: a  s  d  f  g  h  j  k")
    print()
    print(f"  Current octave: {midi_to_name(base_note)} - {midi_to_name(base_note + 12)}")
    print()
    print("  z = octave down | x = octave up")
    print("  i = change instrument")
    print("  q = quit")
    print()

    # Switch to raw terminal mode so we get instant key input
    fd = sys.stdin.fileno()
    old_settings = termios.tcgetattr(fd)

    try:
        tty.setraw(fd)

        while True:
            char = sys.stdin.read(1)

            # ── Quit ────────────────────────────────────────────────
            if char == "q":
                player.all_notes_off()
                break

            # ── Octave down ─────────────────────────────────────────
            if char == "z":
                if base_note >= 24:  # Don't go below C1
                    base_note -= 12
                    name = midi_to_name(base_note)
                    sys.stdout.write(f"\r  Octave down -> {name}     \r\n")
                continue

            # ── Octave up ───────────────────────────────────────────
            if char == "x":
                if base_note <= 96:  # Don't go above C8
                    base_note += 12
                    name = midi_to_name(base_note)
                    sys.stdout.write(f"\r  Octave up -> {name}       \r\n")
                continue

            # ── Change instrument ───────────────────────────────────
            if char == "i":
                # Restore terminal for menu input
                termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                player.all_notes_off()
                instrument = pick_instrument()
                player.set_instrument(instrument)
                print("\nBack to keyboard mode — press keys to play!")
                # Switch back to raw mode
                tty.setraw(fd)
                continue

            # ── Play a note ─────────────────────────────────────────
            if char in KEY_NOTES:
                midi_note = base_note + KEY_NOTES[char]
                name = midi_to_name(midi_note)
                sys.stdout.write(f"\r  {name} (MIDI {midi_note})        \r\n")

                player.noteon(midi_note, velocity=100)
                time.sleep(note_duration)
                player.noteoff(midi_note)

    finally:
        # Always restore the terminal to normal mode
        termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
        print("\n  Keyboard mode exited.")


# ── Main ────────────────────────────────────────────────────────────────

def main():
    print()
    print("=" * 55)
    print("  FluidSynth MIDI Pipeline — Test Script")
    print("=" * 55)

    # Step 1: Find soundfonts
    sf_files = find_soundfonts()

    # Step 2: Pick a soundfont
    sf_path = pick_soundfont(sf_files)

    # Step 3: Pick an instrument
    instrument = pick_instrument()

    # Step 4: Initialize FluidSynth
    print("\nInitializing FluidSynth...")
    player = FluidSynthPlayer(soundfont_path=sf_path, instrument=instrument)

    # Step 5: Play test scale
    input("\nPress Enter to play a test scale...")
    play_test_scale(player)

    # Step 6: Interactive keyboard
    input("Press Enter to start interactive keyboard mode...")
    try:
        interactive_keyboard(player)
    except KeyboardInterrupt:
        pass
    finally:
        player.cleanup()
        print("\nDone! FluidSynth test complete.")


if __name__ == "__main__":
    main()
