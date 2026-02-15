import { NextRequest, NextResponse } from "next/server"

/**
 * POST /api/generate-song
 *
 * Takes MIDI events from recording and generates 4 song variations via:
 * 1. MIDI → MP3 conversion
 * 2. MP3 → Text description (placeholder)
 * 3. Text → Suno API (4 variations)
 */

type MidiEvent = {
  time: number
  midi_note: number
  velocity: number
  duration: number
  name: string
}

type GenerateRequest = {
  midiEvents: MidiEvent[]
  instrumentId: string
  duration: number
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as GenerateRequest

    if (!body.midiEvents || body.midiEvents.length === 0) {
      return NextResponse.json(
        { error: "No MIDI events provided" },
        { status: 400 }
      )
    }

    console.log(`[Generate] Processing ${body.midiEvents.length} MIDI events...`)

    // ─────────────────────────────────────────────────────────────
    // STEP 1: MIDI → MP3 (call Python backend)
    // ─────────────────────────────────────────────────────────────
    const midiToMp3Response = await fetch("http://localhost:8000/midi-to-mp3", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        midi_events: body.midiEvents,
        instrument_id: body.instrumentId,
      }),
    })

    if (!midiToMp3Response.ok) {
      throw new Error("MIDI to MP3 conversion failed")
    }

    const { mp3_path } = await midiToMp3Response.json()
    console.log(`[Generate] MP3 created: ${mp3_path}`)

    // ─────────────────────────────────────────────────────────────
    // STEP 2: MP3 → Text Description (placeholder for now)
    // ─────────────────────────────────────────────────────────────
    // TODO: Call audio-to-text model (Whisper, etc.)
    // For now, generate a basic description from MIDI metadata
    const description = generateDescriptionFromMidi(body.midiEvents, body.instrumentId)
    console.log(`[Generate] Description: ${description}`)

    // ─────────────────────────────────────────────────────────────
    // STEP 3: Generate 4 songs via Suno API
    // ─────────────────────────────────────────────────────────────
    const sunoApiKey = process.env.SUNO_API_KEY
    if (!sunoApiKey) {
      return NextResponse.json(
        { error: "SUNO_API_KEY not configured" },
        { status: 503 }
      )
    }

    // Generate 4 variations with different prompts
    const prompts = [
      `${description} with upbeat energy`,
      `${description} with chill vibes`,
      `${description} with dramatic intensity`,
      `${description} with ambient atmosphere`,
    ]

    const songGenerations = await Promise.all(
      prompts.map((prompt, index) =>
        generateSunoSong(sunoApiKey, prompt, `Song ${index + 1}`)
      )
    )

    console.log(`[Generate] Created ${songGenerations.length} songs`)

    return NextResponse.json({
      success: true,
      mp3_path,
      description,
      songs: songGenerations,
    })
  } catch (error) {
    console.error("[Generate] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Generation failed" },
      { status: 500 }
    )
  }
}

// ─────────────────────────────────────────────────────────────────
// Helper: Generate description from MIDI events
// ─────────────────────────────────────────────────────────────────
function generateDescriptionFromMidi(
  events: MidiEvent[],
  instrumentId: string
): string {
  const noteCount = events.length
  const avgVelocity =
    events.reduce((sum, e) => sum + e.velocity, 0) / noteCount
  const totalDuration = events[events.length - 1]?.time || 0

  // Analyze tempo (rough estimate)
  const tempo = noteCount > 1 ? noteCount / totalDuration : 1
  const tempoDesc = tempo > 3 ? "fast-paced" : tempo > 1.5 ? "moderate" : "slow"

  // Analyze intensity
  const intensityDesc = avgVelocity > 80 ? "energetic" : avgVelocity > 50 ? "balanced" : "soft"

  return `A ${tempoDesc}, ${intensityDesc} ${instrumentId} melody with ${noteCount} notes`
}

// ─────────────────────────────────────────────────────────────────
// Helper: Generate song via Suno API
// ─────────────────────────────────────────────────────────────────
async function generateSunoSong(
  apiKey: string,
  prompt: string,
  title: string
): Promise<{
  id: string
  title: string
  prompt: string
  audio_url: string | null
  status: "generating" | "complete" | "failed"
}> {
  // TODO: Replace with actual Suno API endpoint
  // This is a placeholder structure

  try {
    const response = await fetch("https://api.suno.ai/v1/generate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        title,
        make_instrumental: false,
        wait_audio: false, // Poll for completion later
      }),
    })

    if (!response.ok) {
      throw new Error(`Suno API error: ${response.status}`)
    }

    const data = await response.json()

    return {
      id: data.id || `song_${Date.now()}_${Math.random()}`,
      title,
      prompt,
      audio_url: data.audio_url || null,
      status: data.audio_url ? "complete" : "generating",
    }
  } catch (error) {
    console.error(`[Suno] Failed to generate "${title}":`, error)
    return {
      id: `song_${Date.now()}_${Math.random()}`,
      title,
      prompt,
      audio_url: null,
      status: "failed",
    }
  }
}
