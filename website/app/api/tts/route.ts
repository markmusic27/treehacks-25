import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const apiKey = process.env.OPEN_AI || process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    )
  }

  try {
    const { text } = await request.json()

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 })
    }

    const resp = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: "nova",
        input: text,
        response_format: "mp3",
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error(`[TTS] OpenAI error ${resp.status}: ${errText}`)
      return NextResponse.json(
        { error: `OpenAI TTS error: ${resp.status}` },
        { status: 502 }
      )
    }

    const audioBuffer = await resp.arrayBuffer()

    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
      },
    })
  } catch (err) {
    console.error("[TTS] Failed:", err)
    return NextResponse.json(
      { error: "TTS generation failed" },
      { status: 500 }
    )
  }
}
