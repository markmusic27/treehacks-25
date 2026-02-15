"""
CV Session — Computer vision recording session.

Launches the vision server (webcam + hand tracking + WebSocket) with
configuration appropriate for the current session mode:

  - **Beginner**: MIDI-guided mode. The reference MIDI file is loaded and
    each strum plays the *next note* from the sequence (rhythm only, no
    phone needed).
  - **Hard**: Free-play mode. The phone fretboard provides melody; strums
    provide rhythm. No MIDI reference.

Usage:
    from app.cv_session import start_cv_session
    from app.session import Session, Mode

    session = Session(mode=Mode.BEGINNER, midi_path="/path/to/song.mid")
    events = start_cv_session(session)
    # events = [{"time": 0.3, "midi_note": 60, ...}, ...]
"""

from __future__ import annotations

import os
import sys
import json
import time
import threading
import subprocess
from typing import Optional

# ── Path setup ───────────────────────────────────────────────────────────
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VISION_DIR = os.path.join(REPO_DIR, "vision")


# ═══════════════════════════════════════════════════════════════════════
#  MIDI NOTE LOADER (beginner mode)
# ═══════════════════════════════════════════════════════════════════════

def load_midi_notes(midi_path: str) -> list[dict]:
    """
    Load notes from a MIDI file into a time-sorted list.

    Each note has: start, end, pitch, velocity, name.
    Used in beginner mode to feed notes on each strum.

    Returns:
        list[dict]: Sorted by start time.
    """
    try:
        import pretty_midi
    except ImportError:
        print("[CV Session] pretty_midi not installed. Run: pip install pretty_midi")
        return []

    pm = pretty_midi.PrettyMIDI(midi_path)

    notes = []
    _NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    for instrument in pm.instruments:
        if instrument.is_drum:
            continue
        for note in instrument.notes:
            octave = (note.pitch // 12) - 1
            name = f"{_NOTE_NAMES[note.pitch % 12]}{octave}"
            notes.append({
                "start": note.start,
                "end": note.end,
                "pitch": note.pitch,
                "velocity": note.velocity,
                "duration": note.end - note.start,
                "name": name,
            })

    notes.sort(key=lambda n: n["start"])

    print(f"  Loaded {len(notes)} notes from MIDI reference")
    if notes:
        duration = notes[-1]["end"]
        print(f"  Duration: {duration:.1f}s")

    return notes


# ═══════════════════════════════════════════════════════════════════════
#  SESSION LAUNCHER
# ═══════════════════════════════════════════════════════════════════════

def start_cv_session(session) -> list[dict]:
    """
    Launch the CV recording session.

    This starts the vision server (``vision/server.py``) which:
    1. Opens the webcam and runs MediaPipe hand tracking
    2. Streams video to the browser via WebSocket (port 8766)
    3. Listens for phone fretboard input via WebSocket (port 8765)
    4. Records MIDI events when the browser sends "start"
    5. Returns MIDI events when the browser sends "stop"

    For **beginner mode**, the MIDI reference is loaded and passed to the
    server via environment variables so strums play sequential MIDI notes.

    For **hard mode**, the server runs in its default free-play mode
    where the phone fretboard provides melody.

    Args:
        session: A Session object with mode, midi_path, instrument, etc.

    Returns:
        list[dict]: Recorded MIDI events (empty if session was cancelled).
    """
    try:
        from app.session import Mode
    except ImportError:
        from session import Mode

    print()
    print("╔" + "═" * 55 + "╗")
    print("║  Computer Vision Session                           ║")
    print("╠" + "═" * 55 + "╣")

    mode_str = "Beginner (rhythm only)" if session.mode == Mode.BEGINNER else "Hard (rhythm + melody)"
    print(f"║  Mode:       {mode_str:<42} ║")

    if session.instrument.display_name:
        print(f"║  Instrument: {session.instrument.display_name:<42} ║")
    if session.midi_path and session.mode == Mode.BEGINNER:
        midi_name = os.path.basename(session.midi_path)
        if len(midi_name) > 42:
            midi_name = midi_name[:39] + "..."
        print(f"║  MIDI ref:   {midi_name:<42} ║")
    if session.mode == Mode.HARD:
        print(f"║  Phone:      Required for melody                    ║")

    print("╚" + "═" * 55 + "╝")

    # ── Load MIDI reference for beginner mode ────────────────────────
    midi_notes = []
    if session.mode == Mode.BEGINNER and session.midi_path:
        print()
        print("  Loading MIDI reference...")
        midi_notes = load_midi_notes(session.midi_path)
        if not midi_notes:
            print("  WARNING: No notes in MIDI file. Falling back to free-play.")

    # ── Set up environment for the vision server ─────────────────────
    env = os.environ.copy()

    # Pass session config via environment variables
    env["AIRGUITAR_MODE"] = session.mode.value
    env["AIRGUITAR_SESSION_ID"] = session.session_id

    if session.instrument.soundfont_path:
        env["AIRGUITAR_SOUNDFONT"] = session.instrument.soundfont_path
    env["AIRGUITAR_PROGRAM"] = str(session.instrument.program)
    env["AIRGUITAR_BANK"] = str(session.instrument.bank)

    if midi_notes:
        # Write MIDI notes to a temp JSON for the server to read
        notes_path = os.path.join(REPO_DIR, "app", "sessions", f"{session.session_id}_notes.json")
        os.makedirs(os.path.dirname(notes_path), exist_ok=True)
        with open(notes_path, "w") as f:
            json.dump(midi_notes, f)
        env["AIRGUITAR_MIDI_NOTES"] = notes_path

    # ── Launch the vision server ─────────────────────────────────────
    print()
    print("  Starting vision server...")
    print("  ─────────────────────────────────────────────")
    print(f"  Phone fretboard WS  → ws://localhost:8765")
    print(f"  Browser video WS    → ws://localhost:8766")
    print(f"  Website             → http://localhost:3000")
    print()

    if session.mode == Mode.BEGINNER:
        print("  BEGINNER MODE:")
        print("  • Strum in the air to play notes from the song")
        print("  • Notes are pre-loaded from the MIDI reference")
        print("  • Phone is NOT required")
    else:
        print("  HARD MODE:")
        print("  • Use the phone fretboard for melody (notes)")
        print("  • Strum in the air for rhythm")
        print("  • Connect phone to ws://YOUR_IP:8765")

    print()
    print("  Press Ctrl+C to stop the session.")
    print("  Or use the browser UI to start/stop recording.")
    print()

    # Run server.py as a subprocess so it gets the env vars
    server_script = os.path.join(VISION_DIR, "server.py")

    try:
        proc = subprocess.run(
            [sys.executable, server_script],
            env=env,
            cwd=VISION_DIR,
        )
    except KeyboardInterrupt:
        print("\n  Session ended by user.")

    # ── Collect results ──────────────────────────────────────────────
    # Check if the server wrote any recorded events
    events_output = os.path.join(
        REPO_DIR, "app", "sessions", f"{session.session_id}_recorded.json"
    )
    if os.path.exists(events_output):
        with open(events_output) as f:
            events = json.load(f)
        print(f"\n  Recorded {len(events)} MIDI events.")
        return events

    return []


def start_cv_session_direct(session) -> None:
    """
    Launch the CV session by directly importing and running the vision
    server in-process. This is useful for tighter integration but means
    the vision server runs in the same Python process.

    This is an alternative to start_cv_session() which uses subprocess.
    """
    try:
        from app.session import Mode
    except ImportError:
        from session import Mode

    # Patch the vision config before importing the server
    vision_config_path = os.path.join(VISION_DIR, "config.py")

    # Add vision dir to path so we can import
    if VISION_DIR not in sys.path:
        sys.path.insert(0, VISION_DIR)

    # Set environment variables that server.py can read
    os.environ["AIRGUITAR_MODE"] = session.mode.value
    os.environ["AIRGUITAR_PROGRAM"] = str(session.instrument.program)

    if session.instrument.soundfont_path:
        os.environ["AIRGUITAR_SOUNDFONT"] = session.instrument.soundfont_path

    print()
    print("  Launching vision server (in-process)...")
    print("  Press Ctrl+C to stop.")
    print()

    try:
        from server import main as server_main
        server_main()
    except KeyboardInterrupt:
        print("\n  Session ended.")
