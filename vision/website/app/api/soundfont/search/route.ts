import { NextRequest, NextResponse } from "next/server"

const PERPLEXITY_API_URL = "https://api.perplexity.ai/chat/completions"

interface SoundfontSearchResult {
  instrument: {
    name: string
    description: string
    history: string
    origin: string
    family: string
    famousPlayers: string[]
    sound: string
  }
  gmProgram: number | null
  gmName: string | null
  sketchfabEmbed?: string | null
}

function extractJson(text: string): SoundfontSearchResult | null {
  const trimmed = text.trim()
  const start = trimmed.indexOf("{")
  const end = trimmed.lastIndexOf("}") + 1
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end)) as SoundfontSearchResult
  } catch {
    return null
  }
}


export async function POST(request: NextRequest) {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "PERPLEXITY_API_KEY not configured" },
      { status: 503 }
    )
  }

  try {
    const body = await request.json()
    const query = typeof body.query === "string" ? body.query.trim() : null
    if (!query || query.length < 2) {
      return NextResponse.json(
        { error: "query must be at least 2 characters" },
        { status: 400 }
      )
    }

    const prompt = `For the musical instrument "${query}", return this JSON (no markdown, no citations, no brackets like [1]):

{
  "instrument": {
    "name": "Proper name",
    "description": "1 short sentence on what it is and how it's played",
    "history": "2 short sentences on its history and cultural significance",
    "origin": "Region of origin",
    "family": "string/wind/percussion/etc",
    "famousPlayers": ["Player 1", "Player 2", "Player 3"],
    "sound": "1 short sentence on what it sounds like"
  },
  "gmProgram": 25,
  "gmName": "acoustic_guitar_steel"
}

Keep ALL text very short and concise. No citations or references.
For gmProgram: closest General MIDI program number (0-127).
For famousPlayers: just names, 3-4 max.
Return ONLY the JSON.`

    const res = await fetch(PERPLEXITY_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "sonar",
        messages: [
          {
            role: "system",
            content:
              "You are a concise music expert. Return only valid JSON. No markdown. No citation brackets like [1][2]. Keep all text very short.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 600,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error("Perplexity API error:", res.status, err)
      return NextResponse.json(
        { error: "Perplexity search failed" },
        { status: 502 }
      )
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const text = data.choices?.[0]?.message?.content ?? ""
    const parsed = extractJson(text)
    if (!parsed) {
      console.error("Could not parse Perplexity response:", text.slice(0, 500))
      return NextResponse.json(
        { error: "Could not parse search results" },
        { status: 502 }
      )
    }

    // Strip any remaining citation brackets from all text fields
    const strip = (s: string) => s.replace(/\[\d+\]/g, "").trim()
    parsed.instrument.description = strip(parsed.instrument.description)
    parsed.instrument.history = strip(parsed.instrument.history)
    parsed.instrument.sound = strip(parsed.instrument.sound)

    // --- Find a 3D model via Sketchfab search API with name matching ---
    parsed.sketchfabEmbed = null
    try {
      const instrumentName = parsed.instrument?.name || query
      const sfRes = await fetch(
        `https://api.sketchfab.com/v3/search?type=models&q=${encodeURIComponent(
          instrumentName + " musical instrument"
        )}&sort_by=-likeCount&animated=false&count=10`,
        { headers: { Accept: "application/json" } }
      )
      if (sfRes.ok) {
        const sfData = (await sfRes.json()) as {
          results?: Array<{ uid: string; name: string }>
        }

        // Filter results to find models that actually match the instrument name
        const models = sfData.results || []
        const instrumentNameLower = instrumentName.toLowerCase()

        // First pass: exact substring match
        let matchedModel = models.find(m =>
          m.name.toLowerCase().includes(instrumentNameLower)
        )

        // Second pass: check individual words for more exotic instruments
        if (!matchedModel && instrumentNameLower.split(' ').length > 1) {
          const words = instrumentNameLower.split(' ')
          matchedModel = models.find(m => {
            const modelNameLower = m.name.toLowerCase()
            return words.some(word => word.length > 3 && modelNameLower.includes(word))
          })
        }

        // Third pass: fallback to first result only if it's very popular (likely accurate)
        if (!matchedModel && models.length > 0) {
          const firstModel = models[0]
          // Only use first result if we have some confidence it's related
          const queryWords = instrumentNameLower.split(' ')
          const hasPartialMatch = queryWords.some(word =>
            word.length > 3 && firstModel.name.toLowerCase().includes(word)
          )
          if (hasPartialMatch) {
            matchedModel = firstModel
          }
        }

        if (matchedModel?.uid) {
          parsed.sketchfabEmbed = matchedModel.uid
          console.log(`Found 3D model for "${instrumentName}": ${matchedModel.name}`)
        } else {
          console.log(`No matching 3D model found for "${instrumentName}" (searched ${models.length} results)`)
        }
      }
    } catch (e) {
      console.error("Sketchfab search failed (non-fatal):", e)
    }

    return NextResponse.json(parsed)
  } catch (e) {
    console.error("Soundfont search error:", e)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
