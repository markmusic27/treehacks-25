"use client"

import AnimatedCharacter from "./AnimatedCharacter"

interface MaestroSpiritProps {
  width?: number
}

export default function MaestroSpirit({ width = 220 }: MaestroSpiritProps) {
  return (
    <AnimatedCharacter
      src="/bird.svg"
      alt="Maestro Bird"
      width={width}
      motion="all"
    />
  )
}
