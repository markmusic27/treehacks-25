import { NextResponse } from "next/server"

const SUNO_BASE = "https://studio-api.prod.suno.com/api/v2/external/hackathons"

export async function POST(request: Request) {
  const token = process.env.SUNO_TREEHACKS_TOKEN
  if (!token) {
    return NextResponse.json(
      { error: "SUNO_TREEHACKS_TOKEN not configured" },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { topic, tags, make_instrumental } = body

    if (!topic) {
      return NextResponse.json(
        { error: "topic is required" },
        { status: 400 }
      )
    }

    const resp = await fetch(`${SUNO_BASE}/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topic: topic.slice(0, 500),
        tags: (tags || "").slice(0, 100),
        make_instrumental: make_instrumental ?? true,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error(`[Suno] Generate error ${resp.status}: ${errText}`)
      return NextResponse.json(
        { error: `Suno error: ${resp.status} - ${errText}` },
        { status: 502 }
      )
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error("[Suno] Generate failed:", err)
    return NextResponse.json(
      { error: "Song generation request failed" },
      { status: 500 }
    )
  }
}
