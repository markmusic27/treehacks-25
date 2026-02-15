import { NextResponse } from "next/server"

const SUNO_BASE = "https://studio-api.prod.suno.com/api/v2/external/hackathons"

export async function GET(request: Request) {
  const token = process.env.SUNO_TREEHACKS_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: "SUNO_TREEHACKS_TOKEN not configured" },
      { status: 500 }
    )
  }

  try {
    const { searchParams } = new URL(request.url)
    const ids = searchParams.get("ids")

    if (!ids) {
      return NextResponse.json(
        { error: "ids query parameter is required" },
        { status: 400 }
      )
    }

    const resp = await fetch(`${SUNO_BASE}/clips?ids=${encodeURIComponent(ids)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error(`[Suno] Clips error ${resp.status}: ${errText}`)
      return NextResponse.json(
        { error: `Suno error: ${resp.status}` },
        { status: 502 }
      )
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error("[Suno] Clips fetch failed:", err)
    return NextResponse.json(
      { error: "Failed to fetch clip status" },
      { status: 500 }
    )
  }
}
