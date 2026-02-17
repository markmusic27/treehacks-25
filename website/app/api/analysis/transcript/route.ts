import { NextResponse } from "next/server"

/** New GX10 format for song-generation flow */
type GX10MusicOutput = {
  current_performance?: string
  musical_vision?: string
  genre_mood_tags?: string
  instrument?: string
}

/** Legacy coach response (what /api/audio-coach returns today) */
type CoachResult = {
  what_went_well?: string
  what_could_improve?: string
  specific_tip?: string
  instrument?: string
}

type Body = GX10MusicOutput & CoachResult

export async function POST(request: Request) {
  const apiKey = process.env.OPEN_AI || process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    )
  }

  try {
    const body: Body = await request.json()
    const instrument = body.instrument || "your instrument"

    // Prefer new GX10 format; fall back to legacy coach fields
    const hasNewFormat =
      body.current_performance ?? body.musical_vision ?? body.genre_mood_tags

    let currentPerformance: string
    let musicalVision: string
    let genreMoodTags: string

    if (hasNewFormat) {
      currentPerformance =
        body.current_performance?.trim() ||
        "The performance had a distinct character and feel."
      musicalVision =
        body.musical_vision?.trim() ||
        "We're turning this into a full piece that honors your playing."
      genreMoodTags =
        body.genre_mood_tags?.trim() || "inspired by your session"
    } else {
      // Legacy: build from what_went_well / what_could_improve / specific_tip
      const well = body.what_went_well?.trim() || ""
      const improve = body.what_could_improve?.trim() || ""
      const tip = body.specific_tip?.trim() || ""
      currentPerformance = [well, improve, tip].filter(Boolean).join(" ") || "You brought your own feel to it."
      musicalVision =
        "We're composing an original song inspired by your performance—same vibe, expanded into a full track."
      genreMoodTags = instrument ? `${instrument}, your style` : "your style"
    }

    const systemPrompt = `You are a warm, direct voice speaking to the user over the phone. They just finished a short practice session on ${instrument}. An AI music coach (GX10) analyzed their performance and produced the following. Your job is to turn this into a short spoken script (2–4 sentences) that:
1. Addresses the user directly ("you", "your playing").
2. Briefly reflects what their current performance sounds like (tempo, feel, mood)—using the CURRENT PERFORMANCE summary.
3. Paints a quick picture of the song we're creating for them—using the MUSICAL VISION and GENRE & MOOD TAGS so they feel excited and understood.
Be conversational and encouraging. No bullet points, no labels, no "CURRENT PERFORMANCE:" headers. Write only what you would say out loud. Keep it under 80 words.`

    const userContent = `Use this GX10 output to write the short spoken script:

CURRENT PERFORMANCE:
${currentPerformance}

MUSICAL VISION:
${musicalVision}

GENRE & MOOD TAGS:
${genreMoodTags}

Generate the short spoken transcript now (plain text only):`

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 200,
        temperature: 0.7,
      }),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      console.error("[analysis/transcript] OpenAI error:", resp.status, errText)
      return NextResponse.json(
        { error: `OpenAI error: ${resp.status}` },
        { status: 502 }
      )
    }

    const data = (await resp.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const transcript =
      data.choices?.[0]?.message?.content?.trim() ||
      "We're creating a song inspired by your performance. Hang tight—it'll be ready in a moment."

    return NextResponse.json({ transcript })
  } catch (err) {
    console.error("[analysis/transcript] Failed:", err)
    return NextResponse.json(
      { error: "Transcript generation failed" },
      { status: 500 }
    )
  }
}
