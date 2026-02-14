"use client"

import { useEffect, useState } from "react"

const NOTE_SYMBOLS = ["\u{266A}", "\u{266B}", "\u{266C}", "\u{2669}", "\u{1D160}", "\u{1D15E}", "\u{1D161}"]
const COLORS = [
  "var(--maestro-green)",
  "var(--maestro-blue)",
  "var(--maestro-purple)",
  "var(--maestro-orange)",
  "var(--maestro-gold)",
]

interface FloatingNote {
  id: number
  symbol: string
  color: string
  left: number
  delay: number
  duration: number
  size: number
  opacity: number
  sway: number
}

export function FloatingNotes({ count = 25 }: { count?: number }) {
  const [notes, setNotes] = useState<FloatingNote[]>([])

  useEffect(() => {
    const generated: FloatingNote[] = Array.from({ length: count }, (_, i) => ({
      id: i,
      symbol: NOTE_SYMBOLS[Math.floor(Math.random() * NOTE_SYMBOLS.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      left: Math.random() * 100,
      delay: Math.random() * 10,
      duration: 10 + Math.random() * 15,
      size: 14 + Math.random() * 28,
      opacity: 0.3 + Math.random() * 0.5,
      sway: 20 + Math.random() * 40,
    }))
    setNotes(generated)
  }, [count])

  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
      {notes.map((note) => (
        <span
          key={note.id}
          className="absolute opacity-0"
          style={{
            left: `${note.left}%`,
            bottom: "-10%",
            color: note.color,
            fontSize: `${note.size}px`,
            filter: `blur(${note.size > 30 ? 1 : 0}px)`,
            animation: `float-up ${note.duration}s ${note.delay}s linear infinite`,
          }}
        >
          {note.symbol}
        </span>
      ))}
    </div>
  )
}
