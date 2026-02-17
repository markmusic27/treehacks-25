"""
Note engine: maps air-instrument inputs to MIDI note parameters.

Inputs
------
- ``string_index``  : which string is pressed on the phone fretboard
- ``fret_y``        : touch y-position (0-1) → semitone offset within an octave
- ``pole_position`` : hand position along the physical pole (0-1) → octave
- ``strum_velocity``: raw perpendicular crossing speed → MIDI velocity + duration

Output
------
A ``NoteResult`` with MIDI note, velocity, duration, and human-readable name.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .config import (
    MIDI_VELOCITY_MAX,
    MIDI_VELOCITY_MIN,
    NOTE_DURATION_MAX,
    NOTE_DURATION_MIN,
    NUM_FRETS,
    POLE_SEMITONE_RANGE,
    STRING_BASE_MIDI,
    STRUM_VEL_MAP_MAX,
    STRUM_VEL_MAP_MIN,
)

# MIDI note names for display
_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def midi_note_name(midi_note: int) -> str:
    """Return a human-readable name like 'C4' for a MIDI note number."""
    octave = (midi_note // 12) - 1
    name = _NOTE_NAMES[midi_note % 12]
    return f"{name}{octave}"


@dataclass
class NoteResult:
    """Result of a note computation."""

    midi_note: int
    velocity: int      # 0-127
    duration: float    # seconds
    name: str          # human-readable, e.g. "C4"


class NoteEngine:
    """
    Maps air-instrument inputs to MIDI notes.

    Parameters
    ----------
    num_strings : int
        Number of strings on the phone fretboard (3-6).
    """

    def __init__(self, num_strings: int = 6) -> None:
        self.num_strings = max(3, min(6, num_strings))
        self.base_midi = STRING_BASE_MIDI[self.num_strings]

    # -----------------------------------------------------------------
    # Public API
    # -----------------------------------------------------------------
    def compute_note(
        self,
        string_index: int,
        fret_y: float,
        pole_position: float,
        strum_velocity: float,
    ) -> NoteResult:
        """
        Compute a MIDI note from the current instrument state.

        Parameters
        ----------
        string_index : int
            0-based index of the active string on the fretboard.
        fret_y : float
            Normalised touch y-position on the phone (0 = top, 1 = bottom).
        pole_position : float
            Hand position along the physical pole (0.0 = endpoint A,
            1.0 = endpoint B).  Determines the octave.
        strum_velocity : float
            Raw perpendicular crossing velocity from strum detection.

        Returns
        -------
        NoteResult
        """
        base = self._string_to_base_midi(string_index)
        fret_semitones = self._fret_to_semitones(fret_y)
        pole_semitones = self._pole_to_semitones(pole_position)
        velocity = self._velocity_to_midi(strum_velocity)
        duration = self._velocity_to_duration(strum_velocity)

        midi_note = int(np.clip(
            base + pole_semitones + fret_semitones,
            0, 127,
        ))

        return NoteResult(
            midi_note=midi_note,
            velocity=velocity,
            duration=duration,
            name=midi_note_name(midi_note),
        )

    # -----------------------------------------------------------------
    # Internal mappings
    # -----------------------------------------------------------------
    def _string_to_base_midi(self, string_index: int) -> int:
        """Return the open-string MIDI note for *string_index*."""
        idx = max(0, min(string_index, len(self.base_midi) - 1))
        return self.base_midi[idx]

    @staticmethod
    def _fret_to_semitones(fret_y: float) -> int:
        """
        Map the touch y-position to a semitone offset (0 to NUM_FRETS-1).

        y=0 (top of phone) → 0 semitones, y=1 (bottom) → NUM_FRETS-1.
        Each phone fret space = 1 semitone.
        """
        return int(np.clip(fret_y * NUM_FRETS, 0, NUM_FRETS - 1))

    @staticmethod
    def _pole_to_semitones(pole_position: float) -> int:
        """
        Map hand position along the pole to a semitone shift.

        ``pole_position`` 0-1 maps linearly to 0 – POLE_SEMITONE_RANGE
        semitones, like sliding up the guitar neck.
        """
        t = float(np.clip(pole_position, 0.0, 1.0))
        return int(round(t * POLE_SEMITONE_RANGE))

    @staticmethod
    def _velocity_to_midi(strum_velocity: float) -> int:
        """Map raw strum velocity to MIDI velocity (0-127)."""
        t = np.clip(
            (strum_velocity - STRUM_VEL_MAP_MIN)
            / (STRUM_VEL_MAP_MAX - STRUM_VEL_MAP_MIN),
            0.0,
            1.0,
        )
        return int(MIDI_VELOCITY_MIN + t * (MIDI_VELOCITY_MAX - MIDI_VELOCITY_MIN))

    @staticmethod
    def _velocity_to_duration(strum_velocity: float) -> float:
        """Map raw strum velocity to note duration in seconds."""
        t = np.clip(
            (strum_velocity - STRUM_VEL_MAP_MIN)
            / (STRUM_VEL_MAP_MAX - STRUM_VEL_MAP_MIN),
            0.0,
            1.0,
        )
        return NOTE_DURATION_MIN + t * (NOTE_DURATION_MAX - NOTE_DURATION_MIN)
