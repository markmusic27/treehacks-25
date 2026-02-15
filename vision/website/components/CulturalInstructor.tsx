"use client"

import AnimatedCharacter from "./AnimatedCharacter"

/** Cultural Conductor: note-shaped with conductor jacket and floral patterns (your design). */
function CulturalInstructorFallback() {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-lg">
      <defs>
        <linearGradient id="cultural-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD700" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#FFB347" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="85" fill="url(#cultural-glow)" />
      <circle cx="100" cy="100" r="70" fill="#FFB347" />
      <rect x="78" y="55" width="44" height="50" rx="8" fill="#1B1B1B" />
      <path d="M88 55 L100 35 L112 55 Z" fill="#1B1B1B" />
      <rect x="82" y="62" width="36" height="6" rx="2" fill="#facc15" />
      <rect x="82" y="72" width="36" height="4" rx="1" fill="#facc15" opacity="0.8" />
      <circle cx="75" cy="92" r="14" fill="white" />
      <circle cx="125" cy="92" r="14" fill="white" />
      <circle cx="75" cy="92" r="6" fill="#1B1B1B" />
      <circle cx="125" cy="92" r="6" fill="#1B1B1B" />
      <path d="M82 122 Q100 142 118 122" stroke="#1B1B1B" strokeWidth="3" fill="transparent" strokeLinecap="round" />
    </svg>
  )
}

interface CulturalInstructorProps {
  width?: number
}

export default function CulturalInstructor({ width = 220 }: CulturalInstructorProps) {
  return (
    <AnimatedCharacter
      alt="Cultural Conductor"
      width={width}
      motion="float"
    >
      <CulturalInstructorFallback />
    </AnimatedCharacter>
  )
}
