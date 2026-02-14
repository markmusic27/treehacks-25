#!/usr/bin/env python3
"""
Real-Time Note Player — Input a note, hear it instantly.

This is the bridge between your CV gesture system and FluidSynth.
Run it standalone to test with keyboard input, or import it
into your CV pipeline.

Usage (standalone test):
    python3 realtime_player.py
    python3 realtime_player.py --instrument steel_guitar
    python3 realtime_player.py --instrument electric_guitar_clean

Usage (from your CV code):
    from realtime_player import RealtimePlayer

    player = RealtimePlayer(instrument="nylon_guitar")
    player.play(60)         # Play middle C
    player.play(64)         # Play E
    player.stop(60)         # Stop middle C
    player.stop_all()       # Silence everything
    player.change_instrument("steel_guitar")
"""

import os
import re
import sys
import time
import json
import urllib.request

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
SOUNDFONT_DIR = os.path.join(REPO_DIR, "soundfonts")

# Load simple KEY=VALUE entries from repo .env (if present)
ENV_PATH = os.path.join(REPO_DIR, ".env")
if os.path.exists(ENV_PATH):
    with open(ENV_PATH, "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

sys.path.insert(0, os.path.join(SCRIPT_DIR, "FluidSynth_Player"))
sys.path.insert(0, os.path.join(SCRIPT_DIR, "MIDI_generation"))
from fluidsynth_player import FluidSynthPlayer
from manage_instruments import (
    check_instrument,
    search_soundfonts_online,
    download_soundfont,
    get_all_sf2_files,
)


# ── Note name helpers ───────────────────────────────────────────────────
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def get_perplexity_queries_for_instrument(instrument):
    """
    Ask Perplexity for better soundfont search queries and optional direct URLs.

    Returns:
        tuple[list[str], list[str]]: (queries, urls)
    """
    api_key = os.environ.get("PERPLEXITY_API_KEY")
    if not api_key:
        return [], []

    prompt = (
        f"Find best search terms and possible download pages for '{instrument}' soundfonts "
        "for FluidSynth (.sf2). Return ONLY JSON with keys: "
        "queries (array of strings), urls (array of strings). "
        "Prefer musical-artifacts pages and sf2-focused sources."
    )

    payload = json.dumps(
        {
            "model": "sonar",
            "messages": [
                {"role": "system", "content": "Return strict JSON only."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.1,
            "max_tokens": 250,
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        "https://api.perplexity.ai/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        content = data["choices"][0]["message"]["content"]
        # Extract first JSON object from response.
        match = re.search(r"\{.*\}", content, re.DOTALL)
        if not match:
            return [], []
        parsed = json.loads(match.group(0))
        queries = [q.strip() for q in parsed.get("queries", []) if isinstance(q, str) and q.strip()]
        urls = [u.strip() for u in parsed.get("urls", []) if isinstance(u, str) and u.strip()]
        return queries, urls
    except Exception:
        return [], []

def midi_to_name(midi_num):
    """Convert MIDI note number to name like C#4."""
    octave = (midi_num // 12) - 1
    return f"{NOTE_NAMES[midi_num % 12]}{octave}"

def name_to_midi(name):
    """Convert note name like C#4, Bb3, B3 to MIDI number. Returns None if invalid."""
    name = name.strip()
    if not name:
        return None

    # Try parsing as a plain number first (e.g. "60")
    try:
        num = int(name)
        if 0 <= num <= 127:
            return num
        return None
    except ValueError:
        pass

    # Regex: note letter, optional accidental (#/b), octave number
    import re
    match = re.match(r'^([A-Ga-g])(#|b)?(-?\d+)$', name)
    if not match:
        return None

    letter = match.group(1).upper()
    accidental = match.group(2)  # '#', 'b', or None
    octave = int(match.group(3))

    # Map note letter to semitone offset within octave
    LETTER_TO_SEMITONE = {
        "C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11,
    }

    semitone = LETTER_TO_SEMITONE.get(letter)
    if semitone is None:
        return None

    if accidental == "#":
        semitone += 1
    elif accidental == "b":
        semitone -= 1

    midi = (octave + 1) * 12 + semitone
    if 0 <= midi <= 127:
        return midi
    return None


class RealtimePlayer:
    """
    Real-time MIDI note player.

    Thin wrapper around FluidSynthPlayer optimized for the
    gesture-to-music use case.
    """

    def __init__(self, instrument="nylon_guitar", soundfont=None, gain=0.8):
        """
        Initialize the real-time player.

        Args:
            instrument: GM instrument name or program number.
            soundfont: Path to .sf2 file. Auto-detects from soundfonts/ if None.
            gain: Volume 0.0-1.0.
        """
        if soundfont is None:
            soundfont = self._find_soundfont()

        # Initialize FluidSynth with a guaranteed-safe GM instrument first.
        # Custom instruments (e.g. "oud") are resolved right after init.
        self.player = FluidSynthPlayer(
            soundfont_path=soundfont,
            instrument="acoustic_grand_piano",
            gain=gain,
        )
        self.active_notes = set()
        self.instrument = "acoustic_grand_piano"

        # Resolve requested instrument (GM, local SF2 preset, online download, fallback).
        self.change_instrument(instrument)

    def _find_soundfont(self):
        """Find first .sf2 in soundfonts directory."""
        if os.path.exists(SOUNDFONT_DIR):
            for f in sorted(os.listdir(SOUNDFONT_DIR)):
                if f.lower().endswith(".sf2"):
                    return os.path.join(SOUNDFONT_DIR, f)
        raise FileNotFoundError(f"No .sf2 files found in {SOUNDFONT_DIR}")

    def _resolve_instrument(self, instrument):
        """
        Resolve an instrument name to something FluidSynth can play.

        Order of resolution:
        1. Known GM instrument name → use directly
        2. Search loaded soundfonts for a matching preset → use bank/program
        3. Search online, download, load → use from new soundfont
        4. Fall back to acoustic_grand_piano

        Returns:
            tuple: (resolved_name, method)
                method = "gm" | "sf2_preset" | "downloaded" | "fallback"
        """
        # 1. Check if it's a standard GM name
        normalized = instrument.lower().replace(" ", "_").replace("-", "_")
        if normalized in FluidSynthPlayer.INSTRUMENTS:
            return normalized, "gm"

        # 2. Search all soundfont files in the soundfonts directory
        sf2_files = get_all_sf2_files()
        for sf2_path in sf2_files:
            matches = check_instrument(sf2_path, instrument)
            if matches:
                best = matches[0]
                print(f"  Found '{best['name']}' in {os.path.basename(sf2_path)}")
                print(f"  (bank {best['bank']}, program {best['program']})")

                # Load this soundfont into FluidSynth if it isn't already
                sf2_abs = os.path.abspath(sf2_path)
                if sf2_abs in self.player.soundfonts.values():
                    # Already loaded — find its sfid
                    sfid = [k for k, v in self.player.soundfonts.items() if v == sf2_abs][0]
                else:
                    # Load it now
                    sfid = self.player.load_additional_soundfont(sf2_path)

                self.player.fs.program_select(
                    self.player.channel, sfid,
                    best["bank"], best["program"]
                )
                self.instrument = best["name"]
                return best["name"], "sf2_preset"

        # 3. Search online and download
        print(f"  '{instrument}' not found locally. Searching online...")
        try:
            query_words = [w for w in re.split(r"[^a-z0-9#]+", instrument.lower()) if w]

            # Use Perplexity to improve routing (optional; requires PERPLEXITY_API_KEY)
            pplx_queries, pplx_urls = get_perplexity_queries_for_instrument(instrument)
            if pplx_queries:
                print(f"  Perplexity suggested queries: {', '.join(pplx_queries[:3])}")

            # 3a) Try direct URLs suggested by Perplexity first.
            for direct_url in pplx_urls[:5]:
                try:
                    print(f"  Trying Perplexity URL candidate: {direct_url}")
                    sf2_path = download_soundfont(direct_url)
                    matches = check_instrument(sf2_path, instrument)
                    if matches:
                        best = matches[0]
                        sfid = self.player.load_additional_soundfont(sf2_path)
                        self.player.set_instrument_from_soundfont(sfid, best["bank"], best["program"])
                        self.instrument = best["name"]
                        return best["name"], "downloaded"
                    print("  Downloaded soundfont does not contain requested instrument, skipping.")
                except Exception as e:
                    print(f"  URL candidate failed: {e}")

            # 3b) Search using multiple queries (Perplexity-guided first, then original).
            search_queries = []
            search_queries.extend([q for q in pplx_queries if q not in search_queries])
            if instrument not in search_queries:
                search_queries.append(instrument)

            all_results = []
            for query in search_queries[:5]:
                try:
                    results = search_soundfonts_online(query)
                    all_results.extend(results)
                except Exception:
                    continue

            if all_results:
                def _result_score(result_obj):
                    # Score by word overlap against original instrument query.
                    name = (result_obj.get("name") or "").lower()
                    words = set(w for w in re.split(r"[^a-z0-9#]+", name) if w)
                    overlap = sum(1 for w in query_words if w in words)
                    return overlap

                # De-duplicate by artifact/page URL.
                dedup = {}
                for r in all_results:
                    key = r.get("page_url") or r.get("artifact_id") or r.get("name")
                    if key and key not in dedup:
                        dedup[key] = r

                ranked = sorted(dedup.values(), key=_result_score, reverse=True)
                for result in ranked[:8]:
                    score = _result_score(result)
                    if query_words and score == 0:
                        continue
                    try:
                        print(f"  Trying download candidate: {result.get('name', 'unknown')}")
                        sf2_path = download_soundfont(result["page_url"])
                        matches = check_instrument(sf2_path, instrument)
                        if matches:
                            best = matches[0]
                            sfid = self.player.load_additional_soundfont(sf2_path)
                            self.player.set_instrument_from_soundfont(
                                sfid, best["bank"], best["program"]
                            )
                            self.instrument = best["name"]
                            return best["name"], "downloaded"
                        print("  Downloaded soundfont does not contain requested instrument, skipping.")
                    except Exception as e:
                        print(f"  Download failed: {e}")
                        continue
        except Exception as e:
            print(f"  Online search failed: {e}")

        # 4. Fallback
        print(f"  Could not find '{instrument}'. Using acoustic_grand_piano.")
        return "acoustic_grand_piano", "fallback"

    def play(self, note, velocity=100):
        """Play a note instantly. Note can be int (MIDI) or string ('C4')."""
        if isinstance(note, str):
            note = name_to_midi(note)
            if note is None:
                return
        self.player.noteon(note, velocity)
        self.active_notes.add(note)

    def stop(self, note):
        """Stop a note. Note can be int (MIDI) or string ('C4')."""
        if isinstance(note, str):
            note = name_to_midi(note)
            if note is None:
                return
        self.player.noteoff(note)
        self.active_notes.discard(note)

    def stop_all(self):
        """Stop all active notes."""
        self.player.all_notes_off()
        self.active_notes.clear()

    def change_instrument(self, instrument):
        """
        Switch instrument on the fly.

        Accepts:
        - GM name: "nylon_guitar", "violin"
        - Any name: "oud", "sitar" → searches soundfonts, downloads if needed
        - Program number: 24
        """
        if isinstance(instrument, int):
            self.player.set_instrument(instrument)
            self.instrument = f"program_{instrument}"
            return

        # Try GM name first (fast path)
        normalized = instrument.lower().replace(" ", "_").replace("-", "_")
        if normalized in FluidSynthPlayer.INSTRUMENTS:
            self.player.set_instrument(normalized)
            self.instrument = normalized
            return

        # Full resolution: search soundfonts → download if needed
        self.stop_all()
        resolved_name, method = self._resolve_instrument(instrument)
        if method == "gm" or method == "fallback":
            self.player.set_instrument(resolved_name)
        # sf2_preset and downloaded are already set by _resolve_instrument

        self.instrument = resolved_name

    def cleanup(self):
        """Release resources."""
        self.player.cleanup()


# ═══════════════════════════════════════════════════════════════════════
#  INTERACTIVE TEST MODE
# ═══════════════════════════════════════════════════════════════════════

def interactive_mode(player):
    """
    Interactive test — type note names or numbers, hear them instantly.

    Supports:
        C4      → play middle C
        60      → play MIDI note 60 (same as C4)
        C4 E4 G4 → play a chord (multiple notes at once)
        off     → stop all notes
        i guitar_name → change instrument
        q       → quit
    """
    print()
    print("=" * 55)
    print("  Real-Time Player — Interactive Test")
    print("=" * 55)
    print()
    print(f"  Instrument: {player.instrument}")
    print()
    print("  Type notes to play them:")
    print("    C4          → play middle C")
    print("    60          → play MIDI note 60")
    print("    C4 E4 G4    → play a chord")
    print("    off         → stop all notes")
    print("    i <name>    → change instrument")
    print("    list        → show available instruments")
    print("    q           → quit")
    print()

    while True:
        try:
            line = input("  > ").strip()
        except (EOFError, KeyboardInterrupt):
            break

        if not line:
            continue

        if line.lower() == "q":
            break

        if line.lower() == "off":
            player.stop_all()
            print("    All notes off")
            continue

        if line.lower() == "list":
            print("\n    GM Instruments (always available):")
            for name in sorted(FluidSynthPlayer.INSTRUMENTS.keys()):
                print(f"      {name}")
            # Also show what's in loaded soundfonts
            sf2_files = get_all_sf2_files()
            if sf2_files:
                from manage_instruments import parse_sf2_presets
                for sf2_path in sf2_files:
                    presets = parse_sf2_presets(sf2_path)
                    sf_name = os.path.basename(sf2_path)
                    print(f"\n    Soundfont: {sf_name} ({len(presets)} presets)")
                    print(f"    Type 'i <name>' with any preset name to use it.")
                    print(f"    Or type 'i <anything>' to search online.")
            print()
            continue

        if line.lower().startswith("i "):
            new_inst = line[2:].strip().strip("<>")  # strip angle brackets too
            if not new_inst:
                print("    Usage: i instrument_name")
                continue
            player.change_instrument(new_inst)
            print(f"    Now playing as: {player.instrument}")
            continue

        # Parse notes (space-separated)
        # First stop any currently active notes
        player.stop_all()

        notes = line.split()
        played = []
        for n in notes:
            midi_num = name_to_midi(n)
            if midi_num is not None:
                player.play(midi_num)
                played.append(f"{midi_to_name(midi_num)} ({midi_num})")
            else:
                print(f"    Unknown note: {n}")

        if played:
            print(f"    Playing: {', '.join(played)}")


def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Real-time note player. Type notes, hear sounds.",
    )
    parser.add_argument(
        "--instrument", "-i",
        default="nylon_guitar",
        help="Starting instrument (default: nylon_guitar)",
    )
    parser.add_argument(
        "--gain", "-g",
        type=float,
        default=0.8,
        help="Volume 0.0-1.0 (default: 0.8)",
    )

    args = parser.parse_args()

    player = RealtimePlayer(instrument=args.instrument, gain=args.gain)

    try:
        interactive_mode(player)
    finally:
        player.cleanup()
        print("\n  Done.")


if __name__ == "__main__":
    main()
