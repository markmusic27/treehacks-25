import { NextResponse } from "next/server"

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"

export interface ClaudeArtistResponse {
  name: string
  bio: string
  genre: string
  famousSongs: string[]
  influence: string
}

function extractJson(text: string): ClaudeArtistResponse | null {
  const trimmed = text.trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}") + 1
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end)) as ClaudeArtistResponse
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()
    const artist = typeof body.artist === "string" ? body.artist.trim() : null
    if (!artist) {
      return NextResponse.json(
        { error: "artist is required" },
        { status: 400 }
      )
    }

    const prompt = `You are a music tutor. For the artist "${artist}", provide a short, informative overview in exactly this JSON shape (no other text, no markdown code fence):
{"name":"${artist}","bio":"2-3 sentence bio","genre":"primary genre","famousSongs":["song1","song2","song3"],"influence":"1-2 sentences on their influence on music"}

Return only the JSON object.`

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }],
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error("Anthropic API error:", res.status, err)
      return NextResponse.json(
        { error: "Claude request failed" },
        { status: 502 }
      )
    }

    const data = (await res.json()) as {
      content?: { type: string; text?: string }[]
    }
    const text = data.content?.[0]?.text ?? ""
    const parsed = extractJson(text)
    if (!parsed) {
      return NextResponse.json(
        { error: "Could not parse Claude response" },
        { status: 502 }
      )
    }

    return NextResponse.json(parsed)
  } catch (e) {
    console.error("Claude artist error:", e)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
