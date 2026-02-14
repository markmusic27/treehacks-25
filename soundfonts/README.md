# SoundFonts

Place `.sf2` soundfont files in this directory.

## Recommended: General MIDI SoundFont

A single General MIDI (GM) soundfont contains **all 128 standard instruments** (piano, guitars, strings, brass, synths, etc.). You only need one file.

### Free GM SoundFonts

| SoundFont | Size | Notes | Link |
|-----------|------|-------|------|
| **FluidR3_GM** | ~141 MB | High quality, widely used | [Download](https://member.keymusician.com/Member/FluidR3_GM/) |
| **GeneralUser GS** | ~30 MB | Lighter, still good | [Download](https://schristiancollins.com/generaluser.php) |
| **MuseScore_General** | ~36 MB | Good all-around | [Download](https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/) |

### How to add a soundfont

1. Download a `.sf2` file from one of the links above
2. Place it in this `soundfonts/` directory
3. Run `python MIDI_TO_SOUNDFONT/test_midi.py` — it will auto-detect the file

### What about individual instrument soundfonts?

You *can* use individual `.sf2` files for specific instruments (e.g., a dedicated guitar soundfont), but a GM soundfont is simpler since it contains everything. The test script lets you switch between instruments using MIDI program changes.
