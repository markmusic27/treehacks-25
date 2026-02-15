"""
Instrument Setup — Select a plucked string instrument and ensure its soundfont.

Wraps the existing ``MIDI_TO_SOUNDFONT/MIDI_generation/manage_instruments.py``
and ``MIDI_TO_SOUNDFONT/FluidSynth_Player/fluidsynth_player.py`` modules.

Usage:
    from app.instrument_setup import pick_instrument, resolve_soundfont
    from app.session import InstrumentInfo

    # Interactive picker (CLI)
    info = pick_instrument()

    # Or resolve a known instrument directly
    info = resolve_soundfont("nylon_guitar")
"""

from __future__ import annotations

import os
import sys

# Handle imports whether run as a module or directly
try:
    from app.session import InstrumentInfo, PLUCKED_INSTRUMENTS, SOUNDFONT_DIR
except ImportError:
    from session import InstrumentInfo, PLUCKED_INSTRUMENTS, SOUNDFONT_DIR

# ── Path setup ───────────────────────────────────────────────────────────
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_MIDI_GEN_DIR = os.path.join(REPO_DIR, "MIDI_TO_SOUNDFONT", "MIDI_generation")
_PLAYER_DIR = os.path.join(REPO_DIR, "MIDI_TO_SOUNDFONT", "FluidSynth_Player")

for _d in (_MIDI_GEN_DIR, _PLAYER_DIR):
    if _d not in sys.path:
        sys.path.insert(0, _d)

from manage_instruments import (
    check_instrument,
    get_all_sf2_files,
    search_soundfonts_online,
    download_soundfont,
    parse_sf2_presets,
)
from fluidsynth_player import FluidSynthPlayer


# ═══════════════════════════════════════════════════════════════════════
#  INSTRUMENT PICKER (interactive CLI)
# ═══════════════════════════════════════════════════════════════════════

def list_instruments() -> list[tuple[str, str]]:
    """
    Return the list of available plucked string instruments.

    Returns:
        list of (display_name, gm_name) tuples.
    """
    return [(name, gm) for name, gm in PLUCKED_INSTRUMENTS.items()]


def pick_instrument() -> InstrumentInfo:
    """
    Interactive CLI: let the user pick a plucked string instrument.

    Returns:
        InstrumentInfo with at least display_name and gm_name filled in.
    """
    instruments = list_instruments()

    print()
    print("=" * 55)
    print("  Pick Your Instrument")
    print("=" * 55)
    print()
    for i, (display, gm) in enumerate(instruments, 1):
        print(f"    {i:2d}. {display}")
    print()

    while True:
        try:
            choice = input("  Enter number (1-{0}): ".format(len(instruments)))
            idx = int(choice) - 1
            if 0 <= idx < len(instruments):
                break
            print(f"  Please enter a number between 1 and {len(instruments)}.")
        except (ValueError, EOFError):
            print(f"  Please enter a valid number.")

    display_name, gm_name = instruments[idx]
    print(f"\n  Selected: {display_name}")

    return InstrumentInfo(
        display_name=display_name,
        gm_name=gm_name,
    )


# ═══════════════════════════════════════════════════════════════════════
#  SOUNDFONT RESOLUTION
# ═══════════════════════════════════════════════════════════════════════

def resolve_soundfont(instrument: InstrumentInfo) -> InstrumentInfo:
    """
    Make sure we have a soundfont that can play this instrument.

    1. Check if it's a standard GM instrument name → done.
    2. Search local soundfonts for a match.
    3. Search online and download if needed.
    4. Fall back to default GM piano.

    Mutates and returns the same InstrumentInfo with bank/program/soundfont filled in.
    """
    gm_name = instrument.gm_name

    print()
    print("=" * 55)
    print("  Soundfont Check")
    print("=" * 55)
    print(f"  Instrument: {instrument.display_name} ({gm_name})")

    # ── 1. Standard GM instrument? ────────────────────────────────────
    gm_instruments = FluidSynthPlayer.INSTRUMENTS
    if gm_name in gm_instruments:
        instrument.program = gm_instruments[gm_name]
        instrument.bank = 0
        instrument.source = "gm"
        print(f"  Status: Standard GM instrument (program {instrument.program})")
        print(f"  Soundfont: default")

        # Make sure at least one .sf2 file exists
        sf2_files = get_all_sf2_files()
        if sf2_files:
            instrument.soundfont_path = sf2_files[0]
        else:
            print(f"  WARNING: No .sf2 files found in {SOUNDFONT_DIR}")
            print(f"  You need at least one General MIDI soundfont.")

        return instrument

    # ── 2. Search local soundfonts ────────────────────────────────────
    sf2_files = get_all_sf2_files()
    for sf2_path in sf2_files:
        matches = check_instrument(sf2_path, gm_name)
        if not matches:
            # Also try the display name
            matches = check_instrument(sf2_path, instrument.display_name)
        if matches:
            best = matches[0]
            instrument.bank = best["bank"]
            instrument.program = best["program"]
            instrument.soundfont_path = sf2_path
            instrument.source = "sf2"
            print(f"  Status: Found in {os.path.basename(sf2_path)}")
            print(f"  Preset: {best['name']} (bank {best['bank']}, program {best['program']})")
            return instrument

    # ── 3. Search online and download ─────────────────────────────────
    print(f"  Not found locally. Searching online...")
    results = search_soundfonts_online(instrument.display_name)

    if results:
        for result in results[:3]:
            try:
                print(f"\n  Trying: {result['name']}")
                sf2_path = download_soundfont(result["page_url"])

                matches = check_instrument(sf2_path, gm_name)
                if not matches:
                    matches = check_instrument(sf2_path, instrument.display_name)

                if matches:
                    best = matches[0]
                    instrument.bank = best["bank"]
                    instrument.program = best["program"]
                    instrument.soundfont_path = sf2_path
                    instrument.source = "downloaded"
                    print(f"  Downloaded: {best['name']}")
                    return instrument

                # Downloaded but no exact match — use first preset
                presets = parse_sf2_presets(sf2_path)
                if presets:
                    best = presets[0]
                    instrument.bank = best["bank"]
                    instrument.program = best["program"]
                    instrument.soundfont_path = sf2_path
                    instrument.source = "downloaded"
                    print(f"  Downloaded (using first preset: {best['name']})")
                    return instrument

            except Exception as e:
                print(f"  Download failed: {e}")
                continue

    # ── 4. Fallback to default ────────────────────────────────────────
    print(f"  Falling back to Nylon Guitar (program 24)")
    instrument.gm_name = "nylon_guitar"
    instrument.program = 24
    instrument.bank = 0
    instrument.source = "gm"
    if sf2_files:
        instrument.soundfont_path = sf2_files[0]

    return instrument
