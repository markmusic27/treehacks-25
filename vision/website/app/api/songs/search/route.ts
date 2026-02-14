import { NextRequest, NextResponse } from "next/server"

/**
 * Search MusicBrainz for recordings (songs). Free API, no key required.
 * https://musicbrainz.org/doc/MusicBrainz_API
 * Use a descriptive User-Agent (required by MusicBrainz).
 */
const USER_AGENT = "MaestroMusicApp/1.0 (https://github.com/maestro-app; learning app)"

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    )
  }

  const limit = Math.min(100, Math.max(5, Number(request.nextUrl.searchParams.get("limit")) || 25))
  const url = new URL("https://musicbrainz.org/ws/2/recording")
  url.searchParams.set("query", q)
  url.searchParams.set("fmt", "json")
  url.searchParams.set("limit", String(limit))

  try {
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
      next: { revalidate: 300 },
    })
    if (!res.ok) {
      return NextResponse.json(
        { error: "MusicBrainz search failed" },
        { status: 502 }
      )
    }
    const data = (await res.json()) as {
      recordings?: Array<{
        id: string
        title: string
        length?: number | null
        "artist-credit"?: Array<{ name: string }>
      }>
    }
    const recordings = data.recordings ?? []
    const results = recordings.map((r) => ({
      id: r.id,
      title: r.title,
      artist: (r["artist-credit"] ?? []).map((a) => a.name).join(", ") || "Unknown Artist",
      duration: r.length != null ? Math.round(r.length / 1000) : 120,
    }))
    return NextResponse.json({ results })
  } catch (e) {
    console.error("MusicBrainz search error:", e)
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 }
    )
  }
}
