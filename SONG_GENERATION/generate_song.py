#!/usr/bin/env python3
"""
Generate a polished song from a recorded session using Suno AI.

Pipeline:
    1. Take a MIDI file (from your gesture session)
    2. Render it to WAV using FluidSynth
    3. Upload WAV to a publicly accessible URL (or use a provided one)
    4. Send to Suno API → get back a full, polished song inspired by your input
    5. Download the result

Usage:
    # From a MIDI file (renders to WAV automatically)
    python3 generate_song.py session.mid --style "acoustic rock" --title "My Jam"

    # From a WAV file directly
    python3 generate_song.py session.wav --style "lo-fi hip hop" --title "Chill Vibes"

    # Instrumental only (no vocals)
    python3 generate_song.py session.mid --style "jazz guitar" --instrumental

Requires:
    SUNO_API_KEY in .env file
"""

import os
import sys
import json
import time
import argparse
import urllib.request
import urllib.parse

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

# Import render function
sys.path.insert(0, SCRIPT_DIR)
from render_midi_to_wav import render_midi_to_wav


# ═══════════════════════════════════════════════════════════════════════
#  SUNO API CLIENT
# ═══════════════════════════════════════════════════════════════════════

SUNO_API_BASE = "https://api.sunoapi.org"


def _suno_request(endpoint, payload, api_key):
    """Make authenticated POST request to Suno API."""
    url = f"{SUNO_API_BASE}{endpoint}"
    data = json.dumps(payload).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _suno_get(endpoint, api_key):
    """Make authenticated GET request to Suno API."""
    url = f"{SUNO_API_BASE}{endpoint}"

    req = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
        },
    )

    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def upload_and_extend(
    audio_url,
    style="acoustic",
    title="My Song",
    instrumental=True,
    prompt="",
    model="V4_5",
    api_key=None,
):
    """
    Send audio to Suno's upload-and-extend endpoint.

    Args:
        audio_url: Publicly accessible URL to the WAV/MP3 file.
        style: Music style description (e.g. "acoustic rock", "jazz guitar").
        title: Song title.
        instrumental: True for no vocals, False to add vocals.
        prompt: Lyrics or description (used when instrumental=False).
        model: Suno model version (V4, V4_5, V4_5PLUS, V4_5ALL, V5).
        api_key: Suno API key.

    Returns:
        str: Task ID for polling results.
    """
    if api_key is None:
        api_key = os.environ.get("SUNO_API_KEY")
    if not api_key:
        raise ValueError(
            "SUNO_API_KEY not set. Add it to your .env file:\n"
            "  SUNO_API_KEY=your_key_here\n"
            "Get one at: https://sunoapi.org/api-key"
        )

    payload = {
        "uploadUrl": audio_url,
        "defaultParamFlag": True,
        "instrumental": instrumental,
        "style": style,
        "title": title,
        "model": model,
        "callBackUrl": "",  # We'll poll instead of using callbacks
    }

    if not instrumental and prompt:
        payload["prompt"] = prompt

    print(f"[Suno] Submitting to Suno API...")
    print(f"  Style: {style}")
    print(f"  Title: {title}")
    print(f"  Instrumental: {instrumental}")
    print(f"  Model: {model}")

    response = _suno_request("/api/v1/generate/upload-extend", payload, api_key)

    if response.get("code") != 200:
        raise RuntimeError(f"Suno API error: {response.get('msg', response)}")

    task_id = response["data"]["taskId"]
    print(f"  Task ID: {task_id}")
    return task_id


def poll_for_result(task_id, api_key=None, max_wait=300, poll_interval=10):
    """
    Poll Suno API for generation results.

    Args:
        task_id: Task ID from upload_and_extend().
        api_key: Suno API key.
        max_wait: Maximum seconds to wait.
        poll_interval: Seconds between polls.

    Returns:
        list[dict]: Generated tracks with audio URLs.
    """
    if api_key is None:
        api_key = os.environ.get("SUNO_API_KEY")

    print(f"[Suno] Waiting for generation (up to {max_wait}s)...")

    start = time.time()
    while time.time() - start < max_wait:
        try:
            response = _suno_get(
                f"/api/v1/generate/record?taskId={task_id}",
                api_key,
            )

            if response.get("code") == 200:
                data = response.get("data", {})
                # Check if generation is complete
                if isinstance(data, list) and data:
                    tracks = []
                    for track in data:
                        if track.get("audio_url"):
                            tracks.append({
                                "id": track.get("id"),
                                "audio_url": track["audio_url"],
                                "title": track.get("title", ""),
                                "duration": track.get("duration", 0),
                                "style": track.get("tags", ""),
                            })
                    if tracks:
                        print(f"  Generation complete! {len(tracks)} track(s).")
                        return tracks

        except Exception as e:
            print(f"  Poll error: {e}")

        elapsed = int(time.time() - start)
        print(f"  Waiting... ({elapsed}s elapsed)")
        time.sleep(poll_interval)

    raise TimeoutError(f"Generation did not complete within {max_wait}s")


def download_track(track, output_dir=None):
    """Download a generated track."""
    if output_dir is None:
        output_dir = OUTPUT_DIR
    os.makedirs(output_dir, exist_ok=True)

    title = track.get("title", "generated").replace(" ", "_")
    track_id = track.get("id", "unknown")[:8]
    filename = f"{title}_{track_id}.mp3"
    output_path = os.path.join(output_dir, filename)

    print(f"[Suno] Downloading: {filename}")

    urllib.request.urlretrieve(track["audio_url"], output_path)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"  Saved: {output_path} ({size_mb:.1f} MB)")
    return output_path


# ═══════════════════════════════════════════════════════════════════════
#  FULL PIPELINE
# ═══════════════════════════════════════════════════════════════════════

def generate_song_from_file(
    input_path,
    audio_url=None,
    style="acoustic",
    title="My Song",
    instrumental=True,
    prompt="",
    model="V4_5",
):
    """
    Full pipeline: MIDI/WAV → render → upload → Suno → download result.

    Args:
        input_path: Path to .mid or .wav file.
        audio_url: If provided, skip rendering and use this URL directly.
                   Otherwise you must host the WAV yourself (see note below).
        style: Music style for Suno.
        title: Song title.
        instrumental: True for instrumental only.
        prompt: Lyrics/description if not instrumental.
        model: Suno model version.

    Returns:
        list[str]: Paths to downloaded generated tracks.
    """
    print()
    print("╔" + "═" * 55 + "╗")
    print("║  Song Generation Pipeline                        ║")
    print("╠" + "═" * 55 + "╣")
    print(f"║  Input: {os.path.basename(input_path)[:45]:<45} ║")
    print(f"║  Style: {style[:45]:<45} ║")
    print(f"║  Title: {title[:45]:<45} ║")
    print("╚" + "═" * 55 + "╝")

    # ── Step 1: Render MIDI to WAV if needed ────────────────────────
    if input_path.lower().endswith((".mid", ".midi")):
        print("\n[Step 1] Rendering MIDI → WAV...")
        wav_path = render_midi_to_wav(input_path)
    elif input_path.lower().endswith((".wav", ".mp3", ".flac")):
        wav_path = input_path
        print(f"\n[Step 1] Using existing audio: {os.path.basename(wav_path)}")
    else:
        raise ValueError(f"Unsupported file format: {input_path}")

    # ── Step 2: Get a public URL for the audio ──────────────────────
    if audio_url is None:
        print("\n[Step 2] Audio URL needed")
        print(f"  Your WAV is at: {os.path.abspath(wav_path)}")
        print()
        print("  Suno needs a publicly accessible URL to your audio.")
        print("  Options:")
        print("    1. Upload to https://tmpfiles.org (free, temporary)")
        print("    2. Upload to any file hosting service")
        print("    3. Use ngrok to expose a local server")
        print()
        audio_url = input("  Paste the public URL here: ").strip()

        if not audio_url:
            print("  No URL provided. Exiting.")
            return []

    # ── Step 3: Submit to Suno ──────────────────────────────────────
    print("\n[Step 3] Submitting to Suno...")
    task_id = upload_and_extend(
        audio_url=audio_url,
        style=style,
        title=title,
        instrumental=instrumental,
        prompt=prompt,
        model=model,
    )

    # ── Step 4: Poll for results ────────────────────────────────────
    print("\n[Step 4] Waiting for Suno to generate...")
    tracks = poll_for_result(task_id)

    # ── Step 5: Download generated tracks ───────────────────────────
    print("\n[Step 5] Downloading generated tracks...")
    downloaded = []
    for track in tracks:
        path = download_track(track)
        downloaded.append(path)

    print("\n" + "=" * 55)
    print("  Done! Generated tracks:")
    for p in downloaded:
        print(f"    {p}")
    print("=" * 55)

    return downloaded


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Generate a polished song from your recorded MIDI/WAV using Suno AI.",
        epilog='Example: python3 generate_song.py session.mid --style "acoustic rock" --title "My Jam"',
    )
    parser.add_argument(
        "input_file",
        help="Path to .mid or .wav file from your session",
    )
    parser.add_argument(
        "--style",
        default="acoustic",
        help='Music style (e.g. "acoustic rock", "jazz guitar", "lo-fi")',
    )
    parser.add_argument(
        "--title",
        default="My Song",
        help="Song title",
    )
    parser.add_argument(
        "--instrumental",
        action="store_true",
        default=True,
        help="Instrumental only, no vocals (default: True)",
    )
    parser.add_argument(
        "--vocals",
        action="store_true",
        help="Add AI vocals (overrides --instrumental)",
    )
    parser.add_argument(
        "--prompt",
        default="",
        help="Lyrics or description (for vocal tracks)",
    )
    parser.add_argument(
        "--audio-url",
        default=None,
        help="Public URL to audio file (skip local render/upload)",
    )
    parser.add_argument(
        "--model",
        default="V4_5",
        choices=["V4", "V4_5", "V4_5PLUS", "V4_5ALL", "V5"],
        help="Suno model version (default: V4_5)",
    )

    args = parser.parse_args()

    instrumental = not args.vocals

    generate_song_from_file(
        input_path=args.input_file,
        audio_url=args.audio_url,
        style=args.style,
        title=args.title,
        instrumental=instrumental,
        prompt=args.prompt,
        model=args.model,
    )


if __name__ == "__main__":
    main()
