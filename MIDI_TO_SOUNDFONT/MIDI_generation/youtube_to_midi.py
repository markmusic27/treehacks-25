#!/usr/bin/env python3
"""
YouTube to MIDI — Search or paste a YouTube link, get a MIDI file.

Pipeline:
  1. Search YouTube (or use a direct URL)
  2. Download audio using yt-dlp
  3. Convert to MIDI using Basic Pitch

Usage:
    # With a YouTube URL
    python3 youtube_to_midi.py "https://www.youtube.com/watch?v=abc123"

    # Search by name (picks the top result)
    python3 youtube_to_midi.py "Sugar Maroon 5 fingerstyle guitar cover"

    # Specify output directory
    python3 youtube_to_midi.py "query or url" -o my_midi_output/

    # Adjust pitch detection sensitivity
    python3 youtube_to_midi.py "query or url" --onset-threshold 0.3

Requirements:
    pip install yt-dlp basic-pitch
    brew install ffmpeg   (needed by yt-dlp for audio extraction)
"""

import os
import sys
import re
import argparse
import subprocess
import tempfile
from pathlib import Path

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MIDI_OUTPUT_DIR = os.path.join(os.path.dirname(SCRIPT_DIR), "midi_output")

# Import audio_to_midi from generate_MIDI.py in the same folder
sys.path.insert(0, SCRIPT_DIR)
from generate_MIDI import audio_to_midi


# ── YouTube helpers ─────────────────────────────────────────────────────

def is_youtube_url(query):
    """Check if the input looks like a YouTube URL."""
    youtube_patterns = [
        r"(https?://)?(www\.)?youtube\.com/watch",
        r"(https?://)?(www\.)?youtu\.be/",
        r"(https?://)?(www\.)?youtube\.com/shorts/",
        r"(https?://)?music\.youtube\.com/watch",
    ]
    return any(re.match(pattern, query) for pattern in youtube_patterns)


def search_youtube(query):
    """
    Search YouTube for a query and return the URL of the top result.
    Uses yt-dlp's built-in search feature.
    """
    print(f"[YouTube] Searching: {query}")

    try:
        # yt-dlp can search YouTube with "ytsearch:" prefix
        # --get-url gets the video URL, --get-title gets the title
        result = subprocess.run(
            [
                "yt-dlp",
                f"ytsearch1:{query}",   # search, return top 1 result
                "--get-title",
                "--get-id",
                "--no-warnings",
                "--no-playlist",
            ],
            capture_output=True,
            text=True,
            timeout=30,
        )

        if result.returncode != 0:
            raise RuntimeError(f"yt-dlp search failed: {result.stderr.strip()}")

        lines = result.stdout.strip().split("\n")
        if len(lines) < 2:
            raise RuntimeError("No search results found.")

        title = lines[0]
        video_id = lines[1]
        url = f"https://www.youtube.com/watch?v={video_id}"

        print(f"[YouTube] Found: {title}")
        print(f"[YouTube] URL: {url}")
        return url, title

    except FileNotFoundError:
        print("\nError: yt-dlp not found. Install it with:")
        print("  pip install yt-dlp")
        sys.exit(1)


def download_audio(url, output_dir):
    """
    Download audio from a YouTube URL as a WAV file.

    Args:
        url (str): YouTube video URL.
        output_dir (str): Directory to save the audio file.

    Returns:
        str: Path to the downloaded WAV file.
    """
    os.makedirs(output_dir, exist_ok=True)

    # Output template — yt-dlp will fill in the title
    output_template = os.path.join(output_dir, "%(title)s.%(ext)s")

    print(f"[YouTube] Downloading audio...")

    try:
        # Download audio only, convert to WAV for best Basic Pitch compatibility
        result = subprocess.run(
            [
                "yt-dlp",
                "--extract-audio",              # audio only, no video
                "--audio-format", "wav",         # convert to WAV
                "--audio-quality", "0",          # best quality
                "--no-playlist",                 # single video only
                "--no-warnings",
                "--output", output_template,
                "--print", "after_move:filepath",  # print final file path
                url,
            ],
            capture_output=True,
            text=True,
            timeout=300,  # 5 min timeout for long videos
        )

        if result.returncode != 0:
            raise RuntimeError(f"Download failed: {result.stderr.strip()}")

        # The last non-empty line of stdout is the file path
        audio_path = result.stdout.strip().split("\n")[-1].strip()

        if not os.path.exists(audio_path):
            # Fallback: find the most recent .wav file in the output dir
            wav_files = sorted(
                Path(output_dir).glob("*.wav"),
                key=lambda f: f.stat().st_mtime,
                reverse=True,
            )
            if wav_files:
                audio_path = str(wav_files[0])
            else:
                raise RuntimeError("Download succeeded but WAV file not found.")

        size_mb = os.path.getsize(audio_path) / (1024 * 1024)
        print(f"[YouTube] Audio saved: {os.path.basename(audio_path)} ({size_mb:.1f} MB)")
        return audio_path

    except FileNotFoundError:
        print("\nError: yt-dlp not found. Install it with:")
        print("  pip install yt-dlp")
        sys.exit(1)


# ── Main ────────────────────────────────────────────────────────────────

def youtube_to_midi(
    query,
    output_dir=None,
    keep_audio=False,
    onset_threshold=0.5,
    frame_threshold=0.3,
):
    """
    Full pipeline: YouTube search/URL → download audio → convert to MIDI.

    Args:
        query (str): YouTube URL or search query.
        output_dir (str|None): Where to save the MIDI file. Defaults to midi_output/.
        keep_audio (bool): If True, keep the downloaded WAV. If False, delete it.
        onset_threshold (float): Basic Pitch onset sensitivity (0.0-1.0).
        frame_threshold (float): Basic Pitch frame sensitivity (0.0-1.0).

    Returns:
        str: Path to the generated MIDI file.
    """
    if output_dir is None:
        output_dir = MIDI_OUTPUT_DIR

    # ── Step 1: Get the YouTube URL ─────────────────────────────────
    if is_youtube_url(query):
        url = query
        title = None
        print(f"[YouTube] Using URL: {url}")
    else:
        url, title = search_youtube(query)

    # ── Step 2: Download audio ──────────────────────────────────────
    # Use a temp directory for audio, or output_dir if keeping it
    if keep_audio:
        audio_dir = output_dir
    else:
        audio_dir = tempfile.mkdtemp(prefix="yt_audio_")

    audio_path = download_audio(url, audio_dir)

    # ── Step 3: Convert to MIDI ─────────────────────────────────────
    try:
        print(f"\n[Basic Pitch] Converting audio to MIDI...")
        midi_path = audio_to_midi(
            audio_path=audio_path,
            output_dir=output_dir,
            onset_threshold=onset_threshold,
            frame_threshold=frame_threshold,
        )
    finally:
        # Clean up the audio file if not keeping it
        if not keep_audio and os.path.exists(audio_path):
            os.remove(audio_path)
            print(f"[Cleanup] Removed temporary audio file.")

    return midi_path


def main():
    parser = argparse.ArgumentParser(
        description="Download a YouTube video and convert it to MIDI.",
        epilog='Example: python3 youtube_to_midi.py "Sugar Maroon 5 guitar cover"',
    )
    parser.add_argument(
        "query",
        help="YouTube URL or search query (e.g. 'Sugar Maroon 5 fingerstyle')",
    )
    parser.add_argument(
        "-o", "--output-dir",
        default=None,
        help=f"Directory to save MIDI file (default: {MIDI_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--keep-audio",
        action="store_true",
        help="Keep the downloaded WAV file (default: delete after conversion)",
    )
    parser.add_argument(
        "--onset-threshold",
        type=float,
        default=0.5,
        help="Note onset sensitivity, 0.0-1.0. Lower = more notes. (default: 0.5)",
    )
    parser.add_argument(
        "--note-threshold",
        type=float,
        default=0.3,
        help="Note frame sensitivity, 0.0-1.0. Lower = more notes. (default: 0.3)",
    )

    args = parser.parse_args()

    print()
    print("=" * 55)
    print("  YouTube → MIDI")
    print("=" * 55)

    midi_path = youtube_to_midi(
        query=args.query,
        output_dir=args.output_dir,
        keep_audio=args.keep_audio,
        onset_threshold=args.onset_threshold,
        frame_threshold=args.note_threshold,
    )

    print()
    print("=" * 55)
    print(f"  MIDI file ready: {midi_path}")
    print("=" * 55)
    print()
    print("  To play it:")
    print(f'  python3 ../FluidSynth_Player/play_midi.py "{midi_path}"')
    print()


if __name__ == "__main__":
    main()
