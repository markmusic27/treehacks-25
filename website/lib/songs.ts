import type { Song } from "./types"
import { songs as staticSongs } from "./mock-data"

const CUSTOM_PREFIX = "maestro-custom-song-"

/** Get a song by id: from static list first, then sessionStorage (MusicBrainz / custom). */
export function getSong(songId: string | null): Song | undefined {
  if (!songId) return undefined
  const fromStatic = staticSongs.find((s) => s.id === songId)
  if (fromStatic) return fromStatic
  if (typeof window === "undefined") return undefined
  try {
    const raw = sessionStorage.getItem(CUSTOM_PREFIX + songId)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Song
    return parsed && typeof parsed.id === "string" && typeof parsed.title === "string" ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Store a custom song (e.g. from MusicBrainz search) so play/results can resolve it by id. */
export function setCustomSong(song: Song): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(CUSTOM_PREFIX + song.id, JSON.stringify(song))
  } catch {
    // ignore
  }
}

/** Build a Song from MusicBrainz search result for use in Pick & Play. */
export function songFromSearchResult(
  id: string,
  title: string,
  artist: string,
  durationSeconds: number
): Song {
  return {
    id,
    title,
    artist,
    genre: "Various",
    difficulty: "intermediate",
    duration: durationSeconds,
    bpm: 120,
    key: "C Major",
    instrumentIds: [], // show in "All songs" when no instrument filter
  }
}
