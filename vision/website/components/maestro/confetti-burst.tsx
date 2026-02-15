"use client"

import { useEffect, useCallback } from "react"
import confetti from "canvas-confetti"

interface ConfettiBurstProps {
  trigger: boolean
  colors?: string[]
}

export function ConfettiBurst({
  trigger,
  colors = ["#CE82FF", "#1CB0F6", "#DCA0FF", "#FFC800", "#FF9600"],
}: ConfettiBurstProps) {
  const fire = useCallback(() => {
    // Single short burst from center — no repeating side cannons
    confetti({
      particleCount: 28,
      spread: 70,
      origin: { y: 0.6 },
      colors,
      zIndex: 9999,
    })
  }, [colors])

  useEffect(() => {
    if (trigger) {
      fire()
    }
  }, [trigger, fire])

  return null
}
