import { NextRequest, NextResponse } from "next/server"

/**
 * Find a 3D model of an instrument on Sketchfab.
 * GET /api/sketchfab?q=guitar
 */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim()
  if (!q || q.length < 2) {
    return NextResponse.json({ uid: null })
  }

  try {
    const res = await fetch(
      `https://api.sketchfab.com/v3/search?type=models&q=${encodeURIComponent(
        q + " musical instrument"
      )}&sort_by=-likeCount&animated=false`,
      { headers: { Accept: "application/json" } }
    )

    if (!res.ok) return NextResponse.json({ uid: null })

    const data = (await res.json()) as {
      results?: Array<{ uid: string; name: string }>
    }
    const model = data.results?.[0]
    if (!model?.uid) return NextResponse.json({ uid: null })

    return NextResponse.json({ uid: model.uid, name: model.name })
  } catch {
    return NextResponse.json({ uid: null })
  }
}
