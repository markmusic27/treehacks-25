"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import MaestroSpirit from "./MaestroSpirit"
import RemixDJ from "./RemixDJ"
import CulturalInstructor from "./CulturalInstructor"
import { welcomeMessages } from "@/data/welcomeMessages"

type MessageCharacter = "maestro" | "dj" | "instructor"

interface WelcomeMessage {
  character: MessageCharacter
  text: string
}

export default function WelcomeHero() {
  const [message, setMessage] = useState<WelcomeMessage | null>(null)

  useEffect(() => {
    const random =
      welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)]
    setMessage(random)
  }, [])

  if (!message) return null

  const renderCharacter = () => {
    if (message.character === "maestro") return <MaestroSpirit />
    if (message.character === "dj") return <RemixDJ />
    if (message.character === "instructor") return <CulturalInstructor />
    return null
  }

  return (
    <div
      className="min-h-screen flex flex-col md:flex-row items-center justify-center gap-8 md:gap-16 px-6 py-16 text-white"
      style={{
        background: "linear-gradient(135deg, #0F2027, #203A43, #2C5364)",
      }}
    >
      <div className="flex justify-center shrink-0">{renderCharacter()}</div>
      <div className="max-w-lg flex flex-col gap-6">
        <h1 className="text-4xl md:text-5xl font-black">Hello 👋</h1>
        <h2 className="text-2xl md:text-3xl font-bold opacity-90">
          Welcome back.
        </h2>
        <p className="text-lg md:text-xl opacity-80 leading-relaxed">
          {message.text}
        </p>
        <Link
          href="/home"
          className="inline-flex items-center justify-center px-6 py-3 rounded-2xl font-bold text-lg bg-white/20 hover:bg-white/30 transition-colors w-fit"
        >
          Explore Maestro →
        </Link>
      </div>
    </div>
  )
}
