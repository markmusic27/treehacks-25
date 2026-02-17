import { NextResponse } from "next/server"
import { generateMockRemixes, remixStyles } from "@/lib/mock-data"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { style } = body

    // TODO: Proxy to Suno API backend for real remix generation
    // const response = await fetch(process.env.SUNO_API_URL!, {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: JSON.stringify({ recordingUrl, style }),
    // })

    const personaId = body.personaId as string | undefined

    if (style) {
      const matchedStyle = remixStyles.find(
        (s) => s.id === style || s.name.toLowerCase() === style.toLowerCase()
      )
      if (!matchedStyle) {
        return NextResponse.json(
          { error: "Unknown remix style" },
          { status: 400 }
        )
      }

      const allRemixes = generateMockRemixes(personaId)
      const remix = allRemixes.find((r) => r.style.id === matchedStyle.id)
      return NextResponse.json({ remix })
    }

    const remixes = generateMockRemixes(personaId)
    return NextResponse.json({ remixes })
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
