"use client"

import { Music } from "lucide-react"
import AnimatedCharacter from "./AnimatedCharacter"

interface RemixDJProps {
  width?: number
}

export default function RemixDJ({ width = 220 }: RemixDJProps) {
  const iconSize = Math.round(width * 0.45)
  return (
    <AnimatedCharacter alt="Generate Song" width={width} motion="sway">
      <div className="flex items-center justify-center rounded-full"
        style={{
          width: iconSize * 1.8,
          height: iconSize * 1.8,
          background: "linear-gradient(135deg, #CE82FF 0%, #9D5CFF 100%)",
        }}
      >
        <Music size={iconSize} strokeWidth={1.8} color="#FFFFFF" />
      </div>
    </AnimatedCharacter>
  )
}
