#!/usr/bin/env python3
"""
Instrument Note Test Runner

Runs the same hardcoded note test cases across multiple instruments.
Useful for quickly validating that note -> sound works end-to-end.

Edit the two placeholders below:
  1) TEST_NOTES
  2) TEST_INSTRUMENTS

Usage:
  python3 test_instrument_notes.py
  python3 test_instrument_notes.py --note-duration 0.35 --gap 0.08
"""

import time
import argparse

from realtime_player import RealtimePlayer, midi_to_name
from riff_bank import RIFFS, DEFAULT_RIFF, get_riff


# -------------------------------------------------------------------
# Riff selection comes from riff_bank.py
# -------------------------------------------------------------------
ACTIVE_RIFF = "seven_nation_army"
TEST_NOTES = get_riff(ACTIVE_RIFF)


# -------------------------------------------------------------------
# PLACEHOLDER: Instruments you want to compare.
# These can be GM names or custom names (e.g., "oud") which will
# trigger the search/download flow in realtime_player.
# -------------------------------------------------------------------
TEST_INSTRUMENTS = [
    "oud",
    "sitar",
    "violin",
    "cello",
    "flute",
    "clarinet",
    "trumpet",
    "electric_guitar_clean",
    "steel_guitar",
    "distortion_guitar",
    "acoustic_grand_piano",
    "electric_piano",
    "synth_lead",
]


def _as_label(note):
    """Pretty label for logs."""
    if isinstance(note, int):
        return f"{midi_to_name(note)} ({note})"
    return str(note)


def _play_case(player, case, velocity, note_duration, gap):
    """Play one test case (single note or chord)."""
    case_duration = note_duration

    # Per-case duration support:
    #   ("C4", 0.2) or (("C4","E4","G4"), 0.3)
    if (
        isinstance(case, (tuple, list))
        and len(case) == 2
        and isinstance(case[1], (int, float))
    ):
        case, case_duration = case

    if isinstance(case, (tuple, list)):
        # Chord (tuple/list of notes)
        labels = []
        for note in case:
            player.play(note, velocity=velocity)
            labels.append(_as_label(note))
        print(f"    chord -> {', '.join(labels)}")
        time.sleep(case_duration)
        for note in case:
            player.stop(note)
        time.sleep(gap)
        return

    # Single note
    player.play(case, velocity=velocity)
    print(f"    note  -> {_as_label(case)}")
    time.sleep(case_duration)
    player.stop(case)
    time.sleep(gap)


def run_tests(note_duration=0.30, gap=0.06, velocity=100, end_tail=0.35):
    if not TEST_INSTRUMENTS:
        raise ValueError("TEST_INSTRUMENTS is empty.")
    if not TEST_NOTES:
        raise ValueError("TEST_NOTES is empty.")

    player = RealtimePlayer(instrument=TEST_INSTRUMENTS[0])
    try:
        print("\n=== Instrument Note Test Runner ===\n")
        print(f"Notes: {len(TEST_NOTES)} case(s)")
        print(f"Instruments: {len(TEST_INSTRUMENTS)}")

        for inst in TEST_INSTRUMENTS:
            print(f"\n--- Instrument: {inst} ---")
            player.change_instrument(inst)
            print(f"  resolved as: {player.instrument}")

            for case in TEST_NOTES:
                _play_case(player, case, velocity, note_duration, gap)

            # Let the final note release/ring a little before cutting.
            time.sleep(end_tail)
            player.stop_all()
            # Small pause between instruments
            time.sleep(0.15)

        print("\nAll test cases completed.")
    finally:
        player.cleanup()


def main():
    parser = argparse.ArgumentParser(description="Run hardcoded note tests across instruments.")
    parser.add_argument("--note-duration", type=float, default=0.30, help="Seconds each note/chord rings.")
    parser.add_argument("--gap", type=float, default=0.06, help="Gap between test cases in seconds.")
    parser.add_argument("--velocity", type=int, default=100, help="MIDI velocity 1-127.")
    parser.add_argument("--end-tail", type=float, default=0.35, help="Extra ring time after each instrument run.")
    parser.add_argument(
        "--riff",
        default=ACTIVE_RIFF,
        choices=sorted(RIFFS.keys()),
        help=f"Riff from riff_bank.py (default: {ACTIVE_RIFF})",
    )
    args = parser.parse_args()

    global TEST_NOTES
    TEST_NOTES = get_riff(args.riff)

    run_tests(
        note_duration=args.note_duration,
        gap=args.gap,
        velocity=args.velocity,
        end_tail=args.end_tail,
    )


if __name__ == "__main__":
    main()

