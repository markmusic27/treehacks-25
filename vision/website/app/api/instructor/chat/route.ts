import { NextResponse } from "next/server"
import { instructors } from "@/lib/mock-data"

const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions"

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY not configured. Add it to .env.local and restart the dev server." },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()
    const instructorId = typeof body.instructorId === "string" ? body.instructorId.trim() : null
    const messages = Array.isArray(body.messages) ? body.messages : []
    const context = body.context && typeof body.context === "object" ? body.context : {}
    const songTitle = typeof context.songTitle === "string" ? context.songTitle : "this piece"
    const instrumentName = typeof context.instrumentName === "string" ? context.instrumentName : "their instrument"

    if (!instructorId) {
      return NextResponse.json(
        { error: "instructorId is required" },
        { status: 400 }
      )
    }

    const instructor = instructors.find((i) => i.id === instructorId)
    if (!instructor) {
      return NextResponse.json(
        { error: "Unknown instructor" },
        { status: 400 }
      )
    }

    const systemPrompt = `${instructor.systemPrompt}

Right now you're in the middle of their practice session. They're working on the piece "${songTitle}" on the ${instrumentName} (instrument only—no singing). They have paused and can talk to you like a real personal coach: ask how their session is going, get feedback, ask about technique or the piece, change the piece, or just chat. Answer always as ${instructor.name}, in character. Be conversational and supportive so it feels like talking to a real coach. Keep replies to 2–5 sentences unless they ask for more.`

    const rawMessages: { role: string; content: string }[] = messages
      .filter(
        (m: unknown) =>
          m &&
          typeof m === "object" &&
          "role" in m &&
          "content" in m &&
          (m as { role: string }).role !== "system"
      )
      .map((m: { role: string; content: string }) => ({
        role: (m as { role: string }).role === "assistant" ? "assistant" : "user",
        content: String((m as { content: string }).content).trim(),
      }))
      .filter((m) => m.content.length > 0)

    const apiMessages: { role: "user" | "assistant" | "system"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...rawMessages,
    ]

    if (rawMessages.length === 0 || rawMessages[0].role !== "user") {
      return NextResponse.json(
        { error: "At least one user message is required" },
        { status: 400 }
      )
    }

    const res = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 512,
        messages: apiMessages,
      }),
    })

    const responseText = await res.text()
    if (!res.ok) {
      console.error("OpenAI API error:", res.status, responseText)
      let errMessage = "Chat request failed."
      try {
        const errJson = JSON.parse(responseText) as { error?: { message?: string } }
        if (errJson?.error?.message) {
          const raw = errJson.error.message
          if (raw && !/^model\s*:/i.test(raw.trim())) errMessage = raw
        }
      } catch {
        // use default
      }
      return NextResponse.json({ error: errMessage }, { status: 502 })
    }

    let data: { choices?: Array<{ message?: { content?: string } }> }
    try {
      data = JSON.parse(responseText) as typeof data
    } catch {
      return NextResponse.json(
        { error: "Invalid response from ChatGPT" },
        { status: 502 }
      )
    }

    const content = data.choices?.[0]?.message?.content
    const message =
      typeof content === "string" && content.trim()
        ? content.trim()
        : "I'm here when you need me."

    return NextResponse.json({ message })
  } catch (e) {
    console.error("Instructor chat error:", e)
    return NextResponse.json(
      { error: "Internal server error. Check the server console." },
      { status: 500 }
    )
  }
}
