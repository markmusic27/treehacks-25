#!/usr/bin/env python3
"""
AI Jam Band — Gesture-play guitar over an AI-generated backing band.

The flow:
    1. You describe a vibe (or feed a MIDI from a gesture session)
    2. Suno generates a full song from that description
    3. Suno stem-separates it into 12 tracks
    4. We download the stems, MUTE the guitar stem
    5. All other stems play back as your backing band (pygame mixer)
    6. You solo over the top in real-time with gestures → FluidSynth

    ┌────────────────────────────────────────────────────────────────┐
    │                                                                │
    │   YOUR GESTURES ──→ FluidSynth ──→  🎸 LIVE GUITAR            │
    │                                       +                        │
    │   SUNO AI ──→ 12 stems ──→           🥁 Drums                  │
    │              (guitar muted)           🎹 Keyboard               │
    │                                       🎸 Bass                   │
    │                                       🎤 Vocals                 │
    │                                       🎻 Strings                │
    │                                       ... (9 more stems)        │
    │                                                                │
    │   = YOU ARE JAMMING WITH AN AI BAND                            │
    └────────────────────────────────────────────────────────────────┘

Usage:
    # Full pipeline: describe → generate → stems → jam
    python3 jam_band.py --topic "funky rock jam with heavy drums" --tags "rock, funk, drums"

    # From a gesture MIDI: analyze → generate → stems → jam
    python3 jam_band.py --from-midi ../MIDI_TO_SOUNDFONT/midi_output/band_guitar/your_session.mid

    # Use an existing Suno clip (skip generation)
    python3 jam_band.py --clip-id abc-123-def-456

    # Just play stems from a previous session (skip everything)
    python3 jam_band.py --stems-dir generated_songs/stems

Requires:
    SUNO_TREEHACKS_TOKEN in .env
    brew install fluid-synth
    pip install pygame pretty_midi pyfluidsynth
"""

import os
import sys
import time
import argparse
import threading

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
SONG_GEN_DIR = os.path.join(REPO_DIR, "SONG_GENERATION")
MIDI_SF_DIR = os.path.join(REPO_DIR, "MIDI_TO_SOUNDFONT")
SOUNDFONT_DIR = os.path.join(REPO_DIR, "soundfonts")
STEMS_DIR = os.path.join(SCRIPT_DIR, "stems")
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "sessions")

# Load .env
_env_path = os.path.join(REPO_DIR, ".env")
if os.path.exists(_env_path):
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

# Import from sibling modules
sys.path.insert(0, SONG_GEN_DIR)
sys.path.insert(0, MIDI_SF_DIR)
sys.path.insert(0, os.path.join(MIDI_SF_DIR, "FluidSynth_Player"))

from generate_song import (
    generate_song, poll_for_complete, separate_stems, poll_stems,
    download_clip, describe_midi, analyze_midi,
)


# ═══════════════════════════════════════════════════════════════════════
#  STEM LABELS  (Suno outputs 12 stems in this order)
# ═══════════════════════════════════════════════════════════════════════

STEM_ORDER = [
    "Vocals", "Backing Vocals", "Drums", "Bass", "Guitar", "Keyboard",
    "Percussion", "Strings", "Synth", "FX", "Brass", "Woodwinds",
]

# Which stems to MUTE so the user plays them live
MUTE_STEMS = {"Guitar"}  # Mute guitar — user plays it with gestures


# ═══════════════════════════════════════════════════════════════════════
#  STEP 1: GENERATE SONG (via Suno)
# ═══════════════════════════════════════════════════════════════════════

def step_generate(topic, tags="", instrumental=True):
    """Generate a song via Suno and return the completed clip."""
    print("\n" + "=" * 60)
    print("  STEP 1: GENERATE SONG (Suno AI)")
    print("=" * 60)

    clip = generate_song(
        topic=topic,
        tags=tags,
        instrumental=instrumental,
    )
    clip_id = clip["id"]
    print(f"\n  Waiting for generation to complete...")
    final_clip = poll_for_complete(clip_id, max_wait=300)

    title = final_clip.get("title", "AI Song")
    duration = final_clip.get("metadata", {}).get("duration", "?")
    print(f"\n  Generated: \"{title}\" ({duration}s)")

    return final_clip


# ═══════════════════════════════════════════════════════════════════════
#  STEP 2: STEM SEPARATION
# ═══════════════════════════════════════════════════════════════════════

def step_separate(clip_id, output_dir=None):
    """Separate a completed clip into 12 stems. Returns list of stem clips."""
    if output_dir is None:
        output_dir = STEMS_DIR

    print("\n" + "=" * 60)
    print("  STEP 2: STEM SEPARATION (12 tracks)")
    print("=" * 60)

    stem_clips = separate_stems(clip_id)
    completed = poll_stems(stem_clips, max_wait=300)

    # Download all stems
    os.makedirs(output_dir, exist_ok=True)
    stem_paths = {}
    for stem in completed:
        title = stem.get("title", "")
        # Extract stem name from title (format: "Song Title - Stem Name")
        stem_name = title.split(" - ")[-1] if " - " in title else title
        path = download_clip(stem, output_dir=output_dir)
        if path:
            stem_paths[stem_name] = path

    print(f"\n  Downloaded {len(stem_paths)} stems to {output_dir}")
    for name, path in stem_paths.items():
        muted = " [MUTED - you play this!]" if name in MUTE_STEMS else ""
        print(f"    {name:<20} {os.path.basename(path)}{muted}")

    return stem_paths


# ═══════════════════════════════════════════════════════════════════════
#  STEP 3: PLAY BACKING BAND + LIVE GUITAR
# ═══════════════════════════════════════════════════════════════════════

def step_jam(stem_paths, instrument="nylon_guitar", mute_stems=None, gain=0.8):
    """
    Play stem backing tracks + live FluidSynth guitar.

    Uses pygame.mixer for MP3 stem playback (multi-channel)
    and FluidSynth for real-time gesture input.
    """
    import pygame

    if mute_stems is None:
        mute_stems = MUTE_STEMS

    print("\n" + "=" * 60)
    print("  STEP 3: JAM SESSION")
    print("=" * 60)

    # ── Separate backing stems from muted stems ─────────────────────
    backing_stems = {}
    muted = {}
    for name, path in stem_paths.items():
        if name in mute_stems:
            muted[name] = path
        else:
            backing_stems[name] = path

    print(f"\n  Backing tracks ({len(backing_stems)}):")
    for name in backing_stems:
        print(f"    ✓ {name}")
    print(f"\n  Muted (you play live):")
    for name in muted:
        print(f"    🎸 {name}")

    # ── Initialize pygame mixer for stem playback ───────────────────
    pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=1024)
    # pygame.mixer has limited channels — allocate enough
    pygame.mixer.set_num_channels(len(backing_stems) + 2)

    # Load backing stems as Sound objects
    loaded_stems = {}
    for i, (name, path) in enumerate(backing_stems.items()):
        try:
            sound = pygame.mixer.Sound(path)
            loaded_stems[name] = (sound, i)
            print(f"  Loaded: {name} → channel {i}")
        except Exception as e:
            print(f"  Failed to load {name}: {e}")

    if not loaded_stems:
        print("  No backing tracks loaded! Exiting.")
        return

    # ── Initialize FluidSynth for live guitar ───────────────────────
    sf2_files = sorted([
        os.path.join(SOUNDFONT_DIR, f)
        for f in os.listdir(SOUNDFONT_DIR)
        if f.lower().endswith(".sf2")
    ]) if os.path.exists(SOUNDFONT_DIR) else []

    if not sf2_files:
        print("  No soundfont found! Cannot do live guitar.")
        return

    from fluidsynth_player import FluidSynthPlayer

    player = FluidSynthPlayer(
        soundfont_path=sf2_files[0],
        instrument=instrument,
        gain=gain,
    )

    # ── Start playback ──────────────────────────────────────────────
    print("\n" + "─" * 60)
    print("  🎵 BACKING BAND STARTING...")
    print("  🎸 Play notes to jam along!")
    print()
    print("  Controls:")
    print("    Type a note (e.g. C4, E3, G#5) or MIDI number to play")
    print("    'stop' = silence all your notes")
    print("    'pause' = pause/resume backing tracks")
    print("    'vol <0-100>' = set backing volume")
    print("    'inst <name>' = switch instrument (e.g. 'inst steel_guitar')")
    print("    'rec' = start recording your session")
    print("    'save [file]' = save recording as MIDI")
    print("    'q' = quit")
    print("─" * 60)

    # Play all backing stems simultaneously
    for name, (sound, ch_idx) in loaded_stems.items():
        channel = pygame.mixer.Channel(ch_idx)
        channel.play(sound)

    band_playing = True
    recording = False
    record_start = None
    recorded_events = []

    # ── Note name parser ────────────────────────────────────────────
    NOTE_MAP = {
        "C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11,
    }

    def parse_note(text):
        """Parse 'C4', 'G#5', 'Bb3', or a MIDI number → MIDI note int."""
        text = text.strip()
        # Direct MIDI number
        try:
            n = int(text)
            if 0 <= n <= 127:
                return n
        except ValueError:
            pass
        # Note name
        text = text.upper()
        if len(text) < 2:
            return None
        name = text[0]
        if name not in NOTE_MAP:
            return None
        base = NOTE_MAP[name]
        rest = text[1:]
        # Sharps/flats
        if rest.startswith("#") or rest.startswith("S"):
            base += 1
            rest = rest[1:]
        elif rest.startswith("B") and len(rest) > 1:
            base -= 1
            rest = rest[1:]
        # Octave
        try:
            octave = int(rest)
        except ValueError:
            return None
        midi = (octave + 1) * 12 + base
        if 0 <= midi <= 127:
            return midi
        return None

    # ── Interactive loop ────────────────────────────────────────────
    active_notes = set()

    try:
        while True:
            try:
                line = input("  🎸 > ").strip()
            except EOFError:
                break

            if not line:
                continue

            cmd = line.lower()

            if cmd == "q" or cmd == "quit":
                break

            if cmd == "stop":
                for n in list(active_notes):
                    player.noteoff(n)
                active_notes.clear()
                print("  All notes off.")
                continue

            if cmd == "pause":
                if band_playing:
                    pygame.mixer.pause()
                    band_playing = False
                    print("  Backing band paused.")
                else:
                    pygame.mixer.unpause()
                    band_playing = True
                    print("  Backing band resumed.")
                continue

            if cmd.startswith("vol "):
                try:
                    vol = int(cmd.split()[1]) / 100.0
                    for name, (sound, _) in loaded_stems.items():
                        sound.set_volume(max(0, min(1, vol)))
                    print(f"  Backing volume: {int(vol * 100)}%")
                except (ValueError, IndexError):
                    print("  Usage: vol 0-100")
                continue

            if cmd.startswith("inst "):
                new_inst = cmd.split(None, 1)[1]
                try:
                    player.set_instrument(new_inst)
                    print(f"  Switched to: {new_inst}")
                except Exception as e:
                    print(f"  Error: {e}")
                continue

            if cmd == "rec":
                recording = True
                record_start = time.time()
                recorded_events = []
                print("  🔴 Recording started. Play notes!")
                continue

            if cmd.startswith("save"):
                if not recorded_events:
                    print("  Nothing recorded yet. Use 'rec' first.")
                    continue
                parts = cmd.split(None, 1)
                path = parts[1] if len(parts) > 1 else os.path.join(
                    OUTPUT_DIR, "jam_session.mid"
                )
                _save_recording(recorded_events, path)
                continue

            # ── Try to parse as a note ──────────────────────────────
            note = parse_note(line)
            if note is not None:
                # Toggle: if already playing, stop it; otherwise start
                if note in active_notes:
                    player.noteoff(note)
                    active_notes.discard(note)
                else:
                    player.noteon(note, velocity=100)
                    active_notes.add(note)
                    if recording and record_start:
                        t = time.time() - record_start
                        recorded_events.append((t, "on", note, 100))

                NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F",
                              "F#", "G", "G#", "A", "A#", "B"]
                name = f"{NOTE_NAMES[note % 12]}{note // 12 - 1}"
                state = "ON" if note in active_notes else "OFF"
                print(f"  {name} (MIDI {note}) → {state}")
            else:
                print(f"  Unknown command: '{line}'. Type a note (C4, E3, 60) or 'q'.")

    except KeyboardInterrupt:
        print("\n\n  Jam session ended!")

    # ── Cleanup ─────────────────────────────────────────────────────
    print("\n  Stopping backing band...")
    pygame.mixer.stop()
    pygame.mixer.quit()

    for n in list(active_notes):
        player.noteoff(n)
    player.cleanup()

    if recorded_events:
        print(f"\n  You recorded {len(recorded_events)} notes.")
        save = input("  Save recording? (y/N): ").strip().lower()
        if save == "y":
            path = os.path.join(OUTPUT_DIR, "jam_session.mid")
            _save_recording(recorded_events, path)

    print("\n  Jam session complete!")


def _save_recording(events, output_path):
    """Save recorded note events as MIDI."""
    import pretty_midi

    os.makedirs(os.path.dirname(os.path.abspath(output_path)) or ".", exist_ok=True)

    midi = pretty_midi.PrettyMIDI()
    inst = pretty_midi.Instrument(program=24, name="Jam Guitar")

    # Simple: each note-on gets a fixed duration since we don't track note-off timing
    for t, event_type, note, velocity in events:
        if event_type == "on":
            midi_note = pretty_midi.Note(
                velocity=velocity, pitch=note,
                start=t, end=t + 0.5,
            )
            inst.notes.append(midi_note)

    midi.instruments.append(inst)
    midi.write(output_path)
    print(f"  Saved {len(inst.notes)} notes → {output_path}")


# ═══════════════════════════════════════════════════════════════════════
#  FULL PIPELINE
# ═══════════════════════════════════════════════════════════════════════

def run_jam_band(
    topic=None,
    tags="",
    midi_path=None,
    clip_id=None,
    stems_dir=None,
    instrument="nylon_guitar",
    instrumental=True,
    mute=None,
    gain=0.8,
):
    """
    Full AI Jam Band pipeline.

    Provide ONE of:
        topic      → generate from description
        midi_path  → analyze MIDI, then generate
        clip_id    → skip generation, just stem-separate
        stems_dir  → skip everything, just play stems
    """
    if mute is None:
        mute = MUTE_STEMS

    print()
    print("╔" + "═" * 58 + "╗")
    print("║          🎸  AI JAM BAND  🎸                              ║")
    print("║  Gesture-play guitar over an AI-generated backing band    ║")
    print("╠" + "═" * 58 + "╣")
    if topic:
        print(f"║  Topic: {topic[:48]:<48} ║")
    if tags:
        print(f"║  Tags:  {tags[:48]:<48} ║")
    print(f"║  Your instrument: {instrument:<38} ║")
    print(f"║  Muted stems: {', '.join(mute):<42} ║")
    print("╚" + "═" * 58 + "╝")

    stem_paths = None

    # ── Option A: Already have stems on disk ────────────────────────
    if stems_dir:
        print(f"\n  Using existing stems from: {stems_dir}")
        stem_paths = _load_stems_from_dir(stems_dir)

    # ── Option B: Have a clip ID, just need stem separation ─────────
    elif clip_id:
        stem_paths = step_separate(clip_id)

    # ── Option C: Generate from MIDI analysis ───────────────────────
    elif midi_path:
        info = describe_midi(midi_path)
        topic = info["topic"]
        final_clip = step_generate(topic=topic, tags=tags, instrumental=instrumental)
        stem_paths = step_separate(final_clip["id"])

    # ── Option D: Generate from topic description ───────────────────
    elif topic:
        final_clip = step_generate(topic=topic, tags=tags, instrumental=instrumental)
        stem_paths = step_separate(final_clip["id"])

    else:
        print("Error: provide --topic, --from-midi, --clip-id, or --stems-dir")
        sys.exit(1)

    if not stem_paths:
        print("  No stems available. Exiting.")
        sys.exit(1)

    # ── Start the jam session ───────────────────────────────────────
    step_jam(stem_paths, instrument=instrument, mute_stems=mute, gain=gain)


def _load_stems_from_dir(stems_dir):
    """Load stem MP3s from a directory, matching names to stem labels."""
    stem_paths = {}
    for f in sorted(os.listdir(stems_dir)):
        if not f.lower().endswith(".mp3"):
            continue
        # Try to match stem name from filename
        for stem_name in STEM_ORDER:
            if stem_name.lower().replace(" ", "_") in f.lower().replace(" ", "_"):
                stem_paths[stem_name] = os.path.join(stems_dir, f)
                break
        else:
            # Use filename as stem name
            name = os.path.splitext(f)[0]
            stem_paths[name] = os.path.join(stems_dir, f)

    return stem_paths


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="AI Jam Band — play guitar over an AI-generated backing band.",
        epilog=(
            'Examples:\n'
            '  python3 jam_band.py --topic "funky rock jam" --tags "rock, funk"\n'
            '  python3 jam_band.py --from-midi session.mid\n'
            '  python3 jam_band.py --clip-id abc-123-def-456\n'
            '  python3 jam_band.py --stems-dir stems/\n'
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    source = parser.add_mutually_exclusive_group()
    source.add_argument("--topic", help="Song description for generation")
    source.add_argument("--from-midi", metavar="MIDI", help="Analyze MIDI → generate → jam")
    source.add_argument("--clip-id", help="Existing Suno clip ID (skip generation)")
    source.add_argument("--stems-dir", help="Directory with stem MP3s (skip everything)")

    parser.add_argument("--tags", default="", help="Musical style tags")
    parser.add_argument("--instrument", default="nylon_guitar",
                        help="Your live instrument sound (default: nylon_guitar)")
    parser.add_argument("--mute", nargs="+", default=["Guitar"],
                        help='Stems to mute (default: Guitar). E.g. --mute Guitar Vocals')
    parser.add_argument("--instrumental", action="store_true", default=True,
                        help="Generate instrumental (default: True)")
    parser.add_argument("--with-vocals", action="store_true",
                        help="Include vocals in generation")
    parser.add_argument("--gain", type=float, default=0.8, help="Volume 0.0-1.0")

    args = parser.parse_args()

    instrumental = not args.with_vocals
    mute = set(args.mute)

    run_jam_band(
        topic=args.topic,
        tags=args.tags,
        midi_path=args.from_midi,
        clip_id=args.clip_id,
        stems_dir=args.stems_dir,
        instrument=args.instrument,
        instrumental=instrumental,
        mute=mute,
        gain=args.gain,
    )


if __name__ == "__main__":
    main()
