#!/usr/bin/env python3
"""
Song-to-Sound Pipeline — End-to-end: input a song + instrument, hear it play.

This orchestrates the full pipeline as a DAG (directed acyclic graph):

    ┌───────────────────────────────────────────────────────────────────┐
    │                                                                   │
    │   [INPUT]  Song + Instrument name                                 │
    │         │                                                         │
    │         ▼                                                         │
    │   ┌─────────────────┐                                             │
    │   │  Task 1A:       │  YouTube search/URL → download audio       │
    │   │  GET AUDIO      │  (or use local audio/MIDI file)            │
    │   └────────┬────────┘                                             │
    │            │                                                      │
    │            ▼                                                      │
    │   ┌─────────────────┐                                             │
    │   │  Task 1B:       │  Demucs AI splits audio into stems:        │
    │   │  SEPARATE STEMS │  vocals, drums, bass, guitar, piano, other │
    │   │                 │  → picks best stem for your instrument      │
    │   └────────┬────────┘                                             │
    │            │                                                      │
    │            ▼                                                      │
    │   ┌─────────────────┐                                             │
    │   │  Task 1C:       │  Basic Pitch AI → clean .mid from         │
    │   │  CONVERT MIDI   │  isolated instrument stem                  │
    │   └────────┬────────┘                                             │
    │            │                                                      │
    │            ▼                                                      │
    │   ┌─────────────────┐     ┌──────────────────┐                    │
    │   │  Task 2:        │     │  Task 3:         │                    │
    │   │  CHECK          │────▶│  DOWNLOAD        │  Search & download │
    │   │  INSTRUMENT     │ no  │  INSTRUMENT      │  soundfont online  │
    │   └────────┬────────┘     └────────┬─────────┘                    │
    │            │ yes                   │                               │
    │            ▼                       │                               │
    │   ┌─────────────────┐◀─────────────┘                              │
    │   │  Task 4:        │                                             │
    │   │  PLAY SONG      │  FluidSynth + soundfont → speakers         │
    │   └─────────────────┘                                             │
    │                                                                   │
    └───────────────────────────────────────────────────────────────────┘

Usage:
    # YouTube search + instrument (with stem separation)
    python3 pipeline.py "Sugar Maroon 5 guitar cover" --instrument nylon_guitar

    # YouTube URL with 6-stem model (isolates guitar specifically)
    python3 pipeline.py "https://youtube.com/watch?v=abc" -i electric_guitar_clean --six-stems

    # Local audio file
    python3 pipeline.py /path/to/song.mp3 --instrument acoustic_grand_piano

    # Existing MIDI file (skips download, separation, and conversion)
    python3 pipeline.py /path/to/song.mid --instrument violin

    # Skip stem separation (old behavior — raw audio to MIDI)
    python3 pipeline.py "song query" --instrument piano --no-separate

    # Slow playback
    python3 pipeline.py "song query" -i nylon_guitar -s 0.5
"""

import os
import sys
import time
import argparse

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
SOUNDFONT_DIR = os.path.join(REPO_DIR, "soundfonts")
MIDI_OUTPUT_DIR = os.path.join(SCRIPT_DIR, "midi_output")

sys.path.insert(0, os.path.join(SCRIPT_DIR, "MIDI_generation"))
sys.path.insert(0, os.path.join(SCRIPT_DIR, "FluidSynth_Player"))

from youtube_to_midi import youtube_to_midi, is_youtube_url, download_audio
from generate_MIDI import audio_to_midi
from stem_separator import separate_stems, get_best_stem, pick_stem_for_instrument
from manage_instruments import (
    parse_sf2_presets,
    check_instrument,
    search_soundfonts_online,
    download_soundfont,
    get_all_sf2_files,
)
from fluidsynth_player import FluidSynthPlayer
from play_midi import play_midi_file


# ═══════════════════════════════════════════════════════════════════════
#  DAG TASKS
# ═══════════════════════════════════════════════════════════════════════

def task_get_audio(song_input, output_dir=None):
    """
    Task 1A: GET AUDIO
    Get the audio file from the input source.
    If already a MIDI, return it directly (skip separation).

    Returns:
        tuple: (audio_path, is_midi)
            - audio_path: Path to audio or MIDI file
            - is_midi: True if the input is already a MIDI file (skip separation)
    """
    if output_dir is None:
        output_dir = MIDI_OUTPUT_DIR

    print("\n" + "=" * 60)
    print("  TASK 1A: GET AUDIO")
    print("=" * 60)

    # ── Already a MIDI file? Skip separation entirely ───────────────
    if song_input.lower().endswith((".mid", ".midi")):
        if os.path.exists(song_input):
            print(f"  Using existing MIDI: {song_input}")
            return os.path.abspath(song_input), True
        else:
            raise FileNotFoundError(f"MIDI file not found: {song_input}")

    # ── Local audio file? ───────────────────────────────────────────
    audio_extensions = (".mp3", ".wav", ".flac", ".ogg", ".m4a", ".aac")
    if any(song_input.lower().endswith(ext) for ext in audio_extensions):
        if os.path.exists(song_input):
            print(f"  Using local audio: {os.path.basename(song_input)}")
            return os.path.abspath(song_input), False
        else:
            raise FileNotFoundError(f"Audio file not found: {song_input}")

    # ── YouTube URL or search query → download audio ────────────────
    from youtube_to_midi import search_youtube
    print(f"  Source: {'YouTube URL' if is_youtube_url(song_input) else 'YouTube search'}")

    if is_youtube_url(song_input):
        url = song_input
    else:
        url, title = search_youtube(song_input)

    os.makedirs(output_dir, exist_ok=True)
    audio_path = download_audio(url, output_dir)
    return audio_path, False


def task_separate_stems(audio_path, instrument_name, use_six_stems=False):
    """
    Task 1B: SEPARATE STEMS (conditional — skipped for MIDI input)
    Use Demucs to split the audio into instrument stems,
    then pick the stem that best matches the target instrument.

    Returns:
        str: Path to the best stem audio file.
    """
    print("\n" + "=" * 60)
    print("  TASK 1B: SEPARATE STEMS")
    print("=" * 60)

    # Determine if 6-stem is needed (guitar/piano isolation)
    target_stem = pick_stem_for_instrument(instrument_name, use_six_stems)
    needs_six = target_stem in ("guitar", "piano")
    if needs_six and not use_six_stems:
        print(f"  '{instrument_name}' maps to '{target_stem}' — using 6-stem model")
        use_six_stems = True

    # Run Demucs
    stems = separate_stems(
        audio_path=audio_path,
        use_six_stems=use_six_stems,
    )

    # Pick the best stem
    stem_name, stem_path = get_best_stem(stems, instrument_name, use_six_stems)
    print(f"\n  Selected stem: '{stem_name}' → {os.path.basename(stem_path)}")
    return stem_path


def task_get_midi(audio_path, output_dir=None):
    """
    Task 1C: CONVERT TO MIDI
    Convert an audio file (or stem) to MIDI using Basic Pitch.

    Returns:
        str: Path to the MIDI file.
    """
    if output_dir is None:
        output_dir = MIDI_OUTPUT_DIR

    print("\n" + "=" * 60)
    print("  TASK 1C: CONVERT TO MIDI")
    print("=" * 60)

    return audio_to_midi(audio_path, output_dir=output_dir)


def task_check_instrument(instrument_name):
    """
    Task 2: CHECK INSTRUMENT
    Check if the requested instrument exists in any loaded soundfont.

    Returns:
        dict or None: Match info if found, None if not found.
            {"name": ..., "bank": ..., "program": ..., "soundfont": ..., "sfid_path": ...}
    """
    print("\n" + "=" * 60)
    print("  TASK 2: CHECK INSTRUMENT")
    print("=" * 60)

    # ── First check if it's a known GM instrument name ──────────────
    gm_instruments = FluidSynthPlayer.INSTRUMENTS
    if instrument_name.lower().replace(" ", "_") in gm_instruments:
        normalized = instrument_name.lower().replace(" ", "_")
        program = gm_instruments[normalized]
        print(f"  '{instrument_name}' is a standard GM instrument (program {program})")
        return {
            "name": normalized,
            "bank": 0,
            "program": program,
            "soundfont": None,  # Use default soundfont
            "type": "gm",
        }

    # ── Search in all soundfont files ───────────────────────────────
    sf2_files = get_all_sf2_files()
    if not sf2_files:
        print(f"  No soundfont files found in: {SOUNDFONT_DIR}")
        return None

    print(f"  Searching for '{instrument_name}' in {len(sf2_files)} soundfont(s)...")

    for sf2_path in sf2_files:
        matches = check_instrument(sf2_path, instrument_name)
        if matches:
            best = matches[0]  # Take the first match
            print(f"  FOUND: '{best['name']}' (bank {best['bank']}, program {best['program']})")
            print(f"    in {os.path.basename(sf2_path)}")
            return {
                "name": best["name"],
                "bank": best["bank"],
                "program": best["program"],
                "soundfont": sf2_path,
                "type": "sf2",
            }

    print(f"  '{instrument_name}' NOT FOUND in local soundfonts.")
    return None


def task_download_instrument(instrument_name):
    """
    Task 3: DOWNLOAD INSTRUMENT (conditional — only if Task 2 returns None)
    Search online for a soundfont containing the instrument and download it.

    Returns:
        dict or None: Instrument info if download succeeded.
    """
    print("\n" + "=" * 60)
    print("  TASK 3: DOWNLOAD INSTRUMENT")
    print("=" * 60)

    # ── Search online ───────────────────────────────────────────────
    results = search_soundfonts_online(instrument_name)

    if not results:
        print(f"\n  Could not find '{instrument_name}' online.")
        print(f"  Falling back to default piano.")
        return {
            "name": "acoustic_grand_piano",
            "bank": 0,
            "program": 0,
            "soundfont": None,
            "type": "gm_fallback",
        }

    # ── Try downloading the first result ────────────────────────────
    for result in results[:3]:  # Try up to 3 results
        try:
            print(f"\n  Trying: {result['name']}")
            sf2_path = download_soundfont(result["page_url"])

            # Check if the downloaded soundfont has the instrument
            matches = check_instrument(sf2_path, instrument_name)
            if matches:
                best = matches[0]
                print(f"  SUCCESS: Found '{best['name']}' in downloaded soundfont")
                return {
                    "name": best["name"],
                    "bank": best["bank"],
                    "program": best["program"],
                    "soundfont": sf2_path,
                    "type": "downloaded",
                }
            else:
                # Downloaded but doesn't have what we need — still useful
                presets = parse_sf2_presets(sf2_path)
                if presets:
                    best = presets[0]
                    print(f"  Downloaded soundfont doesn't contain '{instrument_name}',")
                    print(f"  but has '{best['name']}'. Using it anyway.")
                    return {
                        "name": best["name"],
                        "bank": best["bank"],
                        "program": best["program"],
                        "soundfont": sf2_path,
                        "type": "downloaded_alt",
                    }

        except Exception as e:
            print(f"  Download failed: {e}")
            continue

    # ── All downloads failed — fall back ────────────────────────────
    print(f"\n  All downloads failed. Falling back to default piano.")
    return {
        "name": "acoustic_grand_piano",
        "bank": 0,
        "program": 0,
        "soundfont": None,
        "type": "gm_fallback",
    }


def task_play_song(midi_path, instrument_info, speed=1.0, gain=0.8):
    """
    Task 4: PLAY SONG
    Load the soundfont(s), set the instrument, and play the MIDI file.
    """
    print("\n" + "=" * 60)
    print("  TASK 4: PLAY SONG")
    print("=" * 60)

    # ── Find the main soundfont ─────────────────────────────────────
    sf2_files = get_all_sf2_files()
    if not sf2_files:
        print("  Error: No soundfont files found!")
        sys.exit(1)

    main_sf = sf2_files[0]

    # ── Initialize FluidSynth ───────────────────────────────────────
    # Use GM name if it's a standard instrument
    if instrument_info["type"] == "gm":
        player = FluidSynthPlayer(
            soundfont_path=main_sf,
            instrument=instrument_info["name"],
            gain=gain,
        )
    else:
        # Start with a default, then configure the specific instrument
        player = FluidSynthPlayer(
            soundfont_path=main_sf,
            instrument="acoustic_grand_piano",
            gain=gain,
        )

        # Load additional soundfont if the instrument came from a different file
        if instrument_info["soundfont"] and instrument_info["soundfont"] != main_sf:
            sfid = player.load_additional_soundfont(instrument_info["soundfont"])
            player.set_instrument_from_soundfont(
                sfid,
                bank=instrument_info["bank"],
                program=instrument_info["program"],
            )
        else:
            # Instrument is in the main soundfont
            player.fs.program_select(
                player.channel,
                player.sfid,
                instrument_info["bank"],
                instrument_info["program"],
            )
            print(f"[FluidSynth] Instrument: {instrument_info['name']} "
                  f"(bank {instrument_info['bank']}, program {instrument_info['program']})")

    # ── Play ────────────────────────────────────────────────────────
    try:
        play_midi_file(midi_path, player, speed=speed)
    except KeyboardInterrupt:
        print("\n  Playback stopped.")
    finally:
        player.cleanup()


# ═══════════════════════════════════════════════════════════════════════
#  DAG ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════

def run_pipeline(song_input, instrument_name, speed=1.0, gain=0.8,
                 separate=True, six_stems=False):
    """
    Execute the full DAG:

        Task 1A (GET AUDIO)
              │
              ▼
        Task 1B (SEPARATE STEMS)  ← conditional: skip if MIDI input or --no-separate
              │
              ▼
        Task 1C (CONVERT TO MIDI)
              │
              ▼
        Task 2 (CHECK INSTRUMENT)
              │
              ▼
        [Task 3 (DOWNLOAD INSTRUMENT)]  ← conditional: only if instrument missing
              │
              ▼
        Task 4 (PLAY SONG)
    """
    start_time = time.time()

    print()
    print("╔" + "═" * 60 + "╗")
    print("║  Song-to-Sound Pipeline                                   ║")
    print("╠" + "═" * 60 + "╣")
    print(f"║  Song:       {song_input[:46]:<46} ║")
    print(f"║  Instrument: {instrument_name[:46]:<46} ║")
    print(f"║  Stems:      {'6-stem' if six_stems else '4-stem' if separate else 'off':<46} ║")
    print(f"║  Speed:      {speed:<46} ║")
    print("╚" + "═" * 60 + "╝")

    # ── Task 1A: Get audio ────────────────────────────────────────
    audio_path, is_midi = task_get_audio(song_input)

    if is_midi:
        # Input is already MIDI — skip separation and conversion
        midi_path = audio_path
    else:
        # ── Task 1B: Separate stems (conditional) ─────────────────
        if separate:
            audio_for_midi = task_separate_stems(
                audio_path, instrument_name, use_six_stems=six_stems
            )
        else:
            audio_for_midi = audio_path
            print("\n  [Stem separation skipped]")

        # ── Task 1C: Convert to MIDI ──────────────────────────────
        midi_path = task_get_midi(audio_for_midi)

    # ── Task 2: Check instrument ────────────────────────────────────
    instrument_info = task_check_instrument(instrument_name)

    # ── Task 3: Download if needed (conditional) ────────────────────
    if instrument_info is None:
        instrument_info = task_download_instrument(instrument_name)

    # ── Task 4: Play ────────────────────────────────────────────────
    elapsed = time.time() - start_time
    print(f"\n  Pipeline setup completed in {elapsed:.1f}s")
    task_play_song(midi_path, instrument_info, speed=speed, gain=gain)

    total_time = time.time() - start_time
    print(f"\n  Total pipeline time: {total_time:.1f}s")


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="End-to-end pipeline: song + instrument → audio playback",
        epilog='Example: python3 pipeline.py "Sugar Maroon 5" --instrument nylon_guitar',
    )
    parser.add_argument(
        "song",
        help="YouTube URL, search query, local audio file, or MIDI file path",
    )
    parser.add_argument(
        "--instrument", "-i",
        default="acoustic_grand_piano",
        help="Instrument name — GM name (e.g. 'nylon_guitar') or search term "
             "(e.g. 'Tenor Sax'). Default: acoustic_grand_piano",
    )
    parser.add_argument(
        "--speed", "-s",
        type=float,
        default=1.0,
        help="Playback speed multiplier (default: 1.0)",
    )
    parser.add_argument(
        "--gain", "-g",
        type=float,
        default=0.8,
        help="Volume 0.0-1.0 (default: 0.8)",
    )
    parser.add_argument(
        "--no-separate",
        action="store_true",
        help="Skip stem separation (use raw audio for MIDI conversion)",
    )
    parser.add_argument(
        "--six-stems",
        action="store_true",
        help="Use 6-stem Demucs model (isolates guitar & piano separately). Slower.",
    )

    args = parser.parse_args()

    run_pipeline(
        song_input=args.song,
        instrument_name=args.instrument,
        speed=args.speed,
        gain=args.gain,
        separate=not args.no_separate,
        six_stems=args.six_stems,
    )


if __name__ == "__main__":
    main()
