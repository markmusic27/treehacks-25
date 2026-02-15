import { NextResponse } from "next/server"
import { generateMockResult } from "@/lib/mock-data"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { songId, instrumentId } = body

    if (!songId) {
      return NextResponse.json(
        { error: "songId is required" },
        { status: 400 }
      )
    }

    // TODO: Proxy to NVIDIA audio analysis backend
    // const response = await fetch(process.env.NVIDIA_ANALYSIS_URL!, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ recordingUrl, songId }),
    // })

    const result = generateMockResult(songId, instrumentId || "guitar")

    return NextResponse.json({
      score: result.score,
      accuracy: result.accuracy,
      rhythm: result.rhythm,
      timing: result.timing,
      xpEarned: result.xpEarned,
      stars: result.stars,
    })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
