#!/usr/bin/env python3
"""
Stem Separator — Split audio into individual instrument tracks using Demucs.

Demucs (by Meta) uses a neural network to separate a mixed audio recording
into individual stems: vocals, drums, bass, and other instruments.

The 6-source model can also isolate guitar and piano specifically.

Usage (as a module):
    from stem_separator import separate_stems, pick_stem_for_instrument
    stems = separate_stems("song.wav")
    best_stem = pick_stem_for_instrument(stems, "guitar")

Usage (CLI):
    # Separate into 4 stems (vocals, drums, bass, other)
    python3 stem_separator.py song.wav

    # Separate into 6 stems (vocals, drums, bass, guitar, piano, other)
    python3 stem_separator.py song.wav --six-stems

    # Only extract the "other" stem (guitars, keys, etc.)
    python3 stem_separator.py song.wav --stem other

Requirements:
    pip install demucs
"""

import os
import sys
import subprocess
import glob
from pathlib import Path

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
SEPARATED_DIR = os.path.join(PROJECT_DIR, "separated_stems")


# ── Instrument-to-stem mapping ──────────────────────────────────────────
# Maps instrument keywords to which Demucs stem best captures them.
# Used to auto-select the right stem based on the user's instrument choice.

INSTRUMENT_STEM_MAP = {
    # Vocals
    "vocal": "vocals",
    "voice": "vocals",
    "sing": "vocals",
    "choir": "vocals",

    # Drums / Percussion
    "drum": "drums",
    "percussion": "drums",
    "cymbal": "drums",
    "snare": "drums",
    "kick": "drums",
    "hi-hat": "drums",

    # Bass
    "bass": "bass",

    # Guitar (available in 6-stem model)
    "guitar": "guitar",
    "nylon": "guitar",
    "steel": "guitar",
    "electric_guitar": "guitar",
    "acoustic_guitar": "guitar",
    "strat": "guitar",
    "les paul": "guitar",
    "oud": "other",         # Oud is similar to guitar but mapped to "other"
    "sitar": "other",
    "banjo": "other",
    "ukulele": "other",
    "mandolin": "other",

    # Piano / Keys (available in 6-stem model)
    "piano": "piano",
    "keyboard": "piano",
    "organ": "piano",
    "synth": "piano",
    "electric_piano": "piano",
    "harpsichord": "piano",
    "clavinet": "piano",

    # Everything else → "other" stem
    "violin": "other",
    "viola": "other",
    "cello": "other",
    "trumpet": "other",
    "trombone": "other",
    "flute": "other",
    "clarinet": "other",
    "saxophone": "other",
    "sax": "other",
    "oboe": "other",
    "harmonica": "other",
}

# 4-stem model outputs
STEMS_4 = ["vocals", "drums", "bass", "other"]

# 6-stem model outputs (has guitar and piano separated from "other")
STEMS_6 = ["vocals", "drums", "bass", "guitar", "piano", "other"]


def pick_stem_for_instrument(instrument_name, use_six_stems=False):
    """
    Determine which Demucs stem best matches the given instrument.

    Args:
        instrument_name (str): The instrument name (e.g. "nylon_guitar", "violin").
        use_six_stems (bool): Whether the 6-stem model is being used.

    Returns:
        str: Stem name ("vocals", "drums", "bass", "guitar", "piano", or "other").
    """
    name_lower = instrument_name.lower().replace("_", " ")
    available_stems = STEMS_6 if use_six_stems else STEMS_4

    # Check each keyword in the map
    for keyword, stem in INSTRUMENT_STEM_MAP.items():
        if keyword in name_lower:
            # If the mapped stem isn't available in 4-stem mode, fall back to "other"
            if stem in available_stems:
                return stem
            elif stem in ("guitar", "piano"):
                return "other"  # Guitar/piano go to "other" in 4-stem mode

    # Default: "other" captures most melodic instruments
    return "other"


def separate_stems(
    audio_path,
    output_dir=None,
    use_six_stems=False,
    target_stem=None,
):
    """
    Separate an audio file into stems using Demucs.

    Args:
        audio_path (str): Path to the input audio file.
        output_dir (str|None): Where to save stems. Defaults to SEPARATED_DIR.
        use_six_stems (bool): Use 6-stem model (guitar + piano separated).
                              Slower but better for guitar/piano isolation.
        target_stem (str|None): If set, only extract this stem (faster).
                                Only works with 4-stem model and "vocals"/"drums".

    Returns:
        dict: Mapping of stem name → file path.
              e.g. {"vocals": "/path/vocals.wav", "drums": "/path/drums.wav", ...}
    """
    audio_path = os.path.abspath(audio_path)
    if not os.path.exists(audio_path):
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    if output_dir is None:
        output_dir = SEPARATED_DIR

    audio_name = Path(audio_path).stem

    # ── Choose the model ────────────────────────────────────────────
    if use_six_stems:
        model = "htdemucs_6s"
        expected_stems = STEMS_6
    else:
        model = "htdemucs"
        expected_stems = STEMS_4

    print(f"[Demucs] Separating: {os.path.basename(audio_path)}")
    print(f"[Demucs] Model: {model} ({len(expected_stems)} stems)")

    # ── Build the command ───────────────────────────────────────────
    cmd = [
        sys.executable, "-m", "demucs",
        "--out", output_dir,
        "-n", model,
    ]

    # Two-stems mode: faster, only isolates one stem + the rest
    if target_stem and not use_six_stems and target_stem in ("vocals", "drums"):
        cmd += ["--two-stems", target_stem]

    cmd.append(audio_path)

    # ── Run Demucs ──────────────────────────────────────────────────
    print(f"[Demucs] Running... (this may take a minute)")

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=600,  # 10 min timeout
    )

    if result.returncode != 0:
        # Try with the demucs CLI directly
        cmd[0:2] = ["demucs"]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            raise RuntimeError(
                f"Demucs failed:\n{result.stderr.strip()}"
            )

    # ── Find the output files ───────────────────────────────────────
    # Demucs saves to: output_dir/model_name/track_name/stem.wav
    stem_dir = os.path.join(output_dir, model, audio_name)

    if not os.path.exists(stem_dir):
        # Sometimes the directory name differs slightly — search for it
        model_dir = os.path.join(output_dir, model)
        if os.path.exists(model_dir):
            subdirs = os.listdir(model_dir)
            if subdirs:
                stem_dir = os.path.join(model_dir, subdirs[-1])

    stems = {}
    for stem_name in expected_stems:
        stem_path = os.path.join(stem_dir, f"{stem_name}.wav")
        if os.path.exists(stem_path):
            stems[stem_name] = stem_path

    if not stems:
        # Fallback: find any .wav files in the output
        wav_files = glob.glob(os.path.join(stem_dir, "*.wav"))
        for wav_path in wav_files:
            name = Path(wav_path).stem
            stems[name] = wav_path

    if not stems:
        raise RuntimeError(f"Demucs ran but no stems found in: {stem_dir}")

    # ── Report ──────────────────────────────────────────────────────
    print(f"[Demucs] Done! Separated into {len(stems)} stems:")
    for name, path in sorted(stems.items()):
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f"  {name:10s} → {size_mb:.1f} MB")

    return stems


def get_best_stem(stems, instrument_name, use_six_stems=False):
    """
    Given separated stems and an instrument name, return the best stem path.

    Args:
        stems (dict): {stem_name: file_path} from separate_stems().
        instrument_name (str): What instrument the user wants.
        use_six_stems (bool): Whether 6-stem model was used.

    Returns:
        tuple: (stem_name, stem_path)
    """
    target = pick_stem_for_instrument(instrument_name, use_six_stems)

    if target in stems:
        print(f"[Demucs] Using '{target}' stem for instrument '{instrument_name}'")
        return target, stems[target]

    # Fallback: use "other" if available, otherwise first available stem
    if "other" in stems:
        print(f"[Demucs] '{target}' not available, using 'other' stem")
        return "other", stems["other"]

    first_name = list(stems.keys())[0]
    print(f"[Demucs] Falling back to '{first_name}' stem")
    return first_name, stems[first_name]


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Separate audio into instrument stems using Demucs.",
    )
    parser.add_argument(
        "audio_file",
        help="Path to audio file (WAV, MP3, FLAC, etc.)",
    )
    parser.add_argument(
        "--six-stems",
        action="store_true",
        help="Use 6-stem model (separates guitar and piano). Slower.",
    )
    parser.add_argument(
        "--stem",
        default=None,
        help="Only extract this stem (e.g. 'vocals', 'drums'). Faster.",
    )
    parser.add_argument(
        "--output-dir", "-o",
        default=None,
        help=f"Output directory (default: {SEPARATED_DIR})",
    )

    args = parser.parse_args()

    try:
        stems = separate_stems(
            audio_path=args.audio_file,
            output_dir=args.output_dir,
            use_six_stems=args.six_stems,
            target_stem=args.stem,
        )
        print(f"\n  Stems saved to directory above.")
        print(f"  Use any stem as input to generate_MIDI.py or pipeline.py")
    except Exception as e:
        print(f"\n  Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
