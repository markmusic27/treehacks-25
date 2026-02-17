"use client"

import { useState, useEffect, useRef, useCallback, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Loader2,
  Music,
  Sparkles,
  AlertTriangle,
  Home,
  RotateCcw,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  X,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { PillowButton } from "@/components/maestro/pillow-button"

// ---------- Types ----------
type AnalysisData = {
  audioBase64: string
  culture: string
  instrument: string
  instrumentId: string
  mode: string
  elapsed: number
}

type CoachResult = {
  agent: string
  what_went_well: string
  what_could_improve: string
  specific_tip: string
  instrument: string
  inference_time: number
  technical_data: Record<string, string>
}

type SunoClip = {
  id: string
  status: string
  audio_url?: string
  title?: string
  image_url?: string
  image_large_url?: string
}

// ---------- Loading steps ----------
const LOADING_STEPS = [
  { label: "Listening to your session...", duration: 800 },
  { label: "Sending to AI...", duration: 1200 },
  { label: "Analyzing your performance...", duration: 2000 },
  { label: "Composing a song just for you...", duration: 4000 },
  { label: "Almost there... adding final touches...", duration: 8000 },
]

// ---------- Build narration text ----------
function trimToSentence(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text
  // Find the last sentence-ending punctuation before maxLen
  const slice = text.slice(0, maxLen)
  const lastPeriod = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "))
  if (lastPeriod > maxLen * 0.4) {
    return slice.slice(0, lastPeriod + 1)
  }
  // Fall back to last comma or space
  const lastComma = slice.lastIndexOf(", ")
  if (lastComma > maxLen * 0.4) {
    return slice.slice(0, lastComma + 1)
  }
  return slice.trim()
}

function buildNarration(r: CoachResult): string {
  const well = trimToSentence(r.what_went_well, 150)
  const improve = trimToSentence(r.what_could_improve, 100)
  return (
    `Hi! While your song is being created, let me tell you about your session. ` +
    `You played the ${r.instrument}. ${well} ` +
    `Something to work on next time: ${improve} ` +
    `Right now I'm composing an original song inspired by your performance. Hang tight!`
  )
}

// ---------- Main page component ----------
function AnalysisPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const instrumentId = searchParams.get("instrument") || "guitar"
  const mode = searchParams.get("mode") || "tutor"

  // --- State ---
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<CoachResult | null>(null)
  const [progress, setProgress] = useState(0)
  const [stepIndex, setStepIndex] = useState(0)

  // --- Suno state ---
  const [sunoClipId, setSunoClipId] = useState<string | null>(null)
  const [sunoStatus, setSunoStatus] = useState<string>("idle")
  const [sunoClip, setSunoClip] = useState<SunoClip | null>(null)
  const [sunoError, setSunoError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const postAnalysisStarted = useRef(false)

  // --- TTS narration state ---
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsBlobUrlRef = useRef<string | null>(null)

  // --- Song audio player state ---
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)

  // Song is "ready" when we have an audio URL
  const songReady = !!(
    sunoClip?.audio_url &&
    (sunoStatus === "streaming" || sunoStatus === "complete")
  )
  const loading = !error && !songReady
  // Keep showing loading view until TTS finishes (or is skipped) so speech isn't cut off when Suno loads
  const showLoadingView = loading || (songReady && ttsPlaying)

  // --- Animated progress bar ---
  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return 95
        return p + 0.3
      })
    }, 150)
    return () => clearInterval(interval)
  }, [loading])

  useEffect(() => {
    if (songReady) setProgress(100)
  }, [songReady])

  // --- Step labels ---
  useEffect(() => {
    if (!loading) return
    let elapsed = 0
    const timers: ReturnType<typeof setTimeout>[] = []
    LOADING_STEPS.forEach((step, i) => {
      elapsed += step.duration
      timers.push(setTimeout(() => setStepIndex(i), elapsed))
    })
    return () => timers.forEach(clearTimeout)
  }, [loading])

  // --- Fire TTS narration (script from middleman or fallback) ---
  const startTTS = useCallback(async (script: string) => {
    try {
      const resp = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: script }),
      })
      if (!resp.ok) {
        console.error("[TTS] Failed:", resp.status)
        return
      }

      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      ttsBlobUrlRef.current = url
      const audio = new Audio(url)
      ttsAudioRef.current = audio

      audio.onplay = () => setTtsPlaying(true)
      audio.onended = () => {
        setTtsPlaying(false)
        URL.revokeObjectURL(url)
        ttsBlobUrlRef.current = null
        ttsAudioRef.current = null
      }
      audio.onerror = () => {
        setTtsPlaying(false)
      }

      await audio.play()
    } catch (err) {
      console.error("[TTS] Error:", err)
    }
  }, [])

  const skipTTS = useCallback(() => {
    if (ttsAudioRef.current) {
      ttsAudioRef.current.pause()
      ttsAudioRef.current = null
    }
    if (ttsBlobUrlRef.current) {
      URL.revokeObjectURL(ttsBlobUrlRef.current)
      ttsBlobUrlRef.current = null
    }
    setTtsPlaying(false)
  }, [])

  // --- Fire Suno generation ---
  const startSuno = useCallback(async (coachResult: CoachResult & { current_performance?: string; musical_vision?: string }) => {
    try {
      setSunoStatus("generating")
      const description =
        coachResult.what_went_well?.slice(0, 400) ??
        coachResult.current_performance?.slice(0, 400) ??
        coachResult.musical_vision?.slice(0, 400) ??
        "live performance"
      const topic = `A song inspired by a ${coachResult.instrument || "instrument"} performance. ${description}`
      const tags = "instrumental, " + (coachResult.instrument || "acoustic")

      const resp = await fetch("/api/suno/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, tags, make_instrumental: true }),
      })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.error || `Suno error: ${resp.status}`)
      }

      const data = await resp.json()
      const clipId = data.id || data.clips?.[0]?.id
      if (!clipId) throw new Error("No clip ID returned from Suno")

      setSunoClipId(clipId)
      setSunoStatus("polling")
    } catch (err) {
      console.error("[Suno] Generate error:", err)
      setSunoError(err instanceof Error ? err.message : "Song generation failed")
      setSunoStatus("error")
      setError(err instanceof Error ? err.message : "Song generation failed")
    }
  }, [])

  // --- Poll Suno clips ---
  useEffect(() => {
    if (!sunoClipId || sunoStatus !== "polling") return

    async function poll() {
      try {
        const resp = await fetch(`/api/suno/clips?ids=${sunoClipId}`)
        if (!resp.ok) return

        const data = await resp.json()
        const clips: SunoClip[] = Array.isArray(data) ? data : data.clips || [data]
        const clip = clips.find((c: SunoClip) => c.id === sunoClipId)
        if (!clip) return

        setSunoClip(clip)

        if (clip.status === "streaming" || clip.status === "complete") {
          setSunoStatus(clip.status)
          if (clip.audio_url && pollRef.current) {
            clearInterval(pollRef.current)
          }
        }
        if (clip.status === "error") {
          setSunoStatus("error")
          setSunoError("Song generation failed on Suno's side")
          setError("Song generation failed. Please try again.")
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch (err) {
        console.error("[Suno] Poll error:", err)
      }
    }

    poll()
    pollRef.current = setInterval(poll, 5000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [sunoClipId, sunoStatus])

  // --- Send audio to GX10 on mount ---
  useEffect(() => {
    const raw = sessionStorage.getItem("maestro_audio_analysis")
    if (!raw) {
      setError("No recording data found. Please record a session first.")
      return
    }

    let data: AnalysisData
    try {
      data = JSON.parse(raw)
    } catch {
      setError("Invalid recording data.")
      return
    }

    async function analyze() {
      try {
        const resp = await fetch("/api/audio-coach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio_base64: data.audioBase64,
            culture: data.culture,
            instrument: data.instrument,
          }),
        })

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}))
          throw new Error(body.error || `Server error: ${resp.status}`)
        }

        const coachData: CoachResult = await resp.json()
        setResult(coachData)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Analysis failed")
      }
    }

    analyze()
  }, [])

  // --- After result arrives: Suno immediately; transcript middleman then TTS ---
  useEffect(() => {
    if (!result || postAnalysisStarted.current) return
    postAnalysisStarted.current = true
    startSuno(result)

    async function runTranscriptThenTTS() {
      let script: string
      try {
        const resp = await fetch("/api/analysis/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(result),
        })
        if (!resp.ok) throw new Error(`Transcript ${resp.status}`)
        const data = (await resp.json()) as { transcript?: string }
        script = data.transcript?.trim() || buildNarration(result)
      } catch {
        script = buildNarration(result)
      }
      startTTS(script)
    }
    runTranscriptThenTTS()
  }, [result, startTTS, startSuno])

  // --- Song audio player controls ---
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onEnded = () => setIsPlaying(false)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)

    audio.addEventListener("ended", onEnded)
    audio.addEventListener("play", onPlay)
    audio.addEventListener("pause", onPause)

    return () => {
      audio.removeEventListener("ended", onEnded)
      audio.removeEventListener("play", onPlay)
      audio.removeEventListener("pause", onPause)
    }
  }, [songReady])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      audio.play()
    } else {
      audio.pause()
    }
  }, [])

  const skipBy = useCallback((seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Math.max(0, Math.min(audio.currentTime + seconds, audio.duration || 0))
  }, [])

  // --- Cleanup ---
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause()
        ttsAudioRef.current = null
      }
      if (ttsBlobUrlRef.current) {
        URL.revokeObjectURL(ttsBlobUrlRef.current)
      }
    }
  }, [])

  const coverArt = sunoClip?.image_large_url || sunoClip?.image_url
  const songTitle = sunoClip?.title || "Your AI Song"
  const DISC_SIZE = 280

  return (
    <PageTransition className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center gap-6 max-w-md mx-auto w-full px-6 py-10">

        {/* ---------- LOADING STATE ---------- */}
        <AnimatePresence mode="wait">
          {showLoadingView && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -30 }}
              className="flex flex-col items-center gap-8 w-full"
            >
              <motion.div
                animate={{
                  scale: [1, 1.15, 1],
                  rotate: [0, 5, -5, 0],
                }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                className="w-28 h-28 rounded-full flex items-center justify-center shadow-lg"
                style={{
                  background: "linear-gradient(135deg, #CE82FF 0%, #9D5CFF 50%, #7C3AED 100%)",
                  boxShadow: "0 8px 40px rgba(157,92,255,0.4)",
                }}
              >
                <Music className="w-14 h-14 text-white" />
              </motion.div>

              <div className="text-center">
                <h1 className="text-2xl md:text-3xl font-black text-foreground mb-2">
                  Creating Your Song
                </h1>
                <motion.p
                  key={stepIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-muted-foreground font-semibold"
                >
                  {LOADING_STEPS[stepIndex]?.label}
                </motion.p>
              </div>

              <div className="w-full max-w-xs">
                <div
                  className="h-3 rounded-full overflow-hidden"
                  style={{ backgroundColor: "rgba(206,130,255,0.15)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: "linear-gradient(90deg, #CE82FF, #9D5CFF, #7C3AED)",
                    }}
                    initial={{ width: "0%" }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
                <p className="text-xs text-muted-foreground text-center mt-2 tabular-nums font-bold">
                  {Math.round(progress)}%
                </p>
              </div>

              <div className="flex items-end gap-1 h-10">
                {Array.from({ length: 16 }, (_, i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 rounded-full"
                    style={{ backgroundColor: "#CE82FF" }}
                    animate={{
                      height: [6, 20 + Math.random() * 20, 6],
                      opacity: [0.3, 1, 0.3],
                    }}
                    transition={{
                      duration: 0.6 + Math.random() * 0.8,
                      repeat: Infinity,
                      delay: i * 0.06,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>

              {/* TTS narration indicator during loading */}
              <AnimatePresence>
                {ttsPlaying && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border-b-[3px]"
                    style={{
                      backgroundColor: "#333",
                      borderBottomColor: "#222",
                    }}
                  >
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Volume2 className="w-4 h-4 text-white" />
                    </motion.div>
                    <span className="text-sm font-bold text-white">
                      Your AI tutor is talking...
                    </span>
                    <button
                      onClick={skipTTS}
                      className="ml-1 p-1 rounded-full hover:bg-white/10 transition-colors"
                      title="Skip narration"
                    >
                      <X className="w-4 h-4 text-white/60" />
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------- ERROR STATE ---------- */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-6 text-center"
            >
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center"
                style={{ backgroundColor: "rgba(255,59,48,0.12)" }}
              >
                <AlertTriangle className="w-10 h-10 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Something went wrong</h2>
              <p className="text-muted-foreground max-w-sm">{error}</p>
              <PillowButton
                onClick={() => router.back()}
                color="var(--maestro-red)"
                darkColor="#CC3333"
              >
                <span className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Try Again
                </span>
              </PillowButton>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ---------- VINYL PLAYER ---------- */}
        <AnimatePresence>
          {songReady && !error && !ttsPlaying && (
            <motion.div
              key="player"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20 }}
              className="w-full flex flex-col items-center gap-5"
            >
              {/* Hidden audio element */}
              {sunoClip?.audio_url && (
                <audio ref={audioRef} src={sunoClip.audio_url} preload="auto" />
              )}

              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 12, delay: 0.2 }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl mb-3 text-sm font-bold select-none border-b-[3px]"
                  style={{
                    backgroundColor: "#CE82FF",
                    borderBottomColor: "#9D5CFF",
                    color: "#fff",
                  }}
                >
                  <Sparkles className="w-4 h-4" />
                  Song Ready!
                </motion.div>
                <h1 className="text-2xl md:text-3xl font-black text-foreground">
                  AI Inspired Song from You
                </h1>
              </motion.div>

              {/* ===== VINYL DISC ===== */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="relative flex items-center justify-center overflow-hidden rounded-full"
                style={{ width: DISC_SIZE, height: DISC_SIZE }}
              >
                {isPlaying && (
                  <motion.div
                    className="absolute rounded-full"
                    style={{
                      width: DISC_SIZE + 16,
                      height: DISC_SIZE + 16,
                      border: "2px solid rgba(206,130,255,0.35)",
                    }}
                    animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                  />
                )}

                <motion.div
                  animate={{ rotate: 360 }}
                  transition={
                    isPlaying
                      ? { duration: 6, repeat: Infinity, ease: "linear" }
                      : { duration: 20, repeat: Infinity, ease: "linear" }
                  }
                  className="relative overflow-hidden"
                  style={{
                    width: DISC_SIZE,
                    height: DISC_SIZE,
                    borderRadius: "50%",
                    clipPath: "circle(50% at 50% 50%)",
                    background: "conic-gradient(from 0deg, #1a1a1a 0deg, #2a2a2a 30deg, #1a1a1a 60deg, #2a2a2a 90deg, #1a1a1a 120deg, #2a2a2a 150deg, #1a1a1a 180deg, #2a2a2a 210deg, #1a1a1a 240deg, #2a2a2a 270deg, #1a1a1a 300deg, #2a2a2a 330deg, #1a1a1a 360deg)",
                    boxShadow: isPlaying
                      ? "0 0 60px rgba(157,92,255,0.3), inset 0 0 30px rgba(0,0,0,0.5)"
                      : "0 8px 40px rgba(0,0,0,0.4), inset 0 0 30px rgba(0,0,0,0.5)",
                    willChange: "transform",
                    backfaceVisibility: "hidden",
                  }}
                >
                  {[0.38, 0.48, 0.58, 0.68, 0.78, 0.88, 0.95].map((pct, i) => (
                    <div
                      key={i}
                      className="absolute rounded-full"
                      style={{
                        width: `${pct * 100}%`,
                        height: `${pct * 100}%`,
                        top: `${(1 - pct) * 50}%`,
                        left: `${(1 - pct) * 50}%`,
                        border: "1px solid rgba(255,255,255,0.04)",
                      }}
                    />
                  ))}

                  <div
                    className="absolute rounded-full overflow-hidden"
                    style={{
                      width: "42%",
                      height: "42%",
                      top: "29%",
                      left: "29%",
                      boxShadow: "0 0 20px rgba(0,0,0,0.6)",
                    }}
                  >
                    {coverArt ? (
                      <img
                        src={coverArt}
                        alt={songTitle}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-full h-full flex items-center justify-center"
                        style={{
                          background: "linear-gradient(135deg, #CE82FF 0%, #7C3AED 100%)",
                        }}
                      >
                        <Music className="w-10 h-10 text-white/80" />
                      </div>
                    )}
                  </div>

                  <div
                    className="absolute rounded-full"
                    style={{
                      width: 10,
                      height: 10,
                      top: "calc(50% - 5px)",
                      left: "calc(50% - 5px)",
                      backgroundColor: "#111",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  />
                </motion.div>
              </motion.div>

              {/* Song title */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-center w-full px-4"
              >
                <h2 className="text-xl font-black text-foreground truncate">
                  {songTitle}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5 font-semibold">
                  AI x You
                </p>
              </motion.div>

              {/* Playback controls */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex items-center justify-center gap-3"
              >
                <PillowButton
                  onClick={() => skipBy(-5)}
                  size="sm"
                  color="#CE82FF"
                  darkColor="#9D5CFF"
                >
                  <span className="flex items-center gap-1.5">
                    <SkipBack className="w-4 h-4" />
                    5s
                  </span>
                </PillowButton>

                <PillowButton
                  onClick={togglePlay}
                  size="lg"
                  color="#CE82FF"
                  darkColor="#9D5CFF"
                >
                  <span className="flex items-center gap-2">
                    {isPlaying ? (
                      <>
                        <Pause className="w-5 h-5" fill="white" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="w-5 h-5 ml-0.5" fill="white" />
                        Play
                      </>
                    )}
                  </span>
                </PillowButton>

                <PillowButton
                  onClick={() => skipBy(5)}
                  size="sm"
                  color="#CE82FF"
                  darkColor="#9D5CFF"
                >
                  <span className="flex items-center gap-1.5">
                    5s
                    <SkipForward className="w-4 h-4" />
                  </span>
                </PillowButton>
              </motion.div>

              {/* Navigation buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="flex items-center justify-center gap-4 pt-2"
              >
                <PillowButton
                  onClick={() => {
                    skipTTS()
                    const params = new URLSearchParams({
                      instrument: instrumentId,
                      mode,
                    })
                    router.push(`/play?${params.toString()}`)
                  }}
                  color="#CE82FF"
                  darkColor="#9D5CFF"
                >
                  <span className="flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Play Again
                  </span>
                </PillowButton>
                <PillowButton
                  onClick={() => {
                    skipTTS()
                    router.push("/")
                  }}
                  color="#555"
                  darkColor="#3a3a3a"
                >
                  <span className="flex items-center gap-2">
                    <Home className="w-4 h-4" />
                    Home
                  </span>
                </PillowButton>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  )
}

export default function AnalysisPageWrapper() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <AnalysisPage />
    </Suspense>
  )
}
