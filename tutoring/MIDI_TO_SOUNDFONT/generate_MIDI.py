#!/usr/bin/env python3
"""
Audio-to-MIDI conversion using Spotify's Basic Pitch.

Converts audio files (WAV, MP3, FLAC, OGG, etc.) into MIDI files
using a neural network that detects pitch, onset, and note duration.

Usage (CLI):
    # Single file — output MIDI goes to ./midi_output/
    python generate_MIDI.py input_song.wav

    # Single file — specify output directory
    python generate_MIDI.py input_song.wav -o /path/to/output

    # Multiple files at once
    python generate_MIDI.py song1.wav song2.mp3 song3.flac

    # Adjust detection sensitivity
    python generate_MIDI.py input.wav --onset-threshold 0.3 --note-threshold 0.5

Usage (as a module):
    from generate_MIDI import audio_to_midi
    midi_path = audio_to_midi("input_song.wav", output_dir="midi_output")
"""

import os
import sys
import argparse
from pathlib import Path


def audio_to_midi(
    audio_path,
    output_dir="midi_output",
    onset_threshold=0.5,
    frame_threshold=0.3,
    minimum_note_length=58,
    minimum_frequency=None,
    maximum_frequency=None,
):
    """
    Convert an audio file to MIDI using Basic Pitch.

    Args:
        audio_path (str): Path to the input audio file (WAV, MP3, FLAC, OGG).
        output_dir (str): Directory to save the output MIDI file. Created if needed.
        onset_threshold (float): Note onset sensitivity (0.0-1.0).
                                 Lower = more notes detected. Default 0.5.
        frame_threshold (float): Note frame sensitivity (0.0-1.0).
                                 Lower = more notes detected. Default 0.3.
        minimum_note_length (int): Minimum note duration in milliseconds. Default 58ms.
        minimum_frequency (float|None): Lowest pitch to detect in Hz. None = no limit.
        maximum_frequency (float|None): Highest pitch to detect in Hz. None = no limit.

    Returns:
        str: Path to the generated MIDI file.
    """
    # ── Import basic-pitch here so the module loads fast ────────────────
    # (the model takes a moment to initialize)
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH

    # ── Validate input ──────────────────────────────────────────────────
    audio_path = os.path.abspath(audio_path)
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    audio_name = Path(audio_path).stem  # filename without extension
    print(f"[Basic Pitch] Processing: {os.path.basename(audio_path)}")

    # ── Run the model ───────────────────────────────────────────────────
    # predict() returns:
    #   model_output  — raw neural network output (numpy arrays)
    #   midi_data     — a pretty_midi.PrettyMIDI object
    #   note_events   — list of (start_time, end_time, pitch, velocity, [pitch_bend])
    model_output, midi_data, note_events = predict(
        audio_path,
        model_or_model_path=ICASSP_2022_MODEL_PATH,
        onset_threshold=onset_threshold,
        frame_threshold=frame_threshold,
        minimum_note_length=minimum_note_length,
        minimum_frequency=minimum_frequency,
        maximum_frequency=maximum_frequency,
    )

    # ── Save the MIDI file ──────────────────────────────────────────────
    os.makedirs(output_dir, exist_ok=True)
    midi_filename = f"{audio_name}_basic_pitch.mid"
    midi_path = os.path.join(output_dir, midi_filename)

    midi_data.write(midi_path)

    num_notes = len(note_events)
    print(f"[Basic Pitch] Done! {num_notes} notes detected.")
    print(f"[Basic Pitch] MIDI saved to: {midi_path}")

    return midi_path


def main():
    parser = argparse.ArgumentParser(
        description="Convert audio files to MIDI using Spotify's Basic Pitch.",
        epilog="Example: python generate_MIDI.py song.wav -o midi_output/",
    )
    parser.add_argument(
        "audio_files",
        nargs="+",
        help="Path(s) to input audio file(s) — WAV, MP3, FLAC, OGG, etc.",
    )
    parser.add_argument(
        "-o", "--output-dir",
        default="midi_output",
        help="Directory to save MIDI files (default: ./midi_output)",
    )
    parser.add_argument(
        "--onset-threshold",
        type=float,
        default=0.5,
        help="Note onset sensitivity, 0.0-1.0. Lower = more notes. (default: 0.5)",
    )
    parser.add_argument(
        "--note-threshold",
        type=float,
        default=0.3,
        help="Note frame sensitivity, 0.0-1.0. Lower = more notes. (default: 0.3)",
    )
    parser.add_argument(
        "--min-note-length",
        type=int,
        default=58,
        help="Minimum note duration in milliseconds (default: 58)",
    )
    parser.add_argument(
        "--min-frequency",
        type=float,
        default=None,
        help="Lowest pitch to detect in Hz (default: no limit)",
    )
    parser.add_argument(
        "--max-frequency",
        type=float,
        default=None,
        help="Highest pitch to detect in Hz (default: no limit)",
    )

    args = parser.parse_args()

    # ── Process each audio file ─────────────────────────────────────────
    print(f"\nProcessing {len(args.audio_files)} file(s)...\n")

    results = []
    for audio_path in args.audio_files:
        try:
            midi_path = audio_to_midi(
                audio_path=audio_path,
                output_dir=args.output_dir,
                onset_threshold=args.onset_threshold,
                frame_threshold=args.note_threshold,
                minimum_note_length=args.min_note_length,
                minimum_frequency=args.min_frequency,
                maximum_frequency=args.max_frequency,
            )
            results.append((audio_path, midi_path, None))
        except Exception as e:
            print(f"[Basic Pitch] ERROR processing {audio_path}: {e}")
            results.append((audio_path, None, str(e)))

    # ── Summary ─────────────────────────────────────────────────────────
    print("\n" + "=" * 55)
    print("  Summary")
    print("=" * 55)
    successes = [r for r in results if r[2] is None]
    failures = [r for r in results if r[2] is not None]

    for audio_path, midi_path, _ in successes:
        print(f"  OK  {os.path.basename(audio_path)} -> {midi_path}")
    for audio_path, _, error in failures:
        print(f"  FAIL  {os.path.basename(audio_path)} — {error}")

    print(f"\n  {len(successes)}/{len(results)} files converted successfully.")

    if failures:
        sys.exit(1)


if __name__ == "__main__":
    main()
