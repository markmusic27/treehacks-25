"""
Audio engine: real-time MIDI playback through FluidSynth.

Wraps ``fluidsynth`` (via ``pyfluidsynth``) so the rest of the system only
needs to call ``play_note(midi_note, velocity, duration)``.
"""

from __future__ import annotations

import threading
import time
from pathlib import Path

from config import FLUIDSYNTH_GAIN, INSTRUMENT_PROGRAM, SOUNDFONT_PATH


class AudioEngine:
    """
    FluidSynth-backed audio engine for playing MIDI notes.

    Parameters
    ----------
    soundfont_path : str | None
        Path to a ``.sf2`` SoundFont file.  Falls back to ``config.SOUNDFONT_PATH``.
    gain : float
        Master gain (0.0 – 1.0).
    program : int
        General MIDI program number for the instrument.
    """

    def __init__(
        self,
        soundfont_path: str | None = None,
        gain: float = FLUIDSYNTH_GAIN,
        program: int = INSTRUMENT_PROGRAM,
    ) -> None:
        self._sf_path = soundfont_path or SOUNDFONT_PATH
        self._gain = gain
        self._program = program
        self._synth = None
        self._sf_id: int | None = None
        self._active_timers: list[threading.Timer] = []
        self._lock = threading.Lock()

        # Per-note generation counter: prevents an old noteoff timer from
        # killing a note that was re-triggered after the timer was scheduled.
        self._note_gen: dict[int, int] = {}

        self._init_synth()

    # -----------------------------------------------------------------
    # Lifecycle
    # -----------------------------------------------------------------
    # Fallback SoundFont locations (checked in order)
    _FALLBACK_PATHS = [
        "/opt/homebrew/Cellar/fluid-synth/2.5.2/share/fluid-synth/sf2/"
        "VintageDreamsWaves-v2.sf2",
        "/usr/share/sounds/sf2/FluidR3_GM.sf2",
        "/usr/share/soundfonts/FluidR3_GM.sf2",
    ]

    def _init_synth(self) -> None:
        """Initialise the FluidSynth synthesiser and load the SoundFont."""
        try:
            import fluidsynth
        except ImportError:
            print(
                "[AudioEngine] pyfluidsynth not installed. "
                "Run: pip install pyfluidsynth"
            )
            return

        sf_file = Path(self._sf_path)
        if not sf_file.exists():
            # Try fallback locations
            for fallback in self._FALLBACK_PATHS:
                candidate = Path(fallback)
                if candidate.exists():
                    sf_file = candidate
                    print(f"[AudioEngine] Using fallback SoundFont: {sf_file}")
                    break
            else:
                print(
                    f"[AudioEngine] SoundFont not found at {self._sf_path}\n"
                    "  Place a .sf2 file at vision/soundfont.sf2 or install "
                    "one via your package manager."
                )
                return

        try:
            self._synth = fluidsynth.Synth(gain=self._gain)
            self._synth.start(driver="coreaudio")  # macOS
            self._sf_id = self._synth.sfload(str(sf_file))
            self._synth.program_select(0, self._sf_id, 0, self._program)
            print(
                f"[AudioEngine] Ready — SoundFont: {sf_file.name}, "
                f"program: {self._program}"
            )
        except Exception as exc:
            print(f"[AudioEngine] Failed to initialise FluidSynth: {exc}")
            self._synth = None

    @property
    def ready(self) -> bool:
        """True when the synth is loaded and can play notes."""
        return self._synth is not None

    # -----------------------------------------------------------------
    # Playback
    # -----------------------------------------------------------------
    def play_note(self, midi_note: int, velocity: int, duration: float) -> None:
        """
        Play a single MIDI note (non-blocking).

        ``noteon`` fires immediately; a background timer sends ``noteoff``
        after *duration* seconds.  If the same MIDI note is retriggered
        before the timer fires, the old timer is harmlessly ignored so the
        new note keeps ringing.
        """
        if not self.ready:
            return

        midi_note = max(0, min(127, midi_note))
        velocity = max(0, min(127, velocity))

        with self._lock:
            # Bump generation so any pending noteoff for this pitch is ignored
            gen = self._note_gen.get(midi_note, 0) + 1
            self._note_gen[midi_note] = gen
            self._synth.noteon(0, midi_note, velocity)

        timer = threading.Timer(
            duration, self._note_off, args=(midi_note, gen),
        )
        timer.daemon = True
        timer.start()

        with self._lock:
            self._active_timers.append(timer)

    def _note_off(self, midi_note: int, gen: int) -> None:
        """Send a noteoff only if *gen* is still the latest generation."""
        if not self.ready:
            return
        with self._lock:
            if self._note_gen.get(midi_note, 0) != gen:
                return  # a newer noteon superseded this one
            self._synth.noteoff(0, midi_note)

    def stop_all(self) -> None:
        """Silence all notes and cancel pending timers."""
        with self._lock:
            for timer in self._active_timers:
                timer.cancel()
            self._active_timers.clear()

            if self._synth is not None:
                # All-notes-off on channel 0
                for note in range(128):
                    self._synth.noteoff(0, note)

    def shutdown(self) -> None:
        """Clean up the synth."""
        self.stop_all()
        if self._synth is not None:
            self._synth.delete()
            self._synth = None
