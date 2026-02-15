"""
Session — Configuration and state for an air guitar session.

Tracks everything about the current play session: instrument, soundfont,
and recorded MIDI events from the CV session.
"""

from __future__ import annotations

import os
import json
import time
from dataclasses import dataclass, field, asdict
from typing import Optional

# ── Paths ────────────────────────────────────────────────────────────────
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SOUNDFONT_DIR = os.path.join(REPO_DIR, "soundfonts")
SESSIONS_DIR = os.path.join(REPO_DIR, "app", "sessions")


# ── Plucked string instruments ───────────────────────────────────────────
# These are the instruments the user can choose to "play" with air guitar.
# Maps display name → FluidSynth GM instrument name.

PLUCKED_INSTRUMENTS = {
    "Nylon Guitar":       "nylon_guitar",
    "Steel Guitar":       "steel_guitar",
    "Electric Clean":     "electric_guitar_clean",
    "Electric Muted":     "electric_guitar_muted",
    "Overdriven Guitar":  "overdriven_guitar",
    "Distortion Guitar":  "distortion_guitar",
    "Acoustic Bass":      "acoustic_bass",
    "Electric Bass":      "electric_bass_finger",
    "Slap Bass":          "slap_bass_1",
    "Banjo":              "banjo",
    "Sitar":              "sitar",
    "Shamisen":           "shamisen",
    "Koto":               "koto",
    "Ukulele":            "nylon_guitar",     # closest GM match
    "Harp":               "orchestral_harp",
}


# ── Instrument info ──────────────────────────────────────────────────────

@dataclass
class InstrumentInfo:
    """Resolved instrument: name, GM program, and soundfont path."""
    display_name: str = ""
    gm_name: str = "nylon_guitar"
    bank: int = 0
    program: int = 24
    soundfont_path: Optional[str] = None  # None = use default
    source: str = "gm"                    # gm | sf2 | downloaded


# ── Session dataclass ────────────────────────────────────────────────────

@dataclass
class Session:
    """
    Full state of a play session.

    Created at the start of the flow, progressively filled in as each
    step completes, and optionally saved to disk when recording finishes.
    """

    # ── Instrument ───────────────────────────────────────────────────
    instrument: InstrumentInfo = field(default_factory=InstrumentInfo)

    # ── CV recording ─────────────────────────────────────────────────
    recorded_events: list = field(default_factory=list)
    recording_duration: float = 0.0

    # ── Metadata ─────────────────────────────────────────────────────
    created_at: float = field(default_factory=time.time)
    session_id: str = ""

    def __post_init__(self):
        if not self.session_id:
            self.session_id = f"session_{int(self.created_at)}_{os.getpid()}"

    def save(self, output_dir: Optional[str] = None) -> str:
        """Save session state to a JSON file. Returns the file path."""
        if output_dir is None:
            output_dir = SESSIONS_DIR
        os.makedirs(output_dir, exist_ok=True)

        path = os.path.join(output_dir, f"{self.session_id}.json")
        data = {
            "session_id": self.session_id,
            "instrument": asdict(self.instrument),
            "recorded_events": self.recorded_events,
            "recording_duration": self.recording_duration,
            "created_at": self.created_at,
        }
        with open(path, "w") as f:
            json.dump(data, f, indent=2)

        return path

    def summary(self) -> str:
        """One-line summary of the session for display."""
        parts = []
        if self.instrument.display_name:
            parts.append(f"Instrument: {self.instrument.display_name}")
        if self.recorded_events:
            parts.append(f"Events: {len(self.recorded_events)}")
        return " | ".join(parts) if parts else "Empty session"
