import { NextResponse } from "next/server"

type CoachResult = {
  what_went_well: string
  what_could_improve: string
  specific_tip: string
  instrument?: string
}

type CurrentFeedback = {
  visual_coach: CoachResult
  audio_coach: CoachResult
}

type TutorTone = "strict" | "mellow" | "energetic" | "formal"

type TranscriptBody = {
  currentFeedback: CurrentFeedback
  previousFeedback: CurrentFeedback[]
  instrument?: string
  tutorName?: string
  tutorTone?: TutorTone
}

export async function POST(request: Request) {
  const apiKey = process.env.OPEN_AI || process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    )
  }

  try {
    const body: TranscriptBody = await request.json()
    const {
      currentFeedback,
      previousFeedback = [],
      instrument = "your instrument",
      tutorName = "your tutor",
      tutorTone = "mellow",
    } = body

    if (!currentFeedback?.visual_coach || !currentFeedback?.audio_coach) {
      return NextResponse.json(
        { error: "currentFeedback with visual_coach and audio_coach is required" },
        { status: 400 }
      )
    }

    const v = currentFeedback.visual_coach
    const a = currentFeedback.audio_coach

    const previousSummary =
      previousFeedback.length > 0
        ? previousFeedback
            .map(
              (p, i) =>
                `Round ${i + 1}: Visual — ${p.visual_coach.what_went_well}; ${p.visual_coach.what_could_improve}. Audio — ${p.audio_coach.what_went_well}; ${p.audio_coach.what_could_improve}.`
            )
            .join("\n")
        : ""

    const toneInstructions: Record<TutorTone, string> = {
      strict:
        "Your tone is STRICT: direct, no-nonsense, and demanding. Hold high standards. Be clear and firm — no sugarcoating. Acknowledge what went well briefly, then focus on what must improve. Use short, decisive sentences. You care about their progress but don't coddle.",
      mellow:
        "Your tone is MELLOW: laid-back, warm, and encouraging. Go with the flow. Keep it relaxed and supportive — no pressure. Use gentle, conversational language. Every step forward is worth noting.",
      energetic:
        "Your tone is ENERGETIC: upbeat, celebratory, and high-energy. Get excited about wins! Use exclamations and enthusiasm. Celebrate what went well, then frame the next step as an exciting challenge. Keep the vibe positive and motivating.",
      formal:
        "Your tone is FORMAL: professional, articulate, and polished. Speak like a respected conservatory teacher. Use clear, proper language. Be respectful and measured. Acknowledge progress with dignity and present feedback with grace.",
    }
    const toneBlock = toneInstructions[tutorTone] ?? toneInstructions.mellow

    const systemPrompt = `You are ${tutorName}, a music tutor. The student just finished a short practice round on ${instrument}. You receive structured feedback from two AI coaches (visual form + audio performance).${previousSummary ? " You also have brief notes from their previous rounds in this session — use them to acknowledge progress (e.g. 'Last time we worked on X; you've improved there') and keep the conversation continuous." : ""}

${toneBlock}

Your objective (same for every tutor): write a short transcript (2–4 sentences) to be read aloud. Weave in what went well (from both coaches), one thing to improve and the specific tip, and if there is previous feedback briefly reference their progression. Write only the spoken text: no bullet points, no labels, natural. Keep it under 80 words.`

    const userContent = `Current round feedback:

Visual coach: What went well — ${v.what_went_well}. What could improve — ${v.what_could_improve}. Specific tip — ${v.specific_tip}.

Audio coach: What went well — ${a.what_went_well}. What could improve — ${a.what_could_improve}. Specific tip — ${a.specific_tip}.
${previousSummary ? `\nPrevious rounds in this session:\n${previousSummary}` : ""}

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
      console.error("[tutor/transcript] OpenAI error:", resp.status, errText)
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
      "You're making progress. Keep practicing and focus on the tips from your coaches."

    return NextResponse.json({ transcript })
  } catch (err) {
    console.error("[tutor/transcript] Failed:", err)
    return NextResponse.json(
      { error: "Transcript generation failed" },
      { status: 500 }
    )
  }
}
