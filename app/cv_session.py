"""
CV Session — Computer vision recording session.

Launches the vision server (webcam + hand tracking + WebSocket) configured
with the chosen instrument's soundfont and program number.

The phone fretboard provides melody, air strums provide rhythm.

Usage:
    from app.cv_session import start_cv_session
    from app.session import Session

    session = Session()
    events = start_cv_session(session)
"""

from __future__ import annotations

import os
import sys
import json
import subprocess


# ── Path setup ───────────────────────────────────────────────────────────
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VISION_DIR = os.path.join(REPO_DIR, "vision")


# ═══════════════════════════════════════════════════════════════════════
#  SESSION LAUNCHER
# ═══════════════════════════════════════════════════════════════════════

def start_cv_session(session) -> list[dict]:
    """
    Launch the CV recording session.

    Starts the vision server (``vision/server.py``) which:
    1. Opens the webcam and runs MediaPipe hand tracking
    2. Streams video to the browser via WebSocket (port 8766)
    3. Listens for phone fretboard input via WebSocket (port 8765)
    4. Records MIDI events when the browser sends "start"
    5. Returns MIDI events when the browser sends "stop"

    Args:
        session: A Session object with instrument info.

    Returns:
        list[dict]: Recorded MIDI events (empty if session was cancelled).
    """
    print()
    print("╔" + "═" * 55 + "╗")
    print("║  Computer Vision Session                           ║")
    print("╠" + "═" * 55 + "╣")

    if session.instrument.display_name:
        inst = session.instrument.display_name
        if len(inst) > 42:
            inst = inst[:39] + "..."
        print(f"║  Instrument: {inst:<42} ║")

    print(f"║  Phone:      Required for melody                    ║")
    print("╚" + "═" * 55 + "╝")

    # ── Set up environment for the vision server ─────────────────────
    env = os.environ.copy()
    env["AIRGUITAR_SESSION_ID"] = session.session_id

    if session.instrument.soundfont_path:
        env["AIRGUITAR_SOUNDFONT"] = session.instrument.soundfont_path
    env["AIRGUITAR_PROGRAM"] = str(session.instrument.program)
    env["AIRGUITAR_BANK"] = str(session.instrument.bank)

    # ── Launch the vision server ─────────────────────────────────────
    print()
    print("  Starting vision server...")
    print("  ─────────────────────────────────────────────")
    print(f"  Phone fretboard WS  → ws://localhost:8765")
    print(f"  Browser video WS    → ws://localhost:8766")
    print(f"  Website             → http://localhost:3000")
    print()
    print("  Use the phone fretboard for melody (notes)")
    print("  Strum in the air for rhythm")
    print("  Connect phone to ws://YOUR_IP:8765")
    print()
    print("  Press Ctrl+C to stop the session.")
    print("  Or use the browser UI to start/stop recording.")
    print()

    # Run server.py as a subprocess so it gets the env vars
    server_script = os.path.join(VISION_DIR, "server.py")

    try:
        subprocess.run(
            [sys.executable, server_script],
            env=env,
            cwd=VISION_DIR,
        )
    except KeyboardInterrupt:
        print("\n  Session ended by user.")

    # ── Collect results ──────────────────────────────────────────────
    events_output = os.path.join(
        REPO_DIR, "app", "sessions", f"{session.session_id}_recorded.json"
    )
    if os.path.exists(events_output):
        with open(events_output) as f:
            events = json.load(f)
        print(f"\n  Recorded {len(events)} MIDI events.")
        return events

    return []
