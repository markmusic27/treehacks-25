#!/usr/bin/env python3
"""
Instrument Manager — Inspect, search, and download soundfont instruments.

Features:
  1. List all instruments in your current soundfont(s)
  2. Check if a specific instrument exists
  3. Search the internet for soundfonts by instrument name
  4. Download new soundfonts to your collection

Usage:
    # List all instruments in your soundfonts
    python3 manage_instruments.py list

    # Search for a specific instrument in your soundfonts
    python3 manage_instruments.py check "electric guitar"

    # Search the internet for a soundfont
    python3 manage_instruments.py search "saxophone"

    # Download a soundfont from a URL
    python3 manage_instruments.py download <url>
"""

import os
import sys
import struct
import argparse
import urllib.request
import urllib.parse
import json
import re
from pathlib import Path

# ── Path setup ──────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)                          # MIDI_TO_SOUNDFONT/
REPO_DIR = os.path.dirname(PROJECT_DIR)                            # treehacks/
SOUNDFONT_DIR = os.path.join(REPO_DIR, "soundfonts")


# ═══════════════════════════════════════════════════════════════════════
#  SF2 PARSER — Read preset names directly from .sf2 files
# ═══════════════════════════════════════════════════════════════════════

def parse_sf2_presets(sf2_path):
    """
    Parse an SF2 file and return a list of preset names with their
    bank and program numbers.

    This reads the PHDR (Preset Header) chunk from the SF2 file
    without loading the entire file into memory.

    Returns:
        list of dict: [{"name": "Acoustic Grand Piano", "bank": 0, "program": 0}, ...]
    """
    presets = []

    with open(sf2_path, "rb") as f:
        # ── Read RIFF header ────────────────────────────────────────
        riff = f.read(4)
        if riff != b"RIFF":
            raise ValueError(f"Not a RIFF file: {sf2_path}")

        f.read(4)  # file size
        sfbk = f.read(4)
        if sfbk != b"sfbk":
            raise ValueError(f"Not a SoundFont file: {sf2_path}")

        # ── Walk through chunks to find pdta (preset data) ──────────
        while True:
            chunk_type = f.read(4)
            if len(chunk_type) < 4:
                break

            chunk_size_data = f.read(4)
            if len(chunk_size_data) < 4:
                break
            chunk_size = struct.unpack("<I", chunk_size_data)[0]

            if chunk_type == b"LIST":
                list_type = f.read(4)
                if list_type == b"pdta":
                    # We're in the preset data chunk — find PHDR
                    pdta_end = f.tell() + chunk_size - 4
                    while f.tell() < pdta_end:
                        sub_type = f.read(4)
                        sub_size_data = f.read(4)
                        if len(sub_size_data) < 4:
                            break
                        sub_size = struct.unpack("<I", sub_size_data)[0]

                        if sub_type == b"phdr":
                            # Each PHDR record is 38 bytes:
                            #   20 bytes name (null-terminated ASCII)
                            #   2 bytes preset (program number)
                            #   2 bytes bank
                            #   ... rest we don't need
                            num_presets = sub_size // 38
                            for _ in range(num_presets):
                                record = f.read(38)
                                if len(record) < 38:
                                    break
                                name = record[:20].split(b"\x00")[0].decode("ascii", errors="replace").strip()
                                program = struct.unpack("<H", record[20:22])[0]
                                bank = struct.unpack("<H", record[22:24])[0]

                                # Skip the terminal "EOP" record
                                if name and name != "EOP":
                                    presets.append({
                                        "name": name,
                                        "bank": bank,
                                        "program": program,
                                    })
                            break  # Found PHDR, done with pdta
                        else:
                            f.seek(sub_size, 1)  # Skip this sub-chunk
                    break  # Done with pdta LIST
                else:
                    # Skip other LIST chunks (but account for the 4 bytes we read)
                    f.seek(chunk_size - 4, 1)
            else:
                f.seek(chunk_size, 1)

    return presets


def list_instruments(sf2_path):
    """Print all presets in an SF2 file, grouped by bank."""
    presets = parse_sf2_presets(sf2_path)

    if not presets:
        print(f"  No presets found in {os.path.basename(sf2_path)}")
        return presets

    # Group by bank
    banks = {}
    for p in presets:
        banks.setdefault(p["bank"], []).append(p)

    sf_name = os.path.basename(sf2_path)
    print(f"\n  {sf_name} — {len(presets)} instruments")
    print(f"  {'─' * 50}")

    for bank_num in sorted(banks.keys()):
        bank_presets = sorted(banks[bank_num], key=lambda p: p["program"])
        bank_label = "Standard" if bank_num == 0 else f"Bank {bank_num}"
        if bank_num == 128:
            bank_label = "Percussion"
        print(f"\n  [{bank_label}]")
        for p in bank_presets:
            print(f"    {p['program']:3d}. {p['name']}")

    return presets


def check_instrument(sf2_path, query):
    """
    Search for an instrument in an SF2 file by name (fuzzy match).

    Returns:
        list of dict: Matching presets.
    """
    presets = parse_sf2_presets(sf2_path)
    query_lower = query.lower().strip()
    query_words = [w for w in re.split(r"[^a-z0-9#]+", query_lower) if w]

    matches = []
    for p in presets:
        name_lower = p["name"].lower().strip()
        name_words = set(w for w in re.split(r"[^a-z0-9#]+", name_lower) if w)

        # Match only on whole words to avoid false positives like:
        # query "oud" matching preset "Loud Glock".
        if all(word in name_words for word in query_words):
            matches.append(p)

    return matches


# ═══════════════════════════════════════════════════════════════════════
#  SOUNDFONT SEARCH — Search the web for soundfonts
# ═══════════════════════════════════════════════════════════════════════

def search_soundfonts_online(query):
    """
    Search for free soundfonts online using web scraping of
    musical-artifacts.com.

    Returns:
        list of dict: [{"name": ..., "url": ..., "description": ..., "size": ...}, ...]
    """
    print(f"\n  Searching for: {query}")
    print(f"  {'─' * 50}")

    results = []

    # ── Search musical-artifacts.com ────────────────────────────────
    try:
        search_url = (
            f"https://musical-artifacts.com/artifacts?"
            f"q={urllib.parse.quote(query)}&formats=sf2"
        )
        req = urllib.request.Request(search_url, headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode("utf-8", errors="replace")

        # Parse artifact links from the HTML
        # Look for patterns like: /artifacts/1234 and nearby text
        artifact_pattern = re.findall(
            r'<a[^>]*href="(/artifacts/(\d+))"[^>]*>(.*?)</a>',
            html, re.DOTALL
        )

        seen_ids = set()
        for href, artifact_id, link_text in artifact_pattern:
            if artifact_id in seen_ids:
                continue
            seen_ids.add(artifact_id)

            name = re.sub(r"<[^>]+>", "", link_text).strip()
            if not name or len(name) < 3:
                continue

            results.append({
                "name": name,
                "page_url": f"https://musical-artifacts.com{href}",
                "artifact_id": artifact_id,
            })

            if len(results) >= 10:
                break

    except Exception as e:
        print(f"  Search failed: {e}")

    # ── Also suggest some well-known sources ────────────────────────
    if not results:
        print(f"\n  No results found on musical-artifacts.com.")
        print(f"\n  Try searching manually:")
        print(f"    - https://musical-artifacts.com/artifacts?q={urllib.parse.quote(query)}&formats=sf2")
        print(f"    - https://www.sf2midi.com/")
        print(f"    - https://sites.google.com/site/soundaboratory/home")
    else:
        print(f"\n  Found {len(results)} results:\n")
        for i, r in enumerate(results, 1):
            print(f"    {i:2d}. {r['name']}")
            print(f"        {r['page_url']}")

    return results


def download_soundfont(url, output_dir=None):
    """
    Download a soundfont file from a URL.

    Args:
        url: Direct URL to an .sf2 file, or a musical-artifacts.com page URL.
        output_dir: Directory to save to. Defaults to SOUNDFONT_DIR.

    Returns:
        str: Path to the downloaded file.
    """
    if output_dir is None:
        output_dir = SOUNDFONT_DIR

    os.makedirs(output_dir, exist_ok=True)

    # If it's a musical-artifacts page URL, try to find the download link
    if "musical-artifacts.com/artifacts/" in url and not url.endswith(".sf2"):
        url = _resolve_musical_artifacts_download(url)

    print(f"\n  Downloading: {url}")

    # Download the file
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    })

    filename = os.path.basename(urllib.parse.urlparse(url).path)
    if not filename.endswith(".sf2"):
        filename = filename + ".sf2"

    output_path = os.path.join(output_dir, filename)

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            total = resp.headers.get("Content-Length")
            total = int(total) if total else None

            with open(output_path, "wb") as f:
                downloaded = 0
                while True:
                    chunk = resp.read(8192)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)

                    if total:
                        pct = (downloaded / total) * 100
                        mb = downloaded / (1024 * 1024)
                        print(f"\r  {mb:.1f} MB ({pct:.0f}%)", end="", flush=True)

        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        print(f"\n  Saved: {output_path} ({size_mb:.1f} MB)")

        # Verify it's a valid SF2
        with open(output_path, "rb") as f:
            header = f.read(4)
        if header != b"RIFF":
            os.remove(output_path)
            raise ValueError("Downloaded file is not a valid SoundFont (not RIFF format).")

        return output_path

    except Exception as e:
        if os.path.exists(output_path):
            os.remove(output_path)
        raise RuntimeError(f"Download failed: {e}")


def _resolve_musical_artifacts_download(page_url):
    """Try to find the direct download link from a musical-artifacts page."""
    req = urllib.request.Request(page_url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"
    })
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode("utf-8", errors="replace")

    # Look for download links ending in .sf2
    sf2_links = re.findall(r'href="([^"]*\.sf2[^"]*)"', html, re.IGNORECASE)
    if sf2_links:
        link = sf2_links[0]
        if link.startswith("/"):
            link = "https://musical-artifacts.com" + link
        return link

    # Look for general download links
    download_links = re.findall(r'href="([^"]*download[^"]*)"', html, re.IGNORECASE)
    if download_links:
        link = download_links[0]
        if link.startswith("/"):
            link = "https://musical-artifacts.com" + link
        return link

    raise RuntimeError(f"Could not find download link on page: {page_url}")


# ═══════════════════════════════════════════════════════════════════════
#  MAIN CLI
# ═══════════════════════════════════════════════════════════════════════

def get_all_sf2_files():
    """Find all .sf2 files in the soundfonts directory."""
    if not os.path.exists(SOUNDFONT_DIR):
        os.makedirs(SOUNDFONT_DIR)
        return []
    return sorted([
        os.path.join(SOUNDFONT_DIR, f)
        for f in os.listdir(SOUNDFONT_DIR)
        if f.lower().endswith(".sf2")
    ])


def cmd_list(args):
    """List all instruments in all soundfonts."""
    sf2_files = get_all_sf2_files()
    if not sf2_files:
        print("\n  No soundfont files found!")
        print(f"  Put .sf2 files in: {SOUNDFONT_DIR}")
        return

    print("\n" + "=" * 55)
    print("  Instruments in your soundfonts")
    print("=" * 55)

    for sf2_path in sf2_files:
        list_instruments(sf2_path)


def cmd_check(args):
    """Check if an instrument exists in your soundfonts."""
    query = args.instrument
    sf2_files = get_all_sf2_files()

    if not sf2_files:
        print(f"\n  No soundfont files found in: {SOUNDFONT_DIR}")
        return

    print(f"\n  Searching for '{query}' in your soundfonts...")

    all_matches = []
    for sf2_path in sf2_files:
        matches = check_instrument(sf2_path, query)
        for m in matches:
            m["soundfont"] = os.path.basename(sf2_path)
        all_matches.extend(matches)

    if all_matches:
        print(f"\n  Found {len(all_matches)} match(es):\n")
        for m in all_matches:
            print(f"    Bank {m['bank']:3d} | Program {m['program']:3d} | {m['name']}")
            print(f"    {'':>8}  in {m['soundfont']}")
    else:
        print(f"\n  '{query}' not found in your soundfonts.")
        print(f"\n  Want to search online? Run:")
        print(f'    python3 manage_instruments.py search "{query}"')


def cmd_search(args):
    """Search the internet for soundfonts."""
    print("\n" + "=" * 55)
    print("  Soundfont Search")
    print("=" * 55)

    results = search_soundfonts_online(args.query)

    if results:
        print(f"\n  To download one, copy the page URL and run:")
        print(f"    python3 manage_instruments.py download <url>")


def cmd_download(args):
    """Download a soundfont from a URL."""
    print("\n" + "=" * 55)
    print("  Soundfont Download")
    print("=" * 55)

    try:
        sf2_path = download_soundfont(args.url)

        # Show what instruments are in the downloaded file
        print(f"\n  Instruments in downloaded file:")
        list_instruments(sf2_path)

    except Exception as e:
        print(f"\n  Error: {e}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="Manage soundfont instruments — list, check, search, download.",
    )
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # ── list ────────────────────────────────────────────────────────
    sub_list = subparsers.add_parser("list", help="List all instruments in your soundfonts")
    sub_list.set_defaults(func=cmd_list)

    # ── check ───────────────────────────────────────────────────────
    sub_check = subparsers.add_parser("check", help="Check if an instrument exists")
    sub_check.add_argument("instrument", help="Instrument name to search for (e.g. 'electric guitar')")
    sub_check.set_defaults(func=cmd_check)

    # ── search ──────────────────────────────────────────────────────
    sub_search = subparsers.add_parser("search", help="Search the internet for soundfonts")
    sub_search.add_argument("query", help="Search query (e.g. 'saxophone', 'vintage piano')")
    sub_search.set_defaults(func=cmd_search)

    # ── download ────────────────────────────────────────────────────
    sub_download = subparsers.add_parser("download", help="Download a soundfont from a URL")
    sub_download.add_argument("url", help="URL to an .sf2 file or musical-artifacts.com page")
    sub_download.set_defaults(func=cmd_download)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(1)

    args.func(args)


if __name__ == "__main__":
    main()
