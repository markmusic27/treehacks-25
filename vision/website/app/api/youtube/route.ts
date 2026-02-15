import { NextRequest, NextResponse } from "next/server"

/**
 * Search YouTube for real video IDs using the Piped API (free, no key needed).
 *
 * GET /api/youtube?q=oud+instrument+performance
 *
 * Returns an array of { videoId, title, thumbnail } for real, embeddable videos.
 */

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
]

interface PipedItem {
  url?: string
  title?: string
  thumbnail?: string
  duration?: number
  type?: string
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ results: [] })
  }

  const limit = Math.min(
    5,
    Number(request.nextUrl.searchParams.get("limit")) || 3
  )

  // Try multiple Piped instances in case one is down
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await fetch(
        `${instance}/search?q=${encodeURIComponent(q)}&filter=videos`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(5000),
        }
      )

      if (!res.ok) continue

      const data = (await res.json()) as { items?: PipedItem[] }
      const items = data.items ?? []

      const results = items
        .filter(
          (item) =>
            item.type === "stream" &&
            item.url &&
            item.duration &&
            item.duration > 20 &&
            item.duration < 600
        )
        .slice(0, limit)
        .map((item) => {
          // Piped URLs look like /watch?v=VIDEO_ID
          const videoId = item.url?.replace("/watch?v=", "") ?? ""
          return {
            videoId,
            title: item.title ?? "",
            thumbnail: item.thumbnail ?? "",
          }
        })
        .filter((r) => r.videoId.length > 0)

      return NextResponse.json({ results })
    } catch {
      continue // try next instance
    }
  }

  // All instances failed
  return NextResponse.json({ results: [] })
}
