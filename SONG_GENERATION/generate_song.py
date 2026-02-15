#!/usr/bin/env python3
"""
Generate a polished song using Suno's official TreeHacks 2026 API.

Modes:
    generate    – Generate a new song from a topic/style description
    custom      – Generate with your own lyrics
    cover       – Re-style an existing Suno clip in a new genre
    stems       – Separate a completed clip into 12 instrument stems

Pipeline for gesture sessions:
    1. Record your gesture session as MIDI
    2. Describe the vibe/style → Suno generates a full polished song
    3. Optionally separate into stems for remixing

Usage:
    # Simple generation from a description
    python3 generate_song.py --topic "upbeat pop song about coding" --tags "pop, electronic, upbeat"

    # FROM YOUR GESTURE SESSION: analyze MIDI → auto-describe → generate
    python3 generate_song.py --from-midi session.mid --tags "acoustic guitar"

    # MULTI-STYLE SHOWCASE: same MIDI in 6 different genres!
    python3 generate_song.py --from-midi session.mid --multi-style
    python3 generate_song.py --from-midi session.mid --multi-style rock jazz edm classical

    # Multi-style from a topic
    python3 generate_song.py --topic "energetic guitar riff" --multi-style rock jazz lofi

    # Custom lyrics
    python3 generate_song.py --custom --lyrics "[Verse]\\nStrumming through the night" --tags "acoustic rock"

    # Cover an existing clip in a new style
    python3 generate_song.py --cover CLIP_ID --tags "jazz, piano, smooth"

    # Stem separation (12 stems from a completed clip)
    python3 generate_song.py --stems CLIP_ID

Requires:
    SUNO_TREEHACKS_TOKEN in .env file  (get from Suno booth at TreeHacks)

API Docs: https://suno-ai.notion.site/Suno-TreeHacks-2026-API-Docs
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.error

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT_DIR = os.path.join(SCRIPT_DIR, "generated_songs")

# Load .env
_env_path = os.path.join(REPO_DIR, ".env")
if os.path.exists(_env_path):
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))

# Import render function (for MIDI → WAV)
sys.path.insert(0, SCRIPT_DIR)
from render_midi_to_wav import render_midi_to_wav


# ═══════════════════════════════════════════════════════════════════════
#  MIDI → TEXT ANALYZER
#  Converts a MIDI file into a rich musical description that Suno
#  can use to generate a song matching the performance.
# ═══════════════════════════════════════════════════════════════════════

NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Major key profiles (Krumhansl-Kessler)
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]


def analyze_midi(midi_path):
    """
    Analyze a MIDI file and return a musical description dict.

    Returns dict with keys:
        key, tempo_bpm, duration_s, num_notes, note_range,
        avg_velocity, density, rhythm_feel, pitch_description, topic
    """
    import pretty_midi

    pm = pretty_midi.PrettyMIDI(midi_path)

    all_notes = []
    for inst in pm.instruments:
        if not inst.is_drum:
            all_notes.extend(inst.notes)

    if not all_notes:
        return {
            "key": "C major",
            "tempo_bpm": 120,
            "duration_s": 0,
            "num_notes": 0,
            "note_range": "empty",
            "avg_velocity": 0,
            "density": 0,
            "rhythm_feel": "none",
            "pitch_description": "no notes detected",
            "topic": "a short musical idea",
        }

    all_notes.sort(key=lambda n: n.start)

    # ── Duration ────────────────────────────────────────────────────
    duration = max(n.end for n in all_notes) - min(n.start for n in all_notes)

    # ── Tempo ───────────────────────────────────────────────────────
    tempo_times, tempos = pm.get_tempo_changes()
    tempo = int(tempos[0]) if len(tempos) > 0 else 120

    # ── Key detection (pitch class histogram correlation) ──────────
    pitch_classes = [0] * 12
    for n in all_notes:
        weight = n.end - n.start  # weight by duration
        pitch_classes[n.pitch % 12] += weight

    total = sum(pitch_classes) or 1
    pitch_classes = [p / total for p in pitch_classes]

    best_key = "C major"
    best_corr = -999
    for root in range(12):
        rotated = pitch_classes[root:] + pitch_classes[:root]
        # Major correlation
        corr_maj = sum(a * b for a, b in zip(rotated, MAJOR_PROFILE))
        if corr_maj > best_corr:
            best_corr = corr_maj
            best_key = f"{NOTE_NAMES[root]} major"
        # Minor correlation
        corr_min = sum(a * b for a, b in zip(rotated, MINOR_PROFILE))
        if corr_min > best_corr:
            best_corr = corr_min
            best_key = f"{NOTE_NAMES[root]} minor"

    # ── Note range ──────────────────────────────────────────────────
    pitches = [n.pitch for n in all_notes]
    low_note = min(pitches)
    high_note = max(pitches)
    low_name = f"{NOTE_NAMES[low_note % 12]}{low_note // 12 - 1}"
    high_name = f"{NOTE_NAMES[high_note % 12]}{high_note // 12 - 1}"
    note_range = f"{low_name} to {high_name}"
    span = high_note - low_note

    # ── Velocity (dynamics) ─────────────────────────────────────────
    velocities = [n.velocity for n in all_notes]
    avg_vel = sum(velocities) / len(velocities)
    if avg_vel > 100:
        dynamics = "loud, powerful"
    elif avg_vel > 75:
        dynamics = "moderate energy"
    elif avg_vel > 50:
        dynamics = "gentle, moderate"
    else:
        dynamics = "soft, delicate"

    # ── Note density ────────────────────────────────────────────────
    density = len(all_notes) / max(duration, 0.1)
    if density > 8:
        density_desc = "very fast, dense note patterns"
    elif density > 4:
        density_desc = "flowing, melodic passages"
    elif density > 2:
        density_desc = "moderate pace, clear melody"
    elif density > 0.5:
        density_desc = "slow, spacious, contemplative"
    else:
        density_desc = "sparse, ambient"

    # ── Rhythm feel ─────────────────────────────────────────────────
    if len(all_notes) >= 3:
        intervals = []
        for i in range(1, min(len(all_notes), 50)):
            dt = all_notes[i].start - all_notes[i - 1].start
            if dt > 0.01:
                intervals.append(dt)
        if intervals:
            avg_interval = sum(intervals) / len(intervals)
            var = sum((x - avg_interval) ** 2 for x in intervals) / len(intervals)
            cv = (var ** 0.5) / avg_interval if avg_interval > 0 else 0
            if cv < 0.2:
                rhythm_feel = "steady, rhythmic"
            elif cv < 0.5:
                rhythm_feel = "somewhat syncopated"
            else:
                rhythm_feel = "free-form, expressive timing"
        else:
            rhythm_feel = "chordal"
    else:
        rhythm_feel = "minimal"

    # ── Pitch movement ──────────────────────────────────────────────
    if len(all_notes) >= 3:
        movements = [all_notes[i].pitch - all_notes[i - 1].pitch
                     for i in range(1, min(len(all_notes), 50))]
        avg_move = sum(movements) / len(movements)
        if avg_move > 2:
            pitch_desc = "ascending, uplifting melody"
        elif avg_move < -2:
            pitch_desc = "descending, melancholic melody"
        elif span > 24:
            pitch_desc = "wide-ranging, dramatic melody"
        elif span > 12:
            pitch_desc = "expressive melodic movement"
        else:
            pitch_desc = "focused, contained melodic phrases"
    else:
        pitch_desc = "simple melodic idea"

    # ── Build topic string ──────────────────────────────────────────
    mood_hints = []
    if "minor" in best_key:
        mood_hints.append("emotional")
    else:
        mood_hints.append("bright")
    if avg_vel > 90:
        mood_hints.append("energetic")
    elif avg_vel < 50:
        mood_hints.append("gentle")
    if density > 6:
        mood_hints.append("virtuosic")
    if tempo > 140:
        mood_hints.append("fast-paced")
    elif tempo < 80:
        mood_hints.append("slow, contemplative")

    mood_str = ", ".join(mood_hints)
    topic = (
        f"A {mood_str} instrumental piece in {best_key} at {tempo} BPM. "
        f"Features {density_desc} with {pitch_desc}. "
        f"The performance feels {dynamics} and {rhythm_feel}, "
        f"spanning {note_range}."
    )

    return {
        "key": best_key,
        "tempo_bpm": tempo,
        "duration_s": round(duration, 1),
        "num_notes": len(all_notes),
        "note_range": note_range,
        "avg_velocity": round(avg_vel),
        "density": round(density, 1),
        "rhythm_feel": rhythm_feel,
        "pitch_description": pitch_desc,
        "topic": topic,
    }


def describe_midi(midi_path):
    """
    Analyze MIDI and print a human-readable summary + return the topic string.
    """
    info = analyze_midi(midi_path)

    print(f"\n[MIDI Analysis] {os.path.basename(midi_path)}")
    print(f"  Key:       {info['key']}")
    print(f"  Tempo:     {info['tempo_bpm']} BPM")
    print(f"  Duration:  {info['duration_s']}s")
    print(f"  Notes:     {info['num_notes']}")
    print(f"  Range:     {info['note_range']}")
    print(f"  Velocity:  {info['avg_velocity']} avg")
    print(f"  Density:   {info['density']} notes/sec")
    print(f"  Rhythm:    {info['rhythm_feel']}")
    print(f"  Melody:    {info['pitch_description']}")
    print(f"\n  Generated topic for Suno:")
    print(f"    \"{info['topic']}\"")

    return info


# ═══════════════════════════════════════════════════════════════════════
#  MULTI-STYLE GENERATOR
#  Generate the same musical idea in multiple styles simultaneously.
# ═══════════════════════════════════════════════════════════════════════

STYLE_PRESETS = {
    "acoustic":    "acoustic guitar, fingerstyle, warm, intimate",
    "rock":        "rock, electric guitar, powerful drums, anthem",
    "jazz":        "jazz, piano, saxophone, smooth, swing",
    "edm":         "EDM, electronic, synth, bass drop, energetic",
    "classical":   "classical, orchestral, strings, elegant",
    "lofi":        "lo-fi hip hop, chill beats, vinyl crackle, relaxing",
    "rnb":         "R&B, smooth vocals, soul, groove",
    "latin":       "latin, bossa nova, acoustic guitar, percussion",
    "metal":       "metal, heavy guitar, double bass drums, aggressive",
    "country":     "country, acoustic guitar, banjo, fiddle, storytelling",
    "funk":        "funk, slap bass, wah guitar, groovy drums",
    "ambient":     "ambient, atmospheric, synthesizer pads, ethereal",
}


def multi_style_generate(
    topic,
    styles=None,
    instrumental=True,
    download=True,
):
    """
    Generate the same topic in multiple styles. Great for demos!

    Args:
        topic: Musical description (from MIDI analysis or manual).
        styles: List of style names from STYLE_PRESETS, or None for all.
        instrumental: True for no vocals.
        download: Whether to download results.

    Returns:
        list[dict]: Results per style with clip info and paths.
    """
    if styles is None:
        styles = ["acoustic", "rock", "jazz", "edm", "classical", "lofi"]

    print()
    print("╔" + "═" * 58 + "╗")
    print("║  Multi-Style Generation                                  ║")
    print("╠" + "═" * 58 + "╣")
    print(f"║  Styles: {', '.join(styles)[:48]:<48} ║")
    print(f"║  Topic:  {topic[:48]:<48} ║")
    print("╚" + "═" * 58 + "╝")

    # ── Submit all styles ───────────────────────────────────────────
    submissions = []
    for style_name in styles:
        tags = STYLE_PRESETS.get(style_name, style_name)
        print(f"\n  [{style_name}] Submitting with tags: {tags}")
        try:
            clip = generate_song(
                topic=topic,
                tags=tags,
                instrumental=instrumental,
            )
            submissions.append({"style": style_name, "tags": tags, "clip": clip})
        except Exception as e:
            print(f"  [{style_name}] Failed to submit: {e}")
        # Small delay to be respectful of rate limits
        time.sleep(1)

    print(f"\n  Submitted {len(submissions)} generations. Polling...")

    # ── Poll all clips ──────────────────────────────────────────────
    results = []
    for sub in submissions:
        style_name = sub["style"]
        clip_id = sub["clip"]["id"]
        print(f"\n  [{style_name}] Waiting for clip {clip_id[:12]}...")
        try:
            final = poll_for_complete(clip_id, max_wait=300)
            result = {"style": style_name, "clip": final, "audio_path": None}

            if download:
                path = download_clip(final, suffix=f"_{style_name}")
                result["audio_path"] = path

            results.append(result)
        except Exception as e:
            print(f"  [{style_name}] Failed: {e}")

    # ── Summary ─────────────────────────────────────────────────────
    print()
    print("═" * 58)
    print(f"  Multi-Style Results ({len(results)}/{len(submissions)} succeeded):")
    for r in results:
        title = r["clip"].get("title", "?")
        dur = r["clip"].get("metadata", {}).get("duration", "?")
        print(f"    {r['style']:<12} \"{title}\" ({dur}s)")
        if r.get("audio_path"):
            print(f"               → {r['audio_path']}")
    print("═" * 58)

    return results


# ═══════════════════════════════════════════════════════════════════════
#  SUNO TREEHACKS API CLIENT
# ═══════════════════════════════════════════════════════════════════════

SUNO_BASE = "https://studio-api.prod.suno.com/api/v2/external/hackathons"


def _get_token():
    """Retrieve SUNO_TREEHACKS_TOKEN from environment."""
    token = os.environ.get("SUNO_TREEHACKS_TOKEN")
    if not token:
        raise ValueError(
            "SUNO_TREEHACKS_TOKEN not set. Add it to your .env file:\n"
            "  SUNO_TREEHACKS_TOKEN=your_token_here\n"
            "Get your token from the Suno booth at TreeHacks!"
        )
    return token


def _suno_post(endpoint, payload, token=None):
    """POST to Suno TreeHacks API → JSON."""
    if token is None:
        token = _get_token()

    url = f"{SUNO_BASE}/{endpoint.lstrip('/')}"
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Suno API error (HTTP {e.code}): {body[:500]}") from e


def _suno_get(endpoint, token=None):
    """GET from Suno TreeHacks API → JSON."""
    if token is None:
        token = _get_token()

    url = f"{SUNO_BASE}/{endpoint.lstrip('/')}"

    req = urllib.request.Request(
        url,
        headers={"Authorization": f"Bearer {token}"},
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Suno API error (HTTP {e.code}): {body[:500]}") from e


# ═══════════════════════════════════════════════════════════════════════
#  GENERATE
# ═══════════════════════════════════════════════════════════════════════

def generate_song(
    topic=None,
    tags="",
    negative_tags="",
    lyrics=None,
    instrumental=False,
    cover_clip_id=None,
):
    """
    Submit a song generation request to Suno.

    Args:
        topic: Description for simple mode (e.g. "upbeat pop song about coding").
        tags: Musical style (genres, instruments, moods). Max 100 chars.
        negative_tags: Styles to avoid. Max 100 chars.
        lyrics: Custom lyrics (use instead of topic for custom mode).
        instrumental: True for no vocals.
        cover_clip_id: UUID of existing clip to cover in a new style.

    Returns:
        dict: Clip object with 'id' for polling.
    """
    payload = {}

    if cover_clip_id:
        payload["cover_clip_id"] = cover_clip_id
        print(f"[Suno] Generating COVER of clip {cover_clip_id[:12]}...")
    elif lyrics:
        payload["prompt"] = lyrics
        print(f"[Suno] Generating song with CUSTOM LYRICS...")
    elif topic:
        payload["topic"] = topic
        print(f"[Suno] Generating song: \"{topic[:60]}\"...")
    else:
        raise ValueError("Provide either --topic, --lyrics, or --cover")

    if tags:
        payload["tags"] = tags[:100]
        print(f"  Tags: {tags[:100]}")
    if negative_tags:
        payload["negative_tags"] = negative_tags[:100]
        print(f"  Avoid: {negative_tags[:100]}")
    if instrumental:
        payload["make_instrumental"] = True
        print(f"  Instrumental: yes (no vocals)")

    clip = _suno_post("/generate", payload)

    clip_id = clip.get("id", "unknown")
    status = clip.get("status", "unknown")
    print(f"  Clip ID: {clip_id}")
    print(f"  Status:  {status}")

    return clip


# ═══════════════════════════════════════════════════════════════════════
#  POLL FOR RESULTS  (with streaming support)
# ═══════════════════════════════════════════════════════════════════════

def poll_for_clip(clip_id, max_wait=300, poll_interval=5):
    """
    Poll Suno for clip status. Returns when streaming or complete.

    Args:
        clip_id: Clip UUID from generate_song().
        max_wait: Max seconds to wait.
        poll_interval: Seconds between polls.

    Returns:
        dict: Clip object with audio_url.
    """
    print(f"[Suno] Polling for clip {clip_id[:12]}... (up to {max_wait}s)")

    start = time.time()
    while time.time() - start < max_wait:
        try:
            clips = _suno_get(f"/clips?ids={clip_id}")

            if isinstance(clips, list) and clips:
                clip = clips[0]
                status = clip.get("status", "")
                title = clip.get("title", "")
                audio_url = clip.get("audio_url", "")

                if status == "streaming" and audio_url:
                    print(f"  🎵 STREAMING! Title: \"{title}\"")
                    print(f"  Audio URL (live): {audio_url}")
                    print(f"  (Song is generating in real-time, keep polling for 'complete')")
                    # Keep polling to get the final complete version
                    pass

                elif status == "complete" and audio_url:
                    duration = clip.get("metadata", {}).get("duration", "?")
                    print(f"  ✓ COMPLETE! Title: \"{title}\"")
                    print(f"  Duration: {duration}s")
                    return clip

                elif status == "error":
                    err_type = clip.get("metadata", {}).get("error_type", "unknown")
                    err_msg = clip.get("metadata", {}).get("error_message", "unknown")
                    raise RuntimeError(f"Generation failed: {err_type} — {err_msg}")

                elif status in ("submitted", "queued"):
                    pass  # still waiting

        except (urllib.error.URLError, json.JSONDecodeError) as e:
            print(f"  Poll error: {e}")

        elapsed = int(time.time() - start)
        print(f"  Waiting... ({elapsed}s, status: {status if 'status' in dir() else '?'})")
        time.sleep(poll_interval)

    raise TimeoutError(f"Generation did not complete within {max_wait}s")


def poll_for_complete(clip_id, max_wait=300, poll_interval=5):
    """
    Poll until clip is fully 'complete' (not just streaming).

    Returns:
        dict: Final clip with downloadable audio_url.
    """
    print(f"[Suno] Waiting for final audio...")

    start = time.time()
    last_status = ""
    while time.time() - start < max_wait:
        try:
            clips = _suno_get(f"/clips?ids={clip_id}")
            if isinstance(clips, list) and clips:
                clip = clips[0]
                status = clip.get("status", "")

                if status != last_status:
                    last_status = status
                    title = clip.get("title", "")
                    if status == "streaming":
                        print(f"  Streaming: \"{title}\" — audio available for live playback")
                    elif status == "complete":
                        duration = clip.get("metadata", {}).get("duration", "?")
                        print(f"  Complete: \"{title}\" ({duration}s)")
                        return clip
                    elif status == "error":
                        err = clip.get("metadata", {}).get("error_message", "unknown")
                        raise RuntimeError(f"Generation failed: {err}")

        except (urllib.error.URLError, json.JSONDecodeError) as e:
            print(f"  Poll error: {e}")

        elapsed = int(time.time() - start)
        if elapsed % 15 == 0 and elapsed > 0:
            print(f"  Still generating... ({elapsed}s)")
        time.sleep(poll_interval)

    raise TimeoutError(f"Generation did not complete within {max_wait}s")


# ═══════════════════════════════════════════════════════════════════════
#  STEM SEPARATION  (12 stems)
# ═══════════════════════════════════════════════════════════════════════

STEM_NAMES = [
    "Vocals", "Backing Vocals", "Drums", "Bass", "Guitar", "Keyboard",
    "Percussion", "Strings", "Synth", "FX", "Brass", "Woodwinds",
]


def separate_stems(clip_id):
    """
    Request stem separation for a completed clip.

    Returns:
        list[dict]: 12 stem clip objects (submitted, need polling).
    """
    print(f"[Suno] Requesting stem separation for {clip_id[:12]}...")
    print(f"  Splitting into 12 stems: {', '.join(STEM_NAMES)}")
    print(f"  Cost: 25 credits")

    stems = _suno_post("/stem", {"clip_id": clip_id})

    if isinstance(stems, list):
        print(f"  Got {len(stems)} stem clips. Polling for completion...")
        return stems
    else:
        raise RuntimeError(f"Unexpected stem response: {stems}")


def poll_stems(stem_clips, max_wait=300, poll_interval=10):
    """
    Poll all stem clips until complete. Returns list with audio_urls.
    """
    ids = [s["id"] for s in stem_clips]
    ids_str = ",".join(ids)

    print(f"[Suno] Waiting for {len(ids)} stems to complete...")

    start = time.time()
    while time.time() - start < max_wait:
        clips = _suno_get(f"/clips?ids={ids_str}")

        if isinstance(clips, list):
            complete = sum(1 for c in clips if c.get("status") == "complete")
            errors = [c for c in clips if c.get("status") == "error"]

            if errors:
                for e in errors:
                    print(f"  Error on stem {e.get('title', '?')}")

            if complete == len(ids):
                print(f"  All {len(ids)} stems complete!")
                return clips

            elapsed = int(time.time() - start)
            print(f"  {complete}/{len(ids)} stems done ({elapsed}s)")

        time.sleep(poll_interval)

    raise TimeoutError(f"Stems did not complete within {max_wait}s")


# ═══════════════════════════════════════════════════════════════════════
#  DOWNLOAD
# ═══════════════════════════════════════════════════════════════════════

def download_clip(clip, output_dir=None, suffix=""):
    """Download a clip's audio to local disk."""
    if output_dir is None:
        output_dir = OUTPUT_DIR
    os.makedirs(output_dir, exist_ok=True)

    audio_url = clip.get("audio_url")
    if not audio_url:
        print(f"  No audio URL for clip {clip.get('id', '?')}, skipping.")
        return None

    title = clip.get("title", "generated").replace(" ", "_").replace("/", "-")
    clip_id = clip.get("id", "unknown")[:8]
    filename = f"{title}_{clip_id}{suffix}.mp3"
    output_path = os.path.join(output_dir, filename)

    print(f"  Downloading: {filename}")
    urllib.request.urlretrieve(audio_url, output_path)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  Saved: {output_path} ({size_mb:.1f} MB)")
    return output_path


# ═══════════════════════════════════════════════════════════════════════
#  FULL PIPELINES
# ═══════════════════════════════════════════════════════════════════════

def pipeline_generate(
    topic=None,
    tags="",
    negative_tags="",
    lyrics=None,
    instrumental=False,
    cover_clip_id=None,
    do_stems=False,
    download=True,
):
    """
    Full pipeline: generate → poll → download (optionally stem-separate).

    Returns:
        dict with 'clip', 'audio_path', 'stems' (if requested).
    """
    mode = "cover" if cover_clip_id else ("custom" if lyrics else "generate")

    print()
    print("╔" + "═" * 58 + "╗")
    print(f"║  Suno Song Generation  ·  {mode.upper():<30} ║")
    print("╠" + "═" * 58 + "╣")
    if topic:
        print(f"║  Topic: {topic[:48]:<48} ║")
    if tags:
        print(f"║  Tags:  {tags[:48]:<48} ║")
    if instrumental:
        print(f"║  Mode:  Instrumental (no vocals)                       ║")
    print("╚" + "═" * 58 + "╝")

    # ── Step 1: Submit generation ───────────────────────────────────
    print("\n[Step 1] Submitting to Suno...")
    clip = generate_song(
        topic=topic,
        tags=tags,
        negative_tags=negative_tags,
        lyrics=lyrics,
        instrumental=instrumental,
        cover_clip_id=cover_clip_id,
    )
    clip_id = clip["id"]

    # ── Step 2: Poll for completion ─────────────────────────────────
    print("\n[Step 2] Waiting for generation...")
    final_clip = poll_for_complete(clip_id)

    result = {"clip": final_clip, "audio_path": None, "stems": None}

    # ── Step 3: Download ────────────────────────────────────────────
    if download:
        print("\n[Step 3] Downloading...")
        result["audio_path"] = download_clip(final_clip)

    # ── Step 4 (optional): Stem separation ──────────────────────────
    if do_stems:
        print("\n[Step 4] Separating into stems...")
        stem_clips = separate_stems(clip_id)
        completed_stems = poll_stems(stem_clips)

        stem_dir = os.path.join(OUTPUT_DIR, "stems")
        stem_paths = []
        for stem in completed_stems:
            path = download_clip(stem, output_dir=stem_dir)
            if path:
                stem_paths.append(path)
        result["stems"] = stem_paths

    # ── Summary ─────────────────────────────────────────────────────
    print()
    print("═" * 58)
    print(f"  Done! Title: \"{final_clip.get('title', '?')}\"")
    duration = final_clip.get("metadata", {}).get("duration", "?")
    print(f"  Duration: {duration}s")
    if result["audio_path"]:
        print(f"  Audio: {result['audio_path']}")
    if result.get("stems"):
        print(f"  Stems: {len(result['stems'])} tracks in {os.path.join(OUTPUT_DIR, 'stems')}")
    print(f"  Clip ID: {clip_id}")
    print(f"  (Use --cover {clip_id} to re-style, --stems {clip_id} to separate)")
    print("═" * 58)

    return result


def pipeline_stems(clip_id, download=True):
    """Stem-separate an existing completed clip."""
    print()
    print("╔" + "═" * 58 + "╗")
    print(f"║  Suno Stem Separation  ·  12 STEMS                    ║")
    print("╠" + "═" * 58 + "╣")
    print(f"║  Clip: {clip_id[:48]:<48}  ║")
    print("╚" + "═" * 58 + "╝")

    stem_clips = separate_stems(clip_id)
    completed_stems = poll_stems(stem_clips)

    if download:
        stem_dir = os.path.join(OUTPUT_DIR, "stems")
        for stem in completed_stems:
            download_clip(stem, output_dir=stem_dir)

    print()
    print("═" * 58)
    print(f"  Done! {len(completed_stems)} stems separated.")
    for s in completed_stems:
        print(f"    {s.get('title', '?')}")
    print("═" * 58)

    return completed_stems


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Generate music with Suno's TreeHacks 2026 API.",
        epilog=(
            'Examples:\n'
            '  python3 generate_song.py --topic "upbeat pop about coding" --tags "pop, electronic"\n'
            '  python3 generate_song.py --custom --lyrics "[Verse]\\nHello world" --tags "rock"\n'
            '  python3 generate_song.py --cover CLIP_ID --tags "jazz, piano"\n'
            '  python3 generate_song.py --stems CLIP_ID\n'
            '  python3 generate_song.py --topic "guitar jam" --tags "acoustic" --instrumental --with-stems\n'
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    # Mode selection
    mode_group = parser.add_mutually_exclusive_group()
    mode_group.add_argument(
        "--topic",
        help='Song description for simple mode (e.g. "upbeat pop about hackathons")',
    )
    mode_group.add_argument(
        "--custom",
        action="store_true",
        help="Custom lyrics mode (use with --lyrics)",
    )
    mode_group.add_argument(
        "--cover",
        metavar="CLIP_ID",
        help="Cover an existing clip in a new style",
    )
    mode_group.add_argument(
        "--stems",
        metavar="CLIP_ID",
        help="Separate a completed clip into 12 stems",
    )
    mode_group.add_argument(
        "--from-midi",
        metavar="MIDI_FILE",
        help="Analyze MIDI → auto-generate topic description → generate song",
    )

    # Generation parameters
    parser.add_argument(
        "--tags",
        default="",
        help='Musical style: genres, instruments, moods (max 100 chars)',
    )
    parser.add_argument(
        "--negative-tags",
        default="",
        help='Styles to avoid (max 100 chars)',
    )
    parser.add_argument(
        "--lyrics",
        default=None,
        help='Custom lyrics (use with --custom). Use \\n for newlines.',
    )
    parser.add_argument(
        "--instrumental",
        action="store_true",
        help="Generate instrumental (no vocals)",
    )
    parser.add_argument(
        "--with-stems",
        action="store_true",
        help="Also separate into stems after generation",
    )
    parser.add_argument(
        "--no-download",
        action="store_true",
        help="Skip downloading (just print URLs)",
    )

    # Multi-style
    parser.add_argument(
        "--multi-style",
        nargs="*",
        metavar="STYLE",
        help=(
            "Generate in multiple styles simultaneously. "
            "Provide style names or omit for defaults. "
            f"Available: {', '.join(sorted(STYLE_PRESETS.keys()))}"
        ),
    )

    # Legacy: positional file input
    parser.add_argument(
        "input_file",
        nargs="?",
        help="Optional: .mid/.wav file (use with --from-midi or alone)",
    )

    args = parser.parse_args()

    # ── Stem separation mode ────────────────────────────────────────
    if args.stems:
        pipeline_stems(args.stems, download=not args.no_download)
        return

    # ── Cover mode ──────────────────────────────────────────────────
    if args.cover:
        pipeline_generate(
            cover_clip_id=args.cover,
            tags=args.tags,
            negative_tags=args.negative_tags,
            instrumental=args.instrumental,
            do_stems=args.with_stems,
            download=not args.no_download,
        )
        return

    # ── Custom lyrics mode ──────────────────────────────────────────
    if args.custom:
        if not args.lyrics:
            print("Error: --custom requires --lyrics")
            sys.exit(1)
        lyrics = args.lyrics.replace("\\n", "\n")
        pipeline_generate(
            lyrics=lyrics,
            tags=args.tags,
            negative_tags=args.negative_tags,
            instrumental=args.instrumental,
            do_stems=args.with_stems,
            download=not args.no_download,
        )
        return

    # ── From-MIDI mode (analyze MIDI → generate) ────────────────────
    midi_file = args.from_midi or args.input_file
    if midi_file and midi_file.lower().endswith((".mid", ".midi")):
        info = describe_midi(midi_file)
        topic = info["topic"]

        # Multi-style from MIDI
        if args.multi_style is not None:
            styles = args.multi_style if args.multi_style else None  # None = defaults
            multi_style_generate(
                topic=topic,
                styles=styles,
                instrumental=args.instrumental or True,
                download=not args.no_download,
            )
            return

        # Single style from MIDI
        tags = args.tags or "instrumental"
        pipeline_generate(
            topic=topic,
            tags=tags,
            negative_tags=args.negative_tags,
            instrumental=args.instrumental or True,
            do_stems=args.with_stems,
            download=not args.no_download,
        )
        return

    # ── Simple/topic generation mode ────────────────────────────────
    topic = args.topic
    if not topic:
        parser.print_help()
        print("\nError: provide --topic, --from-midi, --custom --lyrics, --cover, or --stems")
        sys.exit(1)

    # Multi-style from topic
    if args.multi_style is not None:
        styles = args.multi_style if args.multi_style else None
        multi_style_generate(
            topic=topic,
            styles=styles,
            instrumental=args.instrumental,
            download=not args.no_download,
        )
        return

    pipeline_generate(
        topic=topic,
        tags=args.tags,
        negative_tags=args.negative_tags,
        instrumental=args.instrumental,
        do_stems=args.with_stems,
        download=not args.no_download,
    )


if __name__ == "__main__":
    main()
