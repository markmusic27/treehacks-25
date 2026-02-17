import { NextResponse } from "next/server"

/**
 * POST /api/realtime/session
 *
 * Generates an ephemeral client secret for OpenAI Realtime API WebRTC connections.
 * The browser uses this to establish a direct WebRTC connection to the model.
 *
 * Body (optional): { voice?: string, instructions?: string }
 */
export async function POST(request: Request) {
  const apiKey = process.env.OPEN_AI
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    )
  }

  let voice = "ash"
  let instructions = "You are a helpful music tutor."

  try {
    const body = await request.json()
    if (body.voice) voice = body.voice
    if (body.instructions) instructions = body.instructions
  } catch {
    // No body or invalid JSON — use defaults
  }

  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/client_secrets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session: {
            type: "realtime",
            model: "gpt-4o-realtime-preview",
            instructions,
            audio: {
              output: { voice },
            },
          },
        }),
      }
    )

    if (!response.ok) {
      const errorBody = await response.text()
      console.error("[Realtime] Failed to create session:", response.status, errorBody)
      return NextResponse.json(
        { error: `OpenAI error: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json({
      clientSecret: data.client_secret?.value || data.value,
      expiresAt: data.client_secret?.expires_at || data.expires_at,
    })
  } catch (err) {
    console.error("[Realtime] Error:", err)
    return NextResponse.json(
      { error: "Failed to create realtime session" },
      { status: 500 }
    )
  }
}
