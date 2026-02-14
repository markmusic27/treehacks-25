#!/usr/bin/env python3
"""
Full Band Pipeline — Reconstruct an entire band from YouTube covers.

Takes a song name and a list of instruments, finds the best solo cover
for each instrument (using Perplexity AI or parallel YouTube search),
downloads them all, converts each to MIDI, and plays them all
simultaneously through FluidSynth on separate channels.

    ┌────────────────────────────────────────────────────────────────┐
    │  INPUT: Song + Instruments                                     │
    │                                                                │
    │  Step 1: SEARCH (parallel)                                     │
    │    ├── Perplexity/YouTube → best guitar cover URL              │
    │    ├── Perplexity/YouTube → best bass cover URL                │
    │    └── Perplexity/YouTube → best drums cover URL               │
    │                                                                │
    │  Step 2: DOWNLOAD (parallel)                                   │
    │    ├── Download guitar cover audio                             │
    │    ├── Download bass cover audio                               │
    │    └── Download drums cover audio                              │
    │                                                                │
    │  Step 3: CONVERT TO MIDI (parallel)                            │
    │    ├── Basic Pitch → guitar.mid                                │
    │    ├── Basic Pitch → bass.mid                                  │
    │    └── Basic Pitch → drums.mid                                 │
    │                                                                │
    │  Step 4: PLAY ALL (multi-channel FluidSynth)                   │
    │    Ch 0: guitar.mid  → nylon_guitar                            │
    │    Ch 1: bass.mid    → electric_bass                           │
    │    Ch 9: drums.mid   → GM percussion                           │
    │    → All playing simultaneously                                │
    └────────────────────────────────────────────────────────────────┘

Usage:
    # Default: guitar + bass + drums
    python3 full_band_pipeline.py "Cake By The Ocean"

    # Custom instruments and sounds
    python3 full_band_pipeline.py "Hotel California" \
        --guitar nylon_guitar \
        --bass electric_bass \
        --piano acoustic_grand_piano \
        --drums

    # Skip drums, just guitar and piano
    python3 full_band_pipeline.py "Bohemian Rhapsody" \
        --guitar steel_guitar \
        --piano acoustic_grand_piano

    # With vocals
    python3 full_band_pipeline.py "Someone Like You" \
        --piano acoustic_grand_piano \
        --vocals synth_lead
"""

import os
import sys
import time
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
SOUNDFONT_DIR = os.path.join(REPO_DIR, "soundfonts")
MIDI_OUTPUT_DIR = os.path.join(SCRIPT_DIR, "midi_output")
AUDIO_DIR = os.path.join(SCRIPT_DIR, "audio_downloads")

sys.path.insert(0, os.path.join(SCRIPT_DIR, "MIDI_generation"))
sys.path.insert(0, os.path.join(SCRIPT_DIR, "FluidSynth_Player"))

from perplexity_search import search_covers_for_instruments
from youtube_to_midi import download_audio
from generate_MIDI import audio_to_midi
from drum_transcriber import drums_to_midi
from stem_separator import separate_stems, pick_stem_for_instrument, get_best_stem
from manage_instruments import get_all_sf2_files
from fluidsynth_player import FluidSynthPlayer


# ── Default instrument-to-soundfont mapping ─────────────────────────────
DEFAULT_SOUNDS = {
    "guitar": "nylon_guitar",
    "bass": 33,              # Electric bass (finger) — GM program 33
    "drums": "drums",        # GM percussion on channel 9 (drum_transcriber outputs correct notes)
    "piano": "acoustic_grand_piano",
    "vocals": "synth_lead",
    "other": "electric_piano",
}

# MIDI channel assignments
# Drums use channel 9 (GM percussion standard).
# drum_transcriber.py outputs proper GM percussion notes (36=kick, 38=snare, 42=hihat)
# so channel 9 now works correctly (unlike Basic Pitch which output random pitches).
CHANNEL_MAP = {
    "guitar": 0,
    "bass": 1,
    "piano": 2,
    "vocals": 3,
    "other": 4,
    "drums": 9,   # GM percussion channel
}


# ═══════════════════════════════════════════════════════════════════════
#  PIPELINE STEPS
# ═══════════════════════════════════════════════════════════════════════

def step_search(song, instruments):
    """
    Step 1: Search for the best cover of each instrument (parallel).
    Uses Perplexity AI if API key is set, otherwise parallel YouTube search.
    """
    print("\n" + "=" * 60)
    print("  STEP 1: SEARCH FOR COVERS (parallel)")
    print("=" * 60)

    results = search_covers_for_instruments(song, list(instruments.keys()))
    return results


def step_download(search_results):
    """
    Step 2: Download audio for each found cover (parallel).
    Returns {instrument: audio_path}.
    """
    print("\n" + "=" * 60)
    print("  STEP 2: DOWNLOAD AUDIO (parallel)")
    print("=" * 60)

    os.makedirs(AUDIO_DIR, exist_ok=True)
    audio_paths = {}

    def _download(instrument, url):
        print(f"  [{instrument}] Downloading...")
        path = download_audio(url, AUDIO_DIR)
        return instrument, path

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {}
        for inst, result in search_results.items():
            if result and "url" in result:
                futures[pool.submit(_download, inst, result["url"])] = inst

        for future in as_completed(futures):
            try:
                instrument, path = future.result()
                audio_paths[instrument] = path
                print(f"  [{instrument}] Done: {os.path.basename(path)}")
            except Exception as e:
                inst = futures[future]
                print(f"  [{inst}] Download failed: {e}")

    return audio_paths


def step_separate_if_needed(audio_paths, search_results):
    """
    Step 2.5: Conditionally run Demucs on audio that isn't solo.

    If Perplexity flagged a cover as not solo (e.g. guitar + vocals),
    run Demucs to isolate the target instrument. If it's already solo,
    pass the audio through untouched.

    Returns {instrument: audio_path} (updated paths).
    """
    needs_separation = {}
    clean_paths = {}

    for inst, audio_path in audio_paths.items():
        search_info = search_results.get(inst, {})
        is_solo = search_info.get("solo", True)
        needs_sep = search_info.get("needs_separation", False)

        if needs_sep or not is_solo:
            needs_separation[inst] = audio_path
        else:
            clean_paths[inst] = audio_path

    if not needs_separation:
        print("\n  [All covers are solo — skipping stem separation]")
        return audio_paths

    print("\n" + "=" * 60)
    print("  STEP 2.5: SEPARATE STEMS (for non-solo covers)")
    print("=" * 60)

    for inst, audio_path in needs_separation.items():
        search_info = search_results.get(inst, {})
        other_instruments = search_info.get("instruments_present", [])
        print(f"  [{inst}] Cover has: {', '.join(other_instruments)} → separating...")

        try:
            # Guitar and piano need 6-stem model for proper isolation.
            # 4-stem lumps them into "other" (mixed with synths, keys, etc.)
            # 6-stem gives them dedicated stems.
            needs_six = inst in ("guitar", "piano")

            if needs_six:
                print(f"  [{inst}] Using 6-stem model (dedicated {inst} isolation)")
            else:
                print(f"  [{inst}] Using 4-stem model (fast)")

            stems = separate_stems(audio_path, use_six_stems=needs_six)
            stem_name, stem_path = get_best_stem(stems, inst, use_six_stems=needs_six)
            clean_paths[inst] = stem_path
            print(f"  [{inst}] Using '{stem_name}' stem")
        except Exception as e:
            print(f"  [{inst}] Separation failed: {e} — using original audio")
            clean_paths[inst] = audio_path

    return clean_paths


def step_convert_to_midi(audio_paths):
    """
    Step 3: Convert each audio file to MIDI (parallel).
    Returns {instrument: midi_path}.
    """
    print("\n" + "=" * 60)
    print("  STEP 3: CONVERT TO MIDI (parallel)")
    print("=" * 60)

    os.makedirs(MIDI_OUTPUT_DIR, exist_ok=True)
    midi_paths = {}

    def _convert(instrument, audio_path):
        print(f"  [{instrument}] Converting to MIDI...")
        out_dir = os.path.join(MIDI_OUTPUT_DIR, f"band_{instrument}")

        if instrument == "drums":
            # Drums need specialized transcription (onset detection),
            # NOT Basic Pitch (which only works for pitched instruments)
            midi_path = drums_to_midi(audio_path, output_dir=out_dir)
        else:
            midi_path = audio_to_midi(audio_path, output_dir=out_dir)

        return instrument, midi_path

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {}
        for inst, path in audio_paths.items():
            futures[pool.submit(_convert, inst, path)] = inst

        for future in as_completed(futures):
            try:
                instrument, midi_path = future.result()
                midi_paths[instrument] = midi_path
                print(f"  [{instrument}] Done: {os.path.basename(midi_path)}")
            except Exception as e:
                inst = futures[future]
                print(f"  [{inst}] Conversion failed: {e}")

    return midi_paths


def step_play_band(midi_paths, instruments, speed=1.0, gain=0.8):
    """
    Step 4: Play all MIDI files simultaneously on separate FluidSynth channels.
    """
    print("\n" + "=" * 60)
    print("  STEP 4: PLAY FULL BAND")
    print("=" * 60)

    import pretty_midi

    # ── Find soundfont ──────────────────────────────────────────────
    sf2_files = get_all_sf2_files()
    if not sf2_files:
        print("  Error: No soundfont files found!")
        sys.exit(1)

    main_sf = sf2_files[0]

    # ── Initialize FluidSynth ───────────────────────────────────────
    player = FluidSynthPlayer(
        soundfont_path=main_sf,
        instrument="acoustic_grand_piano",
        gain=gain,
    )

    # ── Set up instruments on each channel ──────────────────────────
    for inst_type, sound in instruments.items():
        if inst_type not in midi_paths:
            continue

        channel = CHANNEL_MAP.get(inst_type, 0)

        if inst_type == "drums":
            # Channel 9 = GM percussion, must select bank 128
            player.fs.program_select(9, player.sfid, 128, 0)
            print(f"  Channel {channel}: drums → GM percussion (kick/snare/hihat)")
        elif isinstance(sound, int):
            player.fs.program_select(channel, player.sfid, 0, sound)
            print(f"  Channel {channel}: {inst_type} → program {sound}")
        elif isinstance(sound, str) and sound in FluidSynthPlayer.INSTRUMENTS:
            program = FluidSynthPlayer.INSTRUMENTS[sound]
            player.fs.program_select(channel, player.sfid, 0, program)
            print(f"  Channel {channel}: {inst_type} → {sound} (program {program})")

    # ── Load and merge all MIDI events ──────────────────────────────
    print(f"\n  Loading MIDI files...")
    all_events = []  # (time, type, channel, note, velocity)

    for inst_type, midi_path in midi_paths.items():
        channel = CHANNEL_MAP.get(inst_type, 0)
        midi = pretty_midi.PrettyMIDI(midi_path)

        note_count = 0
        for pm_instrument in midi.instruments:
            for note in pm_instrument.notes:
                all_events.append((note.start, "on", channel, note.pitch, note.velocity))
                all_events.append((note.end, "off", channel, note.pitch, 0))
                note_count += 1

        print(f"  [{inst_type}] {note_count} notes on channel {channel}")

    # Sort all events by time
    all_events.sort(key=lambda e: e[0])

    if not all_events:
        print("  No notes to play!")
        player.cleanup()
        return

    total_notes = sum(1 for e in all_events if e[1] == "on")
    duration = all_events[-1][0]
    print(f"\n  Total: {total_notes} notes, {duration:.1f}s")
    print(f"  Playing... (Ctrl+C to stop)\n")

    # ── Play all events in real time ────────────────────────────────
    NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
    start_time = time.time()

    try:
        for event_time, event_type, channel, pitch, velocity in all_events:
            # Wait until it's time
            target_time = start_time + (event_time / speed)
            now = time.time()
            wait = target_time - now
            if wait > 0:
                time.sleep(wait)

            # Fire the event
            if event_type == "on":
                player.fs.noteon(channel, pitch, velocity)
            else:
                player.fs.noteoff(channel, pitch)

    except KeyboardInterrupt:
        print("\n\n  Playback stopped.")

    # Let last notes ring
    time.sleep(0.5)
    for ch in CHANNEL_MAP.values():
        for note in range(128):
            player.fs.noteoff(ch, note)

    player.cleanup()
    print(f"\n  Playback finished.")


# ═══════════════════════════════════════════════════════════════════════
#  ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════

def run_full_band(song, instruments, speed=1.0, gain=0.8, play_mode="select"):
    """
    Full pipeline: search → download → separate (if needed) → convert → play.

    Args:
        song (str): Song name.
        instruments (dict): {extract_instrument: playback_sound}
            e.g. {"guitar": "nylon_guitar", "bass": 33, "drums": "drums"}
            extract_instrument = what cover to search for
            playback_sound = what soundfont sound to use
        speed (float): Playback speed.
        gain (float): Volume.
        play_mode (str): "select" = pick one instrument to play,
                         "all" = play all channels simultaneously.
    """
    start_time = time.time()

    print()
    print("╔" + "═" * 60 + "╗")
    print("║  Full Band Pipeline                                       ║")
    print("╠" + "═" * 60 + "╣")
    print(f"║  Song: {song[:52]:<52} ║")
    print(f"║                                                            ║")
    print(f"║  Extract → Play as:                                        ║")
    for extract, sound in instruments.items():
        label = f"  {extract} → {sound}"
        print(f"║  {label[:56]:<56}  ║")
    print(f"║                                                            ║")
    print(f"║  Speed: {speed}   Play mode: {play_mode:<30} ║")
    print("╚" + "═" * 60 + "╝")

    # Step 1: Search
    search_results = step_search(song, instruments)

    if not search_results:
        print("\n  No covers found for any instrument. Exiting.")
        sys.exit(1)

    # Step 2: Download (parallel)
    audio_paths = step_download(search_results)

    if not audio_paths:
        print("\n  No audio downloaded. Exiting.")
        sys.exit(1)

    # Step 2.5: Separate stems if any covers aren't solo (conditional)
    audio_paths = step_separate_if_needed(audio_paths, search_results)

    # Step 3: Convert to MIDI (parallel)
    midi_paths = step_convert_to_midi(audio_paths)

    if not midi_paths:
        print("\n  No MIDI files generated. Exiting.")
        sys.exit(1)

    elapsed = time.time() - start_time
    print(f"\n  Pipeline setup completed in {elapsed:.1f}s")
    print(f"  Processed {len(midi_paths)} instrument(s): {', '.join(midi_paths.keys())}")

    # Step 4: Play
    if play_mode == "all":
        step_play_band(midi_paths, instruments, speed=speed, gain=gain)
    else:
        # Interactive: let user pick which instrument to play
        step_play_select(midi_paths, instruments, speed=speed, gain=gain)

    total_time = time.time() - start_time
    print(f"\n  Total pipeline time: {total_time:.1f}s")


def step_play_select(midi_paths, instruments, speed=1.0, gain=0.8):
    """
    Step 4 (select mode): Let user pick which instrument to play one at a time.
    Loops so they can try each instrument.
    """
    import pretty_midi

    # ── Find soundfont ──────────────────────────────────────────────
    sf2_files = get_all_sf2_files()
    if not sf2_files:
        print("  Error: No soundfont files found!")
        sys.exit(1)

    main_sf = sf2_files[0]
    available = list(midi_paths.keys())

    while True:
        print("\n" + "=" * 60)
        print("  PLAY — Select an instrument")
        print("=" * 60)

        for i, inst in enumerate(available, 1):
            sound = instruments.get(inst, "default")
            print(f"    {i}. {inst} (sound: {sound})")
        print(f"    {len(available) + 1}. Play ALL together")
        print(f"    q. Quit")

        choice = input(f"\n  Pick (1-{len(available) + 1}, or q): ").strip().lower()

        if choice == "q":
            break

        try:
            idx = int(choice) - 1
        except ValueError:
            print("  Invalid choice.")
            continue

        if idx == len(available):
            # Play all
            step_play_band(midi_paths, instruments, speed=speed, gain=gain)
            continue

        if idx < 0 or idx >= len(available):
            print("  Invalid choice.")
            continue

        inst = available[idx]
        sound = instruments.get(inst, "acoustic_grand_piano")
        midi_path = midi_paths[inst]
        channel = CHANNEL_MAP.get(inst, 0)

        print(f"\n  Playing: {inst} → {sound}")

        # ── Initialize FluidSynth for single instrument ─────────
        player = FluidSynthPlayer(
            soundfont_path=main_sf,
            instrument="acoustic_grand_piano",
            gain=gain,
        )

        # Set the instrument sound
        if inst == "drums":
            # Drums play on channel 9 (GM percussion) with proper note mapping
            # Must explicitly select percussion bank (128) on channel 9
            channel = 9
            player.fs.program_select(9, player.sfid, 128, 0)
            print(f"  Sound: GM percussion (kick=36, snare=38, hihat=42)")
        elif isinstance(sound, int):
            channel = 0
            player.fs.program_select(0, player.sfid, 0, sound)
            print(f"  Sound: program {sound}")
        elif isinstance(sound, str) and sound in FluidSynthPlayer.INSTRUMENTS:
            channel = 0
            program = FluidSynthPlayer.INSTRUMENTS[sound]
            player.fs.program_select(0, player.sfid, 0, program)
            print(f"  Sound: {sound} (program {program})")
        else:
            channel = 0

        # ── Load MIDI and play ──────────────────────────────────
        midi = pretty_midi.PrettyMIDI(midi_path)
        events = []
        for pm_inst in midi.instruments:
            for note in pm_inst.notes:
                events.append((note.start, "on", note.pitch, note.velocity))
                events.append((note.end, "off", note.pitch, 0))

        events.sort(key=lambda e: e[0])

        if not events:
            print("  No notes found!")
            player.cleanup()
            continue

        total_notes = sum(1 for e in events if e[1] == "on")
        duration = events[-1][0]
        print(f"  Notes: {total_notes}, Duration: {duration:.1f}s")
        print(f"  Playing... (Ctrl+C to stop)\n")

        play_start = time.time()
        try:
            for event_time, event_type, pitch, velocity in events:
                target = play_start + (event_time / speed)
                wait = target - time.time()
                if wait > 0:
                    time.sleep(wait)

                if event_type == "on":
                    player.fs.noteon(channel, pitch, velocity)
                else:
                    player.fs.noteoff(channel, pitch)
        except KeyboardInterrupt:
            print("\n  Stopped.")

        time.sleep(0.3)
        player.all_notes_off()
        player.cleanup()

    print("\n  Done.")


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description=(
            "Full band pipeline: search for instrument covers, convert to MIDI, "
            "play with custom soundfont sounds.\n\n"
            "Three inputs:\n"
            "  1. Song name\n"
            "  2. Instruments to extract (what covers to search for)\n"
            "  3. Sounds to play with (what soundfont each instrument uses)"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Extract guitar, play as oud-like sound
  python3 full_band_pipeline.py "Cake By The Ocean" \\
      --extract guitar --sound nylon_guitar

  # Extract guitar and bass, pick custom sounds
  python3 full_band_pipeline.py "Hotel California" \\
      --extract guitar bass \\
      --sound nylon_guitar electric_bass

  # Full band: guitar + bass + drums
  python3 full_band_pipeline.py "Sugar" \\
      --extract guitar bass drums \\
      --sound steel_guitar electric_bass drums

  # Play all channels at once instead of picking one
  python3 full_band_pipeline.py "Sugar" \\
      --extract guitar bass drums \\
      --sound nylon_guitar electric_bass drums \\
      --play-all
        """,
    )
    parser.add_argument(
        "song",
        help="Song name to search for",
    )
    parser.add_argument(
        "--extract", "-e",
        nargs="+",
        required=True,
        help="Instruments to extract (covers to search for). "
             "e.g.: guitar bass drums piano vocals",
    )
    parser.add_argument(
        "--sound", "-snd",
        nargs="+",
        default=None,
        help="Soundfont sounds for each instrument (same order as --extract). "
             "e.g.: nylon_guitar electric_bass drums. "
             "Defaults: guitar→nylon_guitar, bass→33, drums→drums, "
             "piano→acoustic_grand_piano, vocals→synth_lead",
    )
    parser.add_argument(
        "--play-all",
        action="store_true",
        help="Play all instruments simultaneously (default: pick one at a time)",
    )
    parser.add_argument(
        "--speed", "-s",
        type=float,
        default=1.0,
        help="Playback speed (default: 1.0)",
    )
    parser.add_argument(
        "--gain", "-g",
        type=float,
        default=0.8,
        help="Volume 0.0-1.0 (default: 0.8)",
    )

    args = parser.parse_args()

    # ── Build instruments dict: {extract_instrument: playback_sound} ──
    extract_list = args.extract
    sound_list = args.sound or []

    instruments = {}
    for i, extract in enumerate(extract_list):
        if i < len(sound_list):
            sound = sound_list[i]
            # Try to convert to int if it's a number (GM program)
            try:
                sound = int(sound)
            except ValueError:
                pass
        else:
            # Use defaults
            sound = DEFAULT_SOUNDS.get(extract, "acoustic_grand_piano")

        instruments[extract] = sound

    print(f"\n  Instrument mapping:")
    for extract, sound in instruments.items():
        print(f"    Search for: {extract:10s} → Play as: {sound}")

    run_full_band(
        song=args.song,
        instruments=instruments,
        speed=args.speed,
        gain=args.gain,
        play_mode="all" if args.play_all else "select",
    )


if __name__ == "__main__":
    main()
