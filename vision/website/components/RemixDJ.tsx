"use client"

import AnimatedCharacter from "./AnimatedCharacter"

/** DJ / Remix character: purple with headphones and deck (your design). */
function RemixDJFallback() {
  return (
    <svg viewBox="0 0 200 200" className="w-full h-full drop-shadow-lg">
      <defs>
        <linearGradient id="dj-glow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF3CAC" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#9D5CFF" stopOpacity="0.35" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="85" fill="url(#dj-glow)" />
      <circle cx="100" cy="100" r="70" fill="#9D5CFF" />
      <ellipse cx="100" cy="58" rx="42" ry="14" fill="#1B1B1B" />
      <rect x="52" y="48" width="96" height="20" rx="8" fill="#2d2d2d" />
      <circle cx="72" cy="58" r="6" fill="#4ade80" />
      <circle cx="100" cy="58" r="6" fill="#f87171" />
      <circle cx="128" cy="58" r="6" fill="#60a5fa" />
      <circle cx="75" cy="92" r="14" fill="white" />
      <circle cx="125" cy="92" r="14" fill="white" />
      <circle cx="75" cy="92" r="6" fill="#1B1B1B" />
      <circle cx="125" cy="92" r="6" fill="#1B1B1B" />
      <path d="M82 122 Q100 138 118 122" stroke="#1B1B1B" strokeWidth="3" fill="transparent" strokeLinecap="round" />
    </svg>
  )
}

interface RemixDJProps {
  width?: number
}

export default function RemixDJ({ width = 220 }: RemixDJProps) {
  return (
    <AnimatedCharacter
      alt="Remix DJ"
      width={width}
      motion="sway"
    >
      <RemixDJFallback />
    </AnimatedCharacter>
  )
}
