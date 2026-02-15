#!/usr/bin/env python3
"""
Air Guitar — Main Entry Point

Orchestrates the full flow:

    ┌─────────────────────────────────────────────────────────────┐
    │                                                             │
    │   1. PICK MODE                                              │
    │      ├── Beginner (rhythm only)                             │
    │      └── Hard (rhythm + melody)                             │
    │                                                             │
    │   2. PICK INSTRUMENT                                        │
    │      └── Plucked string instrument (guitar, bass, etc.)     │
    │                                                             │
    │   3. SONG SETUP (beginner only)                             │
    │      ├── Search for song via Perplexity / YouTube           │
    │      ├── Download the cover audio                           │
    │      ├── Separate stems (isolate the instrument)            │
    │      └── Convert to MIDI (note reference for rhythm mode)   │
    │                                                             │
    │   4. SOUNDFONT CHECK                                        │
    │      ├── Check if instrument soundfont exists locally       │
    │      └── Download from internet if missing                  │
    │                                                             │
    │   5. CV SESSION                                             │
    │      ├── Open webcam + hand tracking                        │
    │      ├── Stream to browser via WebSocket                    │
    │      ├── Beginner: strum → play next MIDI note              │
    │      ├── Hard: phone fretboard → melody, strum → rhythm     │
    │      └── Record MIDI events                                 │
    │                                                             │
    │   6. SAVE SESSION                                           │
    │      └── Save recorded events + metadata to JSON            │
    │                                                             │
    └─────────────────────────────────────────────────────────────┘

Usage:
    # Interactive mode (recommended)
    python3 -m app.main

    # Direct beginner mode
    python3 -m app.main --mode beginner --song "Seven Nation Army" --instrument "Steel Guitar"

    # Direct hard mode
    python3 -m app.main --mode hard --instrument "Nylon Guitar"
"""

import os
import sys
import argparse

# ── Path setup ───────────────────────────────────────────────────────────
# Make sure the app package is importable when run directly
APP_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(APP_DIR)
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

try:
    from app.session import Session, Mode, InstrumentInfo, PLUCKED_INSTRUMENTS
    from app.song_search import search_song
    from app.instrument_setup import pick_instrument, resolve_soundfont
    from app.midi_prep import prepare_midi
    from app.cv_session import start_cv_session
except ImportError:
    from session import Session, Mode, InstrumentInfo, PLUCKED_INSTRUMENTS
    from song_search import search_song
    from instrument_setup import pick_instrument, resolve_soundfont
    from midi_prep import prepare_midi
    from cv_session import start_cv_session


# ═══════════════════════════════════════════════════════════════════════
#  STEP 1: MODE SELECTION
# ═══════════════════════════════════════════════════════════════════════

def step_pick_mode() -> Mode:
    """Interactive mode selection."""
    print()
    print("╔" + "═" * 55 + "╗")
    print("║              🎸  AIR GUITAR  🎸                    ║")
    print("╠" + "═" * 55 + "╣")
    print("║                                                     ║")
    print("║  Choose your mode:                                  ║")
    print("║                                                     ║")
    print("║    1. BEGINNER                                      ║")
    print("║       Pick a song, strum along to the rhythm.       ║")
    print("║       Notes come from the song — just keep time!    ║")
    print("║       (Phone NOT required)                          ║")
    print("║                                                     ║")
    print("║    2. HARD                                          ║")
    print("║       Full control: melody + rhythm.                ║")
    print("║       Use phone fretboard for notes, strum in air.  ║")
    print("║       (Phone REQUIRED)                              ║")
    print("║                                                     ║")
    print("╚" + "═" * 55 + "╝")
    print()

    while True:
        try:
            choice = input("  Enter 1 (Beginner) or 2 (Hard): ").strip()
            if choice == "1":
                return Mode.BEGINNER
            elif choice == "2":
                return Mode.HARD
            print("  Please enter 1 or 2.")
        except (EOFError, KeyboardInterrupt):
            print("\n  Goodbye!")
            sys.exit(0)


# ═══════════════════════════════════════════════════════════════════════
#  STEP 2: SONG SEARCH (beginner mode)
# ═══════════════════════════════════════════════════════════════════════

def step_pick_song(instrument_gm_name: str) -> dict:
    """Interactive song selection (beginner mode)."""
    print()
    print("=" * 55)
    print("  Pick a Song")
    print("=" * 55)
    print()

    while True:
        try:
            song_name = input("  Song name (e.g. 'Seven Nation Army'): ").strip()
            if song_name:
                break
            print("  Please enter a song name.")
        except (EOFError, KeyboardInterrupt):
            print("\n  Goodbye!")
            sys.exit(0)

    # Map GM name to a search-friendly instrument name
    instrument_search = instrument_gm_name.replace("_", " ")
    # Simplify for search: "electric guitar clean" → "guitar"
    for keyword in ("guitar", "bass", "piano", "harp", "banjo", "sitar"):
        if keyword in instrument_search:
            instrument_search = keyword
            break

    result = search_song(song_name, instrument=instrument_search)

    if result is None:
        print("\n  Could not find a cover. Try a different song?")
        return step_pick_song(instrument_gm_name)  # retry

    return {
        "song_name": song_name,
        "url": result["url"],
        "title": result["title"],
        "source": result["source"],
    }


# ═══════════════════════════════════════════════════════════════════════
#  FLOW: BEGINNER MODE
# ═══════════════════════════════════════════════════════════════════════

def run_beginner_flow(session: Session) -> None:
    """
    Beginner mode flow:
        1. Pick instrument
        2. Pick song → search cover
        3. Resolve soundfont
        4. Download + separate + MIDI
        5. CV session (rhythm only)
        6. Save
    """
    # Step 2: Pick instrument
    instrument = pick_instrument()
    session.instrument = instrument

    # Step 2b: Resolve soundfont (check/download)
    session.instrument = resolve_soundfont(session.instrument)

    # Step 3: Pick song
    song_info = step_pick_song(instrument.gm_name)
    session.song_name = song_info["song_name"]
    session.song_url = song_info["url"]
    session.song_title = song_info["title"]
    session.song_query = f"{song_info['song_name']} {instrument.gm_name} cover"

    # Step 4: Prepare MIDI reference
    print()
    print("  Preparing your song... This may take a minute.")
    midi_path, audio_path = prepare_midi(
        song_url=session.song_url,
        instrument_name=session.instrument.gm_name,
    )
    session.midi_path = midi_path
    session.audio_path = audio_path

    # Step 5: Launch CV session
    print()
    print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  Ready to play!")
    print(f"  Song:       {session.song_name}")
    print(f"  Instrument: {session.instrument.display_name}")
    print(f"  Mode:       Beginner (strum to the rhythm)")
    print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    _prompt_ready()

    events = start_cv_session(session)
    session.recorded_events = events

    # Step 6: Save session
    path = session.save()
    print(f"\n  Session saved: {path}")


# ═══════════════════════════════════════════════════════════════════════
#  FLOW: HARD MODE
# ═══════════════════════════════════════════════════════════════════════

def run_hard_flow(session: Session) -> None:
    """
    Hard mode flow:
        1. Pick instrument
        2. Resolve soundfont
        3. CV session (rhythm + melody, phone required)
        4. Save
    """
    # Step 2: Pick instrument
    instrument = pick_instrument()
    session.instrument = instrument

    # Step 2b: Resolve soundfont
    session.instrument = resolve_soundfont(session.instrument)

    # Step 3: Launch CV session
    print()
    print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  Ready to play!")
    print(f"  Instrument: {session.instrument.display_name}")
    print(f"  Mode:       Hard (full control)")
    print()
    print("  IMPORTANT: Connect your phone to ws://YOUR_IP:8765")
    print("  The phone fretboard provides the melody notes.")
    print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    _prompt_ready()

    events = start_cv_session(session)
    session.recorded_events = events

    # Step 4: Save session
    path = session.save()
    print(f"\n  Session saved: {path}")


# ═══════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════

def _prompt_ready():
    """Pause until the user is ready."""
    print()
    try:
        input("  Press Enter when ready to start... ")
    except (EOFError, KeyboardInterrupt):
        print("\n  Goodbye!")
        sys.exit(0)


# ═══════════════════════════════════════════════════════════════════════
#  CLI ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Air Guitar — pick a mode, pick a song, strum in the air.",
    )
    parser.add_argument(
        "--mode", "-m",
        choices=["beginner", "hard"],
        default=None,
        help="Play mode: beginner (rhythm) or hard (rhythm + melody)",
    )
    parser.add_argument(
        "--song", "-s",
        default=None,
        help="Song name (beginner mode). Triggers automatic search.",
    )
    parser.add_argument(
        "--instrument", "-i",
        default=None,
        help="Instrument display name (e.g. 'Nylon Guitar', 'Steel Guitar')",
    )
    parser.add_argument(
        "--song-url",
        default=None,
        help="Direct YouTube URL (skip search)",
    )

    args = parser.parse_args()

    # ── Create session ───────────────────────────────────────────────
    session = Session()

    # ── Mode ─────────────────────────────────────────────────────────
    if args.mode:
        session.mode = Mode(args.mode)
    else:
        session.mode = step_pick_mode()

    # ── Handle CLI arguments for non-interactive flow ────────────────
    if args.instrument:
        # Find the matching instrument
        matched = False
        for display, gm in PLUCKED_INSTRUMENTS.items():
            if display.lower() == args.instrument.lower():
                session.instrument = InstrumentInfo(display_name=display, gm_name=gm)
                matched = True
                break
        if not matched:
            # Try as a GM name
            session.instrument = InstrumentInfo(
                display_name=args.instrument,
                gm_name=args.instrument.lower().replace(" ", "_"),
            )

    # ── Run the appropriate flow ─────────────────────────────────────
    if session.mode == Mode.BEGINNER:
        # If song was provided via CLI, inject it
        if args.song:
            session.song_name = args.song
        if args.song_url:
            session.song_url = args.song_url
        run_beginner_flow(session)
    else:
        run_hard_flow(session)

    # ── Done ─────────────────────────────────────────────────────────
    print()
    print("=" * 55)
    print("  Session Complete!")
    print("=" * 55)
    print(f"  {session.summary()}")
    if session.recorded_events:
        print(f"  Recorded: {len(session.recorded_events)} MIDI events")
    print()


if __name__ == "__main__":
    main()
