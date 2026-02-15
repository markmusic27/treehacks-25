#!/usr/bin/env python3
"""
Air Guitar — Main Entry Point

Orchestrates the full flow:

    ┌─────────────────────────────────────────────────────────┐
    │                                                         │
    │   1. PICK INSTRUMENT                                    │
    │      └── Plucked string instrument (guitar, bass, etc.) │
    │                                                         │
    │   2. SOUNDFONT CHECK                                    │
    │      ├── Check if instrument soundfont exists locally   │
    │      └── Download from internet if missing              │
    │                                                         │
    │   3. CV SESSION                                         │
    │      ├── Open webcam + hand tracking                    │
    │      ├── Stream to browser via WebSocket                │
    │      ├── Phone fretboard for melody, strum for rhythm   │
    │      └── Record MIDI events                             │
    │                                                         │
    │   4. SAVE SESSION                                       │
    │      └── Save recorded events + metadata to JSON        │
    │                                                         │
    └─────────────────────────────────────────────────────────┘

Usage:
    # Interactive (recommended)
    python3 -m app

    # With instrument pre-selected
    python3 -m app --instrument "Nylon Guitar"
"""

import os
import sys
import argparse

# ── Path setup ───────────────────────────────────────────────────────────
APP_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(APP_DIR)
if APP_DIR not in sys.path:
    sys.path.insert(0, APP_DIR)

try:
    from app.session import Session, InstrumentInfo, PLUCKED_INSTRUMENTS
    from app.instrument_setup import pick_instrument, resolve_soundfont
    from app.cv_session import start_cv_session
except ImportError:
    from session import Session, InstrumentInfo, PLUCKED_INSTRUMENTS
    from instrument_setup import pick_instrument, resolve_soundfont
    from cv_session import start_cv_session


# ═══════════════════════════════════════════════════════════════════════
#  MAIN FLOW
# ═══════════════════════════════════════════════════════════════════════

def run_flow(session: Session) -> None:
    """
    Single flow:
        1. Pick instrument
        2. Resolve soundfont (check / download)
        3. CV session (phone fretboard + strum detection)
        4. Save
    """
    # ── Step 1: Pick instrument ──────────────────────────────────────
    instrument = pick_instrument()
    session.instrument = instrument

    # ── Step 2: Resolve soundfont ────────────────────────────────────
    session.instrument = resolve_soundfont(session.instrument)

    # ── Step 3: Launch CV session ────────────────────────────────────
    print()
    print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    print(f"  Ready to play!")
    print(f"  Instrument: {session.instrument.display_name}")
    print()
    print("  Connect your phone to ws://YOUR_IP:8765")
    print("  Phone fretboard = melody, air strum = rhythm.")
    print("  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    _prompt_ready()

    events = start_cv_session(session)
    session.recorded_events = events

    # ── Step 4: Save session ─────────────────────────────────────────
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
        description="Air Guitar — pick an instrument, strum in the air.",
    )
    parser.add_argument(
        "--instrument", "-i",
        default=None,
        help="Instrument display name (e.g. 'Nylon Guitar', 'Steel Guitar')",
    )

    args = parser.parse_args()

    # ── Banner ───────────────────────────────────────────────────────
    print()
    print("╔" + "═" * 55 + "╗")
    print("║                AIR GUITAR                           ║")
    print("╠" + "═" * 55 + "╣")
    print("║  Pick an instrument, check the soundfont, play.     ║")
    print("╚" + "═" * 55 + "╝")

    # ── Create session ───────────────────────────────────────────────
    session = Session()

    # ── Pre-fill instrument from CLI if provided ─────────────────────
    if args.instrument:
        matched = False
        for display, gm in PLUCKED_INSTRUMENTS.items():
            if display.lower() == args.instrument.lower():
                session.instrument = InstrumentInfo(display_name=display, gm_name=gm)
                matched = True
                break
        if not matched:
            session.instrument = InstrumentInfo(
                display_name=args.instrument,
                gm_name=args.instrument.lower().replace(" ", "_"),
            )

    # ── Run ──────────────────────────────────────────────────────────
    run_flow(session)

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
