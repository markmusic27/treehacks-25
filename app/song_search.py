"""
Song Search — Find a song cover on YouTube via Perplexity or keyword search.

Wraps the existing ``MIDI_TO_SOUNDFONT/MIDI_generation/perplexity_search.py``
and ``youtube_to_midi.py`` modules so the app layer has a clean interface.

Usage:
    from app.song_search import search_song

    result = search_song("Seven Nation Army", instrument="guitar")
    # result = {"url": "...", "title": "...", "source": "perplexity"}
"""

from __future__ import annotations

import os
import sys

# ── Path setup — make sure we can import from the MIDI_TO_SOUNDFONT tree ──
REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_MIDI_GEN_DIR = os.path.join(REPO_DIR, "MIDI_TO_SOUNDFONT", "MIDI_generation")

if _MIDI_GEN_DIR not in sys.path:
    sys.path.insert(0, _MIDI_GEN_DIR)

from perplexity_search import (
    search_covers_for_instruments,
    _get_perplexity_client,
    _youtube_search_parallel,
    _perplexity_search,
)
from youtube_to_midi import search_youtube, is_youtube_url


# ═══════════════════════════════════════════════════════════════════════
#  PUBLIC API
# ═══════════════════════════════════════════════════════════════════════

def search_song(
    song_name: str,
    instrument: str = "guitar",
) -> dict | None:
    """
    Search for a YouTube cover of *song_name* played on *instrument*.

    Uses Perplexity AI if an API key is available, otherwise falls back
    to parallel YouTube keyword search.

    Args:
        song_name:  The name of the song (e.g. "Seven Nation Army").
        instrument: The instrument to search a cover for (e.g. "guitar").

    Returns:
        dict with keys: url, title, source, solo, needs_separation
        None if nothing was found.
    """
    print()
    print("=" * 55)
    print("  Song Search")
    print("=" * 55)
    print(f"  Song:       {song_name}")
    print(f"  Instrument: {instrument}")

    # Try Perplexity first
    api_key = _get_perplexity_client()
    if api_key:
        print(f"  Engine:     Perplexity AI")
        result = _perplexity_search(api_key, song_name, instrument)
        if result:
            print(f"  Found:      {result['title'][:50]}")
            print(f"  URL:        {result['url']}")
            return result
        print(f"  Perplexity returned nothing, falling back to YouTube search...")

    # Fallback: YouTube keyword search
    print(f"  Engine:     YouTube (parallel keyword search)")
    result = _youtube_search_parallel(song_name, instrument)
    if result:
        print(f"  Found:      {result['title'][:50]}")
        print(f"  URL:        {result['url']}")
        return result

    # Last resort: simple yt-dlp search
    print(f"  Trying simple search...")
    query = f"{song_name} {instrument} cover"
    try:
        url, title = search_youtube(query)
        return {
            "url": url,
            "title": title,
            "source": "youtube_simple",
            "solo": False,
            "needs_separation": True,
            "instruments_present": [],
        }
    except Exception as e:
        print(f"  Search failed: {e}")
        return None


def search_song_direct_url(url: str) -> dict:
    """
    Accept a direct YouTube URL (no search needed).

    Returns:
        dict with keys: url, title, source
    """
    if not is_youtube_url(url):
        raise ValueError(f"Not a valid YouTube URL: {url}")

    return {
        "url": url,
        "title": "",  # Will be filled during download
        "source": "direct_url",
        "solo": False,
        "needs_separation": True,
        "instruments_present": [],
    }
