import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const GX10_URL = process.env.GX10_AUDIO_URL || "http://10.34.183.144:8002"

  try {
    const body = await request.json()
    const { audio_base64, culture, instrument } = body

    if (!audio_base64) {
      return NextResponse.json(
        { error: "audio_base64 is required" },
        { status: 400 }
      )
    }

    const resp = await fetch(`${GX10_URL}/audio-coach`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audio_base64, culture, instrument }),
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error(`[audio-coach] GX10 returned ${resp.status}: ${text}`)
      return NextResponse.json(
        { error: `GX10 error: ${resp.status}` },
        { status: 502 }
      )
    }

    const data = await resp.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error("[audio-coach] Failed:", err)
    return NextResponse.json(
      { error: "Failed to connect to audio analysis server" },
      { status: 502 }
    )
  }
}
