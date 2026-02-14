"use client"

import AnimatedCharacter from "./AnimatedCharacter"

const CHARACTER_IMAGE = "/characters/maestro-spirit.png" // drop your Maestro Spirit PNG here

/** Maestro Spirit: blue ghost-like conductor with top hat and baton (your design). */
function MaestroSpiritFallback() {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-lg">
      <defs>
        <linearGradient id="maestro-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00E0FF" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#2FD6C4" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="85" fill="url(#maestro-glow)" />
      <circle cx="100" cy="100" r="70" fill="#7DD3FC" />
      <ellipse cx="100" cy="55" rx="28" ry="18" fill="#1e3a5f" />
      <rect x="85" y="35" width="30" height="22" rx="4" fill="#1e3a5f" />
      <line x1="100" y1="75" x2="100" y2="155" stroke="#1e3a5f" strokeWidth="4" />
      <circle cx="75" cy="92" r="14" fill="white" />
      <circle cx="125" cy="92" r="14" fill="white" />
      <circle cx="75" cy="92" r="6" fill="#1B1B1B" />
      <circle cx="125" cy="92" r="6" fill="#1B1B1B" />
      <path d="M82 128 Q100 148 118 128" stroke="#1B1B1B" strokeWidth="3" fill="transparent" strokeLinecap="round" />
    </svg>
  )
}

interface MaestroSpiritProps {
  width?: number
}

export default function MaestroSpirit({ width = 220 }: MaestroSpiritProps) {
  return (
    <AnimatedCharacter
      src={CHARACTER_IMAGE}
      alt="Maestro Spirit"
      width={width}
      motion="all"
    >
      <MaestroSpiritFallback />
    </AnimatedCharacter>
  )
}
