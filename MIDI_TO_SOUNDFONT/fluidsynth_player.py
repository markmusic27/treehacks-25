"""
FluidSynthPlayer — A simple wrapper around FluidSynth for real-time MIDI playback.

This module provides a class that:
  - Initializes FluidSynth with a SoundFont (.sf2) file
  - Exposes noteon/noteoff methods for real-time note control
  - Supports instrument switching via General MIDI program changes
  - Cleans up resources automatically on exit

Designed for a gesture-to-music system where gestures map to MIDI events.

Requirements:
  - macOS: brew install fluid-synth
  - Python: pip install pyfluidsynth
"""

import fluidsynth
import atexit
import os


class FluidSynthPlayer:
    """
    Real-time MIDI synthesizer using FluidSynth.

    Usage:
        player = FluidSynthPlayer("soundfonts/FluidR3_GM.sf2", instrument="nylon_guitar")
        player.noteon(60, velocity=100)   # Play middle C
        player.noteoff(60)                # Stop middle C
        player.cleanup()                  # Free resources
    """

    # ── General MIDI instrument presets ──────────────────────────────────
    # These are standard GM program numbers (0-indexed).
    # A full GM soundfont (like FluidR3_GM.sf2) contains all 128 instruments.
    INSTRUMENTS = {
        # Pianos
        "acoustic_grand_piano": 0,
        "bright_acoustic_piano": 1,
        "electric_grand_piano": 2,
        "electric_piano": 4,
        # Guitars
        "nylon_guitar": 24,
        "steel_guitar": 25,
        "electric_guitar_jazz": 26,
        "electric_guitar_clean": 27,
        "electric_guitar_muted": 28,
        "overdriven_guitar": 29,
        "distortion_guitar": 30,
        # Strings
        "violin": 40,
        "viola": 41,
        "cello": 42,
        # Brass & Wind
        "trumpet": 56,
        "trombone": 57,
        "flute": 73,
        "clarinet": 71,
        # Synth
        "synth_lead": 80,
        "synth_pad": 88,
    }

    def __init__(self, soundfont_path, instrument="acoustic_grand_piano", gain=0.8):
        """
        Initialize FluidSynth and load a soundfont.

        Args:
            soundfont_path (str): Path to a .sf2 soundfont file.
            instrument (str|int): Instrument name (from INSTRUMENTS dict) or
                                  MIDI program number (0-127).
            gain (float): Master volume, 0.0 to 1.0. Default 0.8.
        """
        # Validate the soundfont exists before doing anything
        if not os.path.exists(soundfont_path):
            raise FileNotFoundError(f"SoundFont not found: {soundfont_path}")

        # ── Create the synthesizer ──────────────────────────────────────
        self.fs = fluidsynth.Synth(gain=gain)

        # ── Start the audio driver ──────────────────────────────────────
        # macOS uses "coreaudio". Change to "alsa" on Linux or "dsound" on Windows.
        self.fs.start(driver="coreaudio")

        # ── Load the soundfont ──────────────────────────────────────────
        self.sfid = self.fs.sfload(soundfont_path)
        if self.sfid == -1:
            raise RuntimeError(f"Failed to load SoundFont: {soundfont_path}")

        # ── Set the default channel and instrument ──────────────────────
        self.channel = 0  # MIDI channel 0 (channels are 0-15)
        self.set_instrument(instrument)

        # ── Register cleanup to run automatically on exit ───────────────
        atexit.register(self.cleanup)

        sf_name = os.path.basename(soundfont_path)
        print(f"[FluidSynth] Initialized — soundfont: {sf_name}, gain: {gain}")

    # ── Instrument control ──────────────────────────────────────────────

    def set_instrument(self, instrument, channel=None):
        """
        Switch to a different instrument on the given channel.

        Args:
            instrument (str|int): Name from INSTRUMENTS dict, or GM program number (0-127).
            channel (int|None): MIDI channel. Defaults to self.channel.
        """
        if channel is None:
            channel = self.channel

        # Resolve instrument name to program number
        if isinstance(instrument, str):
            if instrument not in self.INSTRUMENTS:
                available = ", ".join(sorted(self.INSTRUMENTS.keys()))
                raise ValueError(
                    f"Unknown instrument '{instrument}'. Available: {available}"
                )
            program = self.INSTRUMENTS[instrument]
            name = instrument
        else:
            program = int(instrument)
            name = f"program_{program}"

        # program_select(channel, sfid, bank, preset)
        # Bank 0 is the standard GM bank.
        self.fs.program_select(channel, self.sfid, 0, program)
        print(f"[FluidSynth] Instrument: {name} (program {program}) on channel {channel}")

    # ── Note control ────────────────────────────────────────────────────

    def noteon(self, note, velocity=100, channel=None):
        """
        Start playing a note.

        Args:
            note (int): MIDI note number (0-127). Middle C = 60.
            velocity (int): How hard to strike (1-127). Higher = louder.
            channel (int|None): MIDI channel. Defaults to self.channel.
        """
        if channel is None:
            channel = self.channel
        self.fs.noteon(channel, note, velocity)

    def noteoff(self, note, channel=None):
        """
        Stop a playing note.

        Args:
            note (int): MIDI note number (0-127).
            channel (int|None): MIDI channel. Defaults to self.channel.
        """
        if channel is None:
            channel = self.channel
        self.fs.noteoff(channel, note)

    def all_notes_off(self, channel=None):
        """Panic — stop all notes on a channel immediately."""
        if channel is None:
            channel = self.channel
        for note in range(128):
            self.fs.noteoff(channel, note)

    # ── Cleanup ─────────────────────────────────────────────────────────

    def cleanup(self):
        """Release FluidSynth resources. Safe to call multiple times."""
        if hasattr(self, "fs") and self.fs is not None:
            self.all_notes_off()
            self.fs.delete()
            self.fs = None
            print("[FluidSynth] Cleaned up.")
