"use client"

import { GraduationCap } from "lucide-react"
import AnimatedCharacter from "./AnimatedCharacter"

interface CulturalInstructorProps {
  width?: number
}

export default function CulturalInstructor({ width = 220 }: CulturalInstructorProps) {
  const iconSize = Math.round(width * 0.45)
  return (
    <AnimatedCharacter alt="Tutoring" width={width} motion="float">
      <div className="flex items-center justify-center rounded-full"
        style={{
          width: iconSize * 1.8,
          height: iconSize * 1.8,
          background: "linear-gradient(135deg, #CE82FF 0%, #9D5CFF 100%)",
        }}
      >
        <GraduationCap size={iconSize} strokeWidth={1.8} color="#FFFFFF" />
      </div>
    </AnimatedCharacter>
  )
}
