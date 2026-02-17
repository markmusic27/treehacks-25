"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Loader2,
  Wifi,
  WifiOff,
  Eye,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  X,
  Volume2,
  VolumeX,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { PillowButton } from "@/components/maestro/pillow-button"
import { instruments } from "@/lib/mock-data"

const VISION_WS_URL = "ws://localhost:8766"

// ---------- Tutor personality lookup (UI + transcript tone) ----------

type TutorPersonality = {
  id: string
  name: string
  style: string
  color: string
  tone: "strict" | "mellow" | "energetic" | "formal"
}

const TUTORS: Record<string, TutorPersonality> = {
  "strict-sarah": {
    id: "strict-sarah",
    name: "Strict Sarah",
    style: "Direct, no-nonsense",
    color: "#FF4444",
    tone: "strict",
  },
  "mellow-maya": {
    id: "mellow-maya",
    name: "Mellow Maya",
    style: "Laid-back, encouraging",
    color: "#4ECDC4",
    tone: "mellow",
  },
  "energetic-ella": {
    id: "energetic-ella",
    name: "Energetic Ella",
    style: "Upbeat, celebratory",
    color: "#FFC800",
    tone: "energetic",
  },
  "formal-fiona": {
    id: "formal-fiona",
    name: "Formal Fiona",
    style: "Professional, articulate",
    color: "#6366F1",
    tone: "formal",
  },
}

// ---------- Types ----------

type MidiEvent = {
  time: number
  midi_note: number
  velocity: number
  duration: number
  name: string
}

type CoachResult = {
  what_went_well: string
  what_could_improve: string
  specific_tip: string
  instrument?: string
}

type CoachingResponse = {
  visual_coach: CoachResult
  audio_coach: CoachResult
  total_time?: number
  instrument?: string
}

type SessionState = "idle" | "playing" | "paused" | "processing" | "feedback" | "ended"

// ---------- Main Session Component ----------

function TutoringSession() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const instrumentId = searchParams.get("instrument") || ""
  const tutorId = searchParams.get("tutor") || "mellow-maya"
  const customName = searchParams.get("customName") || ""
  const gmProgram = searchParams.get("gmProgram") || ""

  // Resolve instrument & tutor
  const builtInInstrument = instruments.find((i) => i.id === instrumentId)
  const instrument: { id: string; name: string; color: string } | null =
    builtInInstrument ??
    (instrumentId && customName
      ? { id: instrumentId, name: customName, color: "#CE82FF" }
      : instrumentId
        ? { id: instrumentId, name: instrumentId, color: "#CE82FF" }
        : null)

  const tutor = TUTORS[tutorId] || TUTORS["mellow-maya"]

  // ----- Session state -----
  const [sessionState, setSessionState] = useState<SessionState>("idle")
  const [elapsed, setElapsed] = useState(0)
  const [midiEvents, setMidiEvents] = useState<MidiEvent[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ----- Vision WebSocket state -----
  const [wsConnected, setWsConnected] = useState(false)
  const [frameSrc, setFrameSrc] = useState<string | null>(null)
  const [showOverlays, setShowOverlays] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  // ----- Fullscreen state -----
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ----- Microphone for session recording -----
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // ----- Replay during processing (audio only; notes animated in UI) -----
  const [replayAudioUrl, setReplayAudioUrl] = useState<string | null>(null)
  const [replayMuted, setReplayMuted] = useState(false)
  const replayAudioRef = useRef<HTMLAudioElement | null>(null)

  // ----- GX10 + transcript + TTS (stop-playing feedback) -----
  const [processingStep, setProcessingStep] = useState<string>("Analyzing your performance…")
  const [processingProgress, setProcessingProgress] = useState(0)
  const [coachingResult, setCoachingResult] = useState<CoachingResponse | null>(null)
  const [previousFeedback, setPreviousFeedback] = useState<CoachingResponse[]>([])
  const [transcript, setTranscript] = useState<string | null>(null)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [ttsPlaying, setTtsPlaying] = useState(false)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const ttsBlobUrlRef = useRef<string | null>(null)

  // Redirect if missing params
  useEffect(() => {
    if (!instrument) {
      router.push("/tutor/select")
    }
  }, [instrument, router])

  // ----- WebSocket connection to Vision server -----
  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let mounted = true

    function connect() {
      if (!mounted) return
      ws = new WebSocket(VISION_WS_URL)
      ws.binaryType = "blob"
      wsRef.current = ws

      ws.onopen = () => {
        if (mounted) setWsConnected(true)
        // Resume the server
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "resume" }))
        }
        // Set instrument
        if (instrumentId && ws?.readyState === WebSocket.OPEN) {
          const msg: Record<string, string> = {
            action: "set_instrument",
            instrumentId,
          }
          if (gmProgram) msg.gmProgram = gmProgram
          ws.send(JSON.stringify(msg))
        }
      }

      ws.onmessage = (event) => {
        if (!mounted) return
        if (event.data instanceof Blob) {
          const url = URL.createObjectURL(event.data)
          setFrameSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return url
          })
        } else {
          try {
            const data = JSON.parse(event.data)
            if (data.type === "midi") {
              setMidiEvents(data.events || [])
            } else if (data.type === "coaching_loading") {
              setProcessingStep(data.message || "Analyzing your performance…")
            } else if (data.type === "coaching_error") {
              setCoachingResult(null)
              setTranscript(null)
              setFeedbackError(data.error || "Coaching request failed")
              setSessionState("feedback")
            } else if (data.type === "coaching" && data.visual_coach && data.audio_coach) {
              const result: CoachingResponse = {
                visual_coach: data.visual_coach,
                audio_coach: data.audio_coach,
                total_time: data.total_time,
                instrument: data.instrument,
              }
              setCoachingResult(result)
              setPreviousFeedback((prev) => [...prev, result])
              setFeedbackError(null)
              setProcessingStep("Preparing your feedback…")
              // Transcript + TTS run in useEffect below; then state becomes "feedback"
            }
          } catch {
            // ignore
          }
        }
      }

      ws.onclose = () => {
        if (mounted) {
          setWsConnected(false)
          reconnectTimer = setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    connect()

    return () => {
      mounted = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "pause" }))
        }
        ws.onclose = null
        ws.close()
      }
      setFrameSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [])

  // ----- Send WS command to Vision server -----
  const sendWsCommand = useCallback(
    (action: string, extra?: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ action, ...extra }))
      }
    },
    []
  )

  // ----- Microphone management for session recording -----
  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.start(1000)
      mediaRecorderRef.current = recorder
    } catch (err) {
      console.error("[Mic] Failed to start recording:", err)
    }
  }, [])

  const stopMicrophone = useCallback((): Promise<Blob[]> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = () => {
          const chunks = [...audioChunksRef.current]
          resolve(chunks)
        }
        recorder.stop()
      } else {
        resolve([...audioChunksRef.current])
      }
      mediaRecorderRef.current = null
    })
  }, [])

  // ----- Session controls -----

  const startPlaying = useCallback(() => {
    setSessionState("playing")
    setElapsed(0)
    setMidiEvents([])
    sendWsCommand("start")
    sendWsCommand("resume")
    startMicrophone()
  }, [sendWsCommand, startMicrophone])

  const pausePlaying = useCallback(async () => {
    sendWsCommand("stop")
    sendWsCommand("pause")
    const chunks = await stopMicrophone()

    setCoachingResult(null)
    setTranscript(null)
    setFeedbackError(null)
    setReplayMuted(false)
    setProcessingStep("Analyzing your performance…")
    setProcessingProgress(0)

    if (chunks.length > 0) {
      const blob = new Blob(chunks, { type: "audio/webm" })
      const url = URL.createObjectURL(blob)
      setReplayAudioUrl(url)
    } else {
      setReplayAudioUrl(null)
    }

    setSessionState("processing")

    let audioBase64 = ""
    if (chunks.length > 0) {
      const blob = new Blob(chunks, { type: "audio/webm" })
      const buffer = await blob.arrayBuffer()
      audioBase64 = btoa(
        new Uint8Array(buffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      )
    }

    const culture =
      (builtInInstrument as { origin?: string } | undefined)?.origin || "general"
    const instrumentName = instrument?.name || instrumentId || "string instrument"

    sendWsCommand("get_coaching", {
      audio_base64: audioBase64,
      culture,
      instrument: instrumentName,
    })
  }, [sendWsCommand, stopMicrophone, builtInInstrument, instrument, instrumentId])

  const resumePlaying = useCallback(() => {
    setSessionState("playing")
    setMidiEvents([])
    sendWsCommand("start")
    sendWsCommand("resume")
    startMicrophone()
  }, [sendWsCommand, startMicrophone])

  const endSession = useCallback(async () => {
    setSessionState("ended")
    sendWsCommand("stop")
    sendWsCommand("pause")
    await stopMicrophone()

    // Close Vision WebSocket
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }

    // Store session data for summary
    sessionStorage.setItem(
      "maestro_tutor_session",
      JSON.stringify({
        instrumentId,
        instrumentName: instrument?.name || instrumentId,
        tutorId: tutor.id,
        tutorName: tutor.name,
        elapsed,
        noteCount: midiEvents.length,
        midiEvents: midiEvents.slice(-20),
      })
    )

    router.push("/tutor/summary")
  }, [sendWsCommand, stopMicrophone, instrumentId, instrument, tutor, elapsed, midiEvents, router])

  // ----- Timer -----
  useEffect(() => {
    if (sessionState === "playing") {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [sessionState])

  // ----- After GX10 coaching: fetch transcript → TTS → play, then show feedback -----
  const culture =
    (builtInInstrument as { origin?: string } | undefined)?.origin || "general"
  const instrumentName = instrument?.name || instrumentId || "string instrument"

  useEffect(() => {
    if (sessionState !== "processing" || !coachingResult || !instrument) return

    let cancelled = false

    async function runTranscriptAndTTS() {
      try {
        setProcessingStep("Preparing your feedback…")
        const prevList = previousFeedback.slice(0, -1)
        const transcriptRes = await fetch("/api/tutor/transcript", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentFeedback: {
              visual_coach: coachingResult.visual_coach,
              audio_coach: coachingResult.audio_coach,
            },
            previousFeedback: prevList,
            instrument: instrumentName,
            tutorName: tutor.name,
            tutorTone: tutor.tone,
          }),
        })
        if (!transcriptRes.ok || cancelled) return
        const { transcript: text } = (await transcriptRes.json()) as {
          transcript?: string
        }
        if (!text || cancelled) return
        setTranscript(text)

        const ttsRes = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        })
        if (!ttsRes.ok || cancelled) return
        const blob = await ttsRes.blob()
        const url = URL.createObjectURL(blob)
        ttsBlobUrlRef.current = url
        const audio = new Audio(url)
        ttsAudioRef.current = audio
        audio.onplay = () => setTtsPlaying(true)
        audio.onended = () => {
          setTtsPlaying(false)
          if (ttsBlobUrlRef.current) {
            URL.revokeObjectURL(ttsBlobUrlRef.current)
            ttsBlobUrlRef.current = null
          }
          ttsAudioRef.current = null
        }
        audio.onerror = () => setTtsPlaying(false)
        await audio.play()
        if (!cancelled) setSessionState("feedback")
      } catch (err) {
        console.error("[Tutor] Transcript/TTS failed:", err)
        if (!cancelled) {
          setFeedbackError("Could not prepare spoken feedback. You can still read the tips below.")
          setSessionState("feedback")
        }
      }
    }

    runTranscriptAndTTS()
    return () => {
      cancelled = true
    }
  }, [sessionState, coachingResult, instrument, instrumentName, tutor.name])

  // ----- Processing progress bar: ramp 0 → 95 while analyzing -----
  useEffect(() => {
    if (sessionState !== "processing") return
    const interval = setInterval(() => {
      setProcessingProgress((p) => (p >= 95 ? 95 : p + Math.random() * 3 + 1))
    }, 400)
    return () => clearInterval(interval)
  }, [sessionState])

  // ----- Replay audio: start when entering processing, cleanup when leaving -----
  useEffect(() => {
    if (sessionState !== "processing") {
      if (replayAudioRef.current) {
        replayAudioRef.current.pause()
        replayAudioRef.current = null
      }
      if (replayAudioUrl) URL.revokeObjectURL(replayAudioUrl)
      setReplayAudioUrl(null)
      return
    }
    if (replayAudioUrl) {
      const audio = new Audio(replayAudioUrl)
      replayAudioRef.current = audio
      audio.loop = true
      audio.muted = replayMuted
      if (!replayMuted) audio.play().catch(() => {})
    }
    return () => {
      if (replayAudioRef.current) {
        replayAudioRef.current.pause()
        replayAudioRef.current = null
      }
    }
  }, [sessionState, replayAudioUrl])

  useEffect(() => {
    if (sessionState !== "processing" || !replayAudioRef.current) return
    const audio = replayAudioRef.current
    audio.muted = replayMuted
    if (!replayMuted) audio.play().catch(() => {})
  }, [sessionState, replayMuted])

  // ----- Toggle CV overlays -----
  const toggleOverlays = useCallback(() => {
    const next = !showOverlays
    setShowOverlays(next)
    sendWsCommand("set_overlays", { enabled: next })
  }, [showOverlays, sendWsCommand])

  // ----- Fullscreen -----
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) setIsFullscreen(false)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isFullscreen])

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? "hidden" : ""
    return () => { document.body.style.overflow = "" }
  }, [isFullscreen])

  // ----- Cleanup on unmount -----
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== "inactive") {
        mediaRecorderRef.current?.stop()
      }
      if (ttsAudioRef.current) {
        ttsAudioRef.current.pause()
        ttsAudioRef.current = null
      }
      if (ttsBlobUrlRef.current) {
        URL.revokeObjectURL(ttsBlobUrlRef.current)
        ttsBlobUrlRef.current = null
      }
    }
  }, [])

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  if (!instrument) return null

  return (
    <PageTransition className="h-screen bg-background flex flex-col overflow-hidden">
      {/* ===== MAIN SPLIT LAYOUT ===== */}
      <div className="flex-1 flex min-h-0">
        {/* ===== Main content — Video + Controls ===== */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Video feed */}
          <div className="flex-1 relative bg-black flex items-center justify-center min-h-0">
            {/* Top-left: session info */}
            <div className="absolute top-3 left-3 z-10 flex items-center gap-3">
              {sessionState === "playing" && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm">
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-2.5 h-2.5 rounded-full bg-red-500"
                  />
                  <span className="text-red-400 text-sm font-bold">
                    {formatTime(elapsed)}
                  </span>
                </div>
              )}
              {sessionState === "paused" && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm">
                  <Pause className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-yellow-400 text-sm font-bold">
                    Paused &middot; {formatTime(elapsed)}
                  </span>
                </div>
              )}
              {wsConnected && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/60 backdrop-blur-sm">
                  <Wifi className="w-3 h-3 text-green-400" />
                </div>
              )}
            </div>

            {/* Top-right: CV + fullscreen controls */}
            {wsConnected && (
              <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleOverlays}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer select-none transition-all"
                  style={{
                    backgroundColor: showOverlays ? "#CE82FF" : "rgba(0,0,0,0.6)",
                    color: "#fff",
                  }}
                >
                  <Eye className="w-3.5 h-3.5" />
                  {showOverlays ? "CV On" : "CV Off"}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={toggleFullscreen}
                  className="flex items-center justify-center w-8 h-8 rounded-xl cursor-pointer select-none transition-all"
                  style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            )}

            {/* Processing overlay — replay audio + animated notes + analyzing message */}
            {sessionState === "processing" && (
              <div className="absolute inset-0 z-20 flex flex-col bg-background overflow-auto">
                <div className="flex-1 p-4 flex flex-col gap-6 max-w-2xl mx-auto w-full">
                  {/* Replay header + Mute */}
                  <div className="rounded-2xl border-2 border-border bg-card overflow-hidden shadow-lg">
                    <div className="bg-muted/50 px-4 py-2.5 flex items-center justify-between">
                      <span className="font-bold text-foreground text-sm uppercase tracking-wide">
                        Replay
                      </span>
                      {replayAudioUrl && (
                        <button
                          type="button"
                          onClick={() => setReplayMuted((m) => !m)}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-background/80 hover:bg-background text-sm font-medium transition-colors"
                          aria-label={replayMuted ? "Unmute" : "Mute"}
                        >
                          {replayMuted ? (
                            <VolumeX className="w-4 h-4 text-muted-foreground" />
                          ) : (
                            <Volume2 className="w-4 h-4 text-foreground" />
                          )}
                          {replayMuted ? "Unmute" : "Mute"}
                        </button>
                      )}
                    </div>
                    {/* Animated notes strip — right to left, Duolingo-style */}
                    {midiEvents.length > 0 && (
                      <div className="overflow-hidden py-5 bg-gradient-to-b from-muted/20 to-transparent">
                        <motion.div
                          className="flex gap-3 w-max"
                          animate={{ x: ["0%", "-33.333%"] }}
                          transition={{
                            duration: 18,
                            repeat: Infinity,
                            ease: "linear",
                          }}
                        >
                          {[1, 2, 3].map((copy) => (
                            <div key={copy} className="flex gap-3 shrink-0">
                              {midiEvents.map((evt, i) => (
                                <motion.span
                                  key={`${copy}-${evt.time}-${i}`}
                                  initial={{ scale: 0.9, opacity: 0.8 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  className="inline-flex items-center px-4 py-2 rounded-2xl text-sm font-bold shadow-md border-2 border-primary/40 bg-primary text-primary-foreground shrink-0"
                                  style={{
                                    boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                                  }}
                                >
                                  {evt.name || `Note ${evt.midi_note}`}
                                </motion.span>
                              ))}
                            </div>
                          ))}
                        </motion.div>
                      </div>
                    )}
                    {midiEvents.length === 0 && (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        No notes captured this round — play some notes next time!
                      </div>
                    )}
                  </div>

                  {/* Analyzing — progress bar + waveform dots (no circle) */}
                  <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-lg">
                    <div className="p-6 flex flex-col items-center gap-5 text-center">
                      <div>
                        <p className="font-bold text-foreground text-lg">
                          {processingStep}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          We&apos;ll get back to you shortly.
                        </p>
                      </div>
                      {/* Progress bar with percentage */}
                      <div className="w-full max-w-sm">
                        <div className="h-2.5 w-full rounded-full bg-muted/80 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full bg-[#CE82FF] shadow-[0_0_12px_rgba(206,130,255,0.5)]"
                            style={{
                              background: "linear-gradient(90deg, #A855F7 0%, #CE82FF 50%, #E879F9 100%)",
                            }}
                            initial={{ width: "0%" }}
                            animate={{ width: `${processingProgress}%` }}
                            transition={{ type: "tween", duration: 0.4 }}
                          />
                        </div>
                        <p className="text-center text-muted-foreground text-sm font-medium mt-2">
                          {Math.round(processingProgress)}%
                        </p>
                      </div>
                      {/* Waveform-style dots */}
                      <div className="flex items-center justify-center gap-1.5">
                        {Array.from({ length: 15 }).map((_, i) => (
                          <motion.div
                            key={i}
                            className="w-2 h-2 rounded-full bg-[#CE82FF]"
                            animate={{
                              opacity: [0.25, 1, 0.25],
                              scale: [0.9, 1.15, 0.9],
                            }}
                            transition={{
                              duration: 1.2,
                              repeat: Infinity,
                              delay: i * 0.08,
                              ease: "easeInOut",
                            }}
                            style={{
                              boxShadow: "0 0 8px rgba(206,130,255,0.4)",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Feedback view — after coaching + TTS ready (or error) */}
            {sessionState === "feedback" && (
              <div className="absolute inset-0 z-20 flex flex-col bg-background/98 overflow-auto">
                <div className="flex-1 p-6 flex flex-col gap-4">
                  {feedbackError && (
                    <div className="rounded-xl bg-destructive/15 border border-destructive/30 px-4 py-3 text-sm text-destructive">
                      {feedbackError}
                    </div>
                  )}
                  {transcript && (
                    <div className="rounded-xl border border-border bg-card p-4">
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        {tutor.name} says:
                      </p>
                      <p className="text-foreground leading-relaxed">{transcript}</p>
                    </div>
                  )}
                  {coachingResult && !transcript && !feedbackError && (
                    <p className="text-sm text-muted-foreground">Preparing spoken feedback…</p>
                  )}
                  {coachingResult && (transcript || feedbackError) && (
                    <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3 text-sm">
                      <p className="font-semibold text-foreground">Visual coach</p>
                      <p><span className="text-muted-foreground">Good:</span> {coachingResult.visual_coach.what_went_well}</p>
                      <p><span className="text-muted-foreground">Improve:</span> {coachingResult.visual_coach.what_could_improve}</p>
                      <p><span className="text-muted-foreground">Tip:</span> {coachingResult.visual_coach.specific_tip}</p>
                      <p className="font-semibold text-foreground pt-2">Audio coach</p>
                      <p><span className="text-muted-foreground">Good:</span> {coachingResult.audio_coach.what_went_well}</p>
                      <p><span className="text-muted-foreground">Improve:</span> {coachingResult.audio_coach.what_could_improve}</p>
                      <p><span className="text-muted-foreground">Tip:</span> {coachingResult.audio_coach.specific_tip}</p>
                    </div>
                  )}
                  {ttsPlaying && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <motion.div
                        animate={{ opacity: [1, 0.4, 1] }}
                        transition={{ duration: 1.2, repeat: Infinity }}
                        className="w-2 h-2 rounded-full bg-[#CE82FF]"
                      />
                      Your tutor is speaking…
                    </div>
                  )}
                  {transcript && !ttsPlaying && (
                    <button
                      type="button"
                      onClick={() => {
                        if (ttsAudioRef.current) {
                          ttsAudioRef.current.pause()
                          ttsAudioRef.current = null
                        }
                        if (ttsBlobUrlRef.current) {
                          URL.revokeObjectURL(ttsBlobUrlRef.current)
                          ttsBlobUrlRef.current = null
                        }
                        setTtsPlaying(false)
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground underline"
                    >
                      Skip playback
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Video frame (hidden when processing or feedback) */}
            {sessionState !== "processing" && sessionState !== "feedback" && (
              wsConnected && frameSrc ? (
                <img
                  src={frameSrc}
                  alt="Vision camera feed"
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-4 p-8">
                  {!wsConnected ? (
                    <>
                      <WifiOff className="w-12 h-12 text-[#777]" />
                      <p className="text-sm text-[#999] text-center font-semibold">
                        Waiting for Vision server...
                      </p>
                      <p className="text-xs text-[#666] text-center">
                        Run{" "}
                        <code className="bg-[#222] text-[#CE82FF] px-2 py-0.5 rounded">
                          uv run treehacks-server
                        </code>{" "}
                        in the project root
                      </p>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-10 h-10 text-[#777] animate-spin" />
                      <p className="text-sm text-[#999]">Connecting to camera...</p>
                    </>
                  )}
                </div>
              )
            )}
          </div>

          {/* Bottom controls bar */}
          <div className="flex items-center justify-between px-6 py-3 bg-background border-t border-border">
            <div className="flex items-center gap-3">
              <p className="text-sm text-muted-foreground font-semibold">
                Playing{" "}
                <span style={{ color: instrument.color }} className="font-bold">
                  {instrument.name}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-3">
              {sessionState === "idle" && (
                <PillowButton onClick={startPlaying} size="md">
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    Start Playing
                  </span>
                </PillowButton>
              )}
              {sessionState === "playing" && (
                <PillowButton
                  onClick={pausePlaying}
                  size="md"
                  color="#FFC800"
                  darkColor="#CC9F00"
                >
                  <span className="flex items-center gap-2">
                    <Pause className="w-4 h-4" />
                    Stop Playing
                  </span>
                </PillowButton>
              )}
              {sessionState === "processing" && (
                <PillowButton size="md" disabled className="opacity-50 cursor-not-allowed">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing…
                  </span>
                </PillowButton>
              )}
              {sessionState === "feedback" && (
                <PillowButton onClick={startPlaying} size="md">
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    Start Playing Again
                  </span>
                </PillowButton>
              )}
              {sessionState === "paused" && (
                <PillowButton onClick={resumePlaying} size="md">
                  <span className="flex items-center gap-2">
                    <Play className="w-4 h-4" />
                    Resume Playing
                  </span>
                </PillowButton>
              )}

              {(sessionState === "playing" || sessionState === "processing" || sessionState === "feedback" || sessionState === "paused") && (
                <PillowButton
                  onClick={endSession}
                  size="md"
                  color="var(--maestro-red)"
                  darkColor="#CC3333"
                >
                  <span className="flex items-center gap-2">
                    <X className="w-4 h-4" />
                    End Session
                  </span>
                </PillowButton>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== FULLSCREEN OVERLAY ===== */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          >
            {wsConnected && frameSrc ? (
              <img
                src={frameSrc}
                alt="Vision camera feed"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-4 p-8">
                <Loader2 className="w-10 h-10 text-[#777] animate-spin" />
                <p className="text-sm text-[#999]">Waiting for video...</p>
              </div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3"
            >
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleOverlays}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold cursor-pointer select-none backdrop-blur-sm"
                style={{
                  backgroundColor: showOverlays ? "rgba(206,130,255,0.9)" : "rgba(51,51,51,0.85)",
                  color: "#fff",
                }}
              >
                <Eye className="w-4 h-4" />
                {showOverlays ? "CV On" : "CV Off"}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleFullscreen}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold cursor-pointer select-none backdrop-blur-sm"
                style={{ backgroundColor: "rgba(51,51,51,0.85)", color: "#fff" }}
              >
                <Minimize2 className="w-4 h-4" />
                Exit
              </motion.button>
            </motion.div>

            {sessionState === "playing" && (
              <div className="absolute top-5 left-5 flex items-center gap-2">
                <motion.div
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-3 h-3 rounded-full bg-red-500"
                />
                <span className="text-red-400 text-sm font-bold">
                  {formatTime(elapsed)}
                </span>
              </div>
            )}

            <div className="absolute top-5 right-5 text-[#666] text-xs font-medium">
              Press <kbd className="bg-[#222] text-[#aaa] px-1.5 py-0.5 rounded text-[10px] font-mono">ESC</kbd> to exit
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}

export default function TutoringSessionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TutoringSession />
    </Suspense>
  )
}
