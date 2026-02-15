import { NextResponse } from "next/server"
import { generateMockResult } from "@/lib/mock-data"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { songId, instrumentId } = body

    if (!songId || !instrumentId) {
      return NextResponse.json(
        { error: "songId and instrumentId are required" },
        { status: 400 }
      )
    }

    // TODO: Proxy to GPT-4 / Claude backend for real feedback
    // const response = await fetch(process.env.FEEDBACK_API_URL!, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ songId, instrumentId, performanceData }),
    // })

    const result = generateMockResult(songId, instrumentId)

    return NextResponse.json({
      technique: result.technique,
      artistInfo: result.artistInfo,
      instrumentInfo: result.instrumentInfo,
      songAnalysis: result.songAnalysis,
    })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
