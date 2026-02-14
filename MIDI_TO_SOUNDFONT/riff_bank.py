#!/usr/bin/env python3
"""
Riff bank for instrument testing.

Each riff is a list of timed note events:
    ("NOTE_NAME", duration_seconds)
or timed chords:
    (("NOTE1", "NOTE2", "NOTE3"), duration_seconds)
"""

RIFFS = {
    "smoke_on_the_water": [
        ("G3", 0.18), ("A#3", 0.18), ("C4", 0.32),
        ("G3", 0.18), ("A#3", 0.18), ("C#4", 0.18), ("C4", 0.40),
        ("G3", 0.18), ("A#3", 0.18), ("C4", 0.32),
        ("G3", 0.18), ("A#3", 0.18), ("C#4", 0.18), ("C4", 0.48),
    ],
    "seven_nation_army": [
    # Phrase 1:  E E G E D C B (descend) → low E resolve
    ("E4", 0.30), ("E4", 0.22), ("G4", 0.30), ("E4", 0.30),
    ("D4", 0.34), ("C4", 0.38), ("B3", 0.50), ("E3", 0.70),

    # Phrase 2: repeat
    ("E4", 0.30), ("E4", 0.22), ("G4", 0.30), ("E4", 0.30),
    ("D4", 0.34), ("C4", 0.38), ("B3", 0.50), ("E3", 0.70),

    # Phrase 3: turnaround walk-back
    ("E4", 0.30), ("E4", 0.22), ("G4", 0.30), ("E4", 0.30),
    ("D4", 0.26), ("C4", 0.26), ("D4", 0.26), ("C4", 0.26),
    ("B3", 0.50), ("E3", 0.76),

    # Phrase 4: final → long low E sustain
    ("E4", 0.30), ("E4", 0.22), ("G4", 0.30), ("E4", 0.30),
    ("D4", 0.36), ("C4", 0.44), ("B3", 0.56), ("E3", 2.00),
    ],

    "back_in_black_simplified": [
        ("E3", 0.18), ("G3", 0.18), ("A3", 0.28), ("G3", 0.18),
        ("E3", 0.18), ("G3", 0.18), ("D3", 0.28), ("G3", 0.28),
    ],

    "blinding_lights": [
    # Blinding Lights-style synth hook (tight 8th-note feel)
    # Phrase A
    ("F4", 0.22), ("F4", 0.22), ("C5", 0.22), ("A#4", 0.22), ("G#4", 0.28),
    ("F4", 0.22), ("F4", 0.22), ("C5", 0.22), ("A#4", 0.22), ("G#4", 0.32),
    ("REST", 0.10),

    # Phrase B (answer)
    ("G#4", 0.22), ("A#4", 0.22), ("C5", 0.22), ("A#4", 0.22), ("G#4", 0.28),
    ("F4", 0.22), ("D#4", 0.22), ("F4", 0.22), ("G#4", 0.22), ("A#4", 0.32),
    ("REST", 0.10),

    # Phrase C (lift)
    ("C5", 0.22), ("A#4", 0.22), ("G#4", 0.22), ("F4", 0.22), ("D#4", 0.28),
    ("F4", 0.22), ("G#4", 0.22), ("A#4", 0.22), ("C5", 0.22), ("A#4", 0.36),
    ("REST", 0.10),

    # Final resolve
    ("G#4", 0.24), ("F4", 0.24), ("D#4", 0.24), ("F4", 0.24),
    ("G#4", 0.28), ("A#4", 0.36), ("C5", 0.90),
],
}


DEFAULT_RIFF = "smoke_on_the_water"


def get_riff(name: str):
    """Return riff by name; falls back to DEFAULT_RIFF."""
    return RIFFS.get(name, RIFFS[DEFAULT_RIFF])

