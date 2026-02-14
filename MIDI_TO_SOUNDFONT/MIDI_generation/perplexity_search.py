#!/usr/bin/env python3
"""
Perplexity-powered YouTube cover search.

Uses Perplexity AI to intelligently find the best YouTube covers
for each instrument in a song. Falls back to keyword-based YouTube
search if no API key is available.

Usage (as a module):
    from perplexity_search import search_covers_for_instruments

    results = search_covers_for_instruments(
        song="Cake By The Ocean",
        instruments=["guitar", "bass", "drums"],
    )
    # results = {"guitar": {"url": "...", "title": "..."}, ...}

Requires:
    PERPLEXITY_API_KEY environment variable (or in .env file)
"""

import os
import sys
import re
import json
import subprocess
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
REPO_DIR = os.path.dirname(PROJECT_DIR)

# Try to load .env file
_env_path = os.path.join(REPO_DIR, ".env")
if os.path.exists(_env_path):
    with open(_env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())


# ═══════════════════════════════════════════════════════════════════════
#  PERPLEXITY AI SEARCH
# ═══════════════════════════════════════════════════════════════════════

def _get_perplexity_client():
    """Get a Perplexity API client. Returns None if no API key."""
    api_key = os.environ.get("PERPLEXITY_API_KEY")
    if not api_key:
        return None

    # Use requests directly to avoid extra dependencies
    return api_key


def _perplexity_search(api_key, song, instrument):
    """
    Ask Perplexity to find the best YouTube cover for a specific instrument.

    Returns:
        dict: {"url": "...", "title": "...", "reason": "..."}
    """
    import urllib.request

    prompt = f"""Find me the best YouTube video of a {instrument} cover of "{song}".

Requirements:
- Strongly prefer a SOLO {instrument} cover (just the {instrument}, no other instruments)
- If no solo version exists, a cover with {instrument} + vocals is acceptable
- Prefer acoustic/unplugged versions for cleaner audio
- Prefer shorter videos (under 5 minutes)
- The {instrument} should be clearly audible and dominant

Return ONLY a JSON object with these fields:
- "url": the full YouTube URL
- "title": the video title
- "solo": true if the video is ONLY the {instrument} with no other instruments, false if other instruments (like vocals, drums, etc.) are also present
- "instruments_present": list of instruments heard in the video (e.g. ["guitar", "vocals"])
- "reason": one sentence why this is a good choice

Return ONLY the JSON, no other text."""

    payload = json.dumps({
        "model": "sonar",
        "messages": [
            {
                "role": "system",
                "content": "You are a music search assistant. Return only valid JSON."
            },
            {
                "role": "user",
                "content": prompt
            }
        ],
        "temperature": 0.1,
        "max_tokens": 300,
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.perplexity.ai/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))

        content = data["choices"][0]["message"]["content"]

        # Extract JSON from the response (handle markdown code blocks)
        json_match = re.search(r"\{[^{}]*\}", content, re.DOTALL)
        if json_match:
            result = json.loads(json_match.group())
            if "url" in result:
                is_solo = result.get("solo", True)
                instruments_present = result.get("instruments_present", [instrument])
                return {
                    "url": result["url"],
                    "title": result.get("title", "Unknown"),
                    "reason": result.get("reason", ""),
                    "solo": is_solo,
                    "instruments_present": instruments_present,
                    "needs_separation": not is_solo,
                    "source": "perplexity",
                }

        raise ValueError(f"Could not parse Perplexity response: {content[:200]}")

    except Exception as e:
        print(f"  [Perplexity] Error searching for {instrument}: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════
#  FALLBACK: KEYWORD-BASED YOUTUBE SEARCH
# ═══════════════════════════════════════════════════════════════════════

# Search query templates per instrument type
SEARCH_TEMPLATES = {
    "guitar": [
        "{song} acoustic guitar cover",
        "{song} fingerstyle guitar cover",
        "{song} solo guitar cover",
    ],
    "bass": [
        "{song} bass cover",
        "{song} bass only cover",
        "{song} isolated bass",
    ],
    "drums": [
        "{song} drum cover",
        "{song} drums only",
        "{song} solo drum cover",
    ],
    "piano": [
        "{song} piano cover",
        "{song} solo piano cover",
        "{song} piano tutorial",
    ],
    "vocals": [
        "{song} acapella",
        "{song} vocals only",
        "{song} isolated vocals",
    ],
    "default": [
        "{song} {instrument} cover",
        "{song} {instrument} solo",
        "{song} acoustic {instrument} cover",
    ],
}


def _youtube_search_single(query):
    """Run a single yt-dlp search and return the result."""
    try:
        result = subprocess.run(
            [
                "yt-dlp",
                f"ytsearch1:{query}",
                "--get-title",
                "--get-id",
                "--get-duration",
                "--no-warnings",
                "--no-playlist",
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )

        if result.returncode != 0:
            return None

        lines = result.stdout.strip().split("\n")
        if len(lines) < 3:
            return None

        title = lines[0]
        video_id = lines[1]
        duration = lines[2]  # format like "3:45"

        # Parse duration to seconds
        parts = duration.split(":")
        try:
            if len(parts) == 2:
                dur_sec = int(parts[0]) * 60 + int(parts[1])
            elif len(parts) == 3:
                dur_sec = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            else:
                dur_sec = 9999
        except ValueError:
            dur_sec = 9999

        return {
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "title": title,
            "duration": dur_sec,
            "query": query,
            "solo": False,              # Can't determine from keyword search
            "needs_separation": True,   # Be safe: assume it needs cleaning
            "instruments_present": [],
            "source": "youtube",
        }
    except Exception:
        return None


def _youtube_search_parallel(song, instrument):
    """
    Search YouTube with multiple query variations in parallel.
    Returns the best result (shortest duration, as solo covers tend to be shorter).
    """
    # Get search templates for this instrument type
    instrument_lower = instrument.lower()
    templates = SEARCH_TEMPLATES.get("default", [])

    for key, tmpls in SEARCH_TEMPLATES.items():
        if key in instrument_lower:
            templates = tmpls
            break

    queries = [t.format(song=song, instrument=instrument) for t in templates]

    # Search all queries in parallel
    results = []
    with ThreadPoolExecutor(max_workers=len(queries)) as pool:
        futures = {pool.submit(_youtube_search_single, q): q for q in queries}
        for future in as_completed(futures):
            result = future.result()
            if result:
                results.append(result)

    if not results:
        return None

    # Pick the best: prefer shorter videos (solo covers are usually shorter)
    # Filter out very short (<30s, likely clips) and very long (>10min)
    good_results = [r for r in results if 30 < r["duration"] < 600]
    if good_results:
        best = min(good_results, key=lambda r: r["duration"])
    else:
        best = results[0]

    return best


# ═══════════════════════════════════════════════════════════════════════
#  MAIN: PARALLEL SEARCH FOR ALL INSTRUMENTS
# ═══════════════════════════════════════════════════════════════════════

def search_covers_for_instruments(song, instruments):
    """
    Find the best YouTube cover for each instrument, in parallel.

    Uses Perplexity AI if API key is available, falls back to
    parallel YouTube keyword search.

    Args:
        song (str): Song name (e.g. "Cake By The Ocean").
        instruments (list[str]): Instruments to find covers for.
            e.g. ["guitar", "bass", "drums"]

    Returns:
        dict: {instrument: {"url": ..., "title": ..., "source": ...}}
    """
    api_key = _get_perplexity_client()
    use_perplexity = api_key is not None

    print(f"\n  Searching for covers of '{song}'")
    print(f"  Instruments: {', '.join(instruments)}")
    print(f"  Search engine: {'Perplexity AI' if use_perplexity else 'YouTube (parallel)'}")
    print()

    results = {}

    with ThreadPoolExecutor(max_workers=len(instruments)) as pool:
        if use_perplexity:
            futures = {
                pool.submit(_perplexity_search, api_key, song, inst): inst
                for inst in instruments
            }
        else:
            futures = {
                pool.submit(_youtube_search_parallel, song, inst): inst
                for inst in instruments
            }

        for future in as_completed(futures):
            instrument = futures[future]
            result = future.result()

            if result:
                results[instrument] = result
                print(f"  {instrument:10s} → {result['title'][:50]}")
                if result.get("reason"):
                    print(f"  {'':10s}   {result['reason'][:60]}")
            else:
                print(f"  {instrument:10s} → NOT FOUND")

    return results


# ═══════════════════════════════════════════════════════════════════════
#  CLI
# ═══════════════════════════════════════════════════════════════════════

def main():
    import argparse

    parser = argparse.ArgumentParser(
        description="Search for YouTube covers of a song per instrument.",
    )
    parser.add_argument("song", help="Song name")
    parser.add_argument(
        "--instruments", "-i",
        nargs="+",
        default=["guitar", "bass", "drums"],
        help="Instruments to search for (default: guitar bass drums)",
    )

    args = parser.parse_args()

    print("\n" + "=" * 55)
    print("  Cover Search")
    print("=" * 55)

    results = search_covers_for_instruments(args.song, args.instruments)

    print(f"\n  {'─' * 50}")
    for inst, res in results.items():
        print(f"\n  {inst}:")
        print(f"    Title: {res['title']}")
        print(f"    URL:   {res['url']}")
        print(f"    Via:   {res['source']}")


if __name__ == "__main__":
    main()
