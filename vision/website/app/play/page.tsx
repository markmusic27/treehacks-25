"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowRight,
  Circle,
  Square,
  Loader2,
  Wifi,
  WifiOff,
  Mic,
  MicOff,
  Sparkles,
  Eye,
  Music,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { ProgressHeader } from "@/components/maestro/progress-header"
import { PillowButton } from "@/components/maestro/pillow-button"
import { instruments } from "@/lib/mock-data"

const VISION_WS_URL = "ws://localhost:8766"

type MidiEvent = {
  time: number
  midi_note: number
  velocity: number
  duration: number
  name: string
}

type CoachFeedback = {
  agent: string
  what_went_well: string
  what_could_improve: string
  specific_tip: string
  instrument: string
  inference_time: number
}

type CoachingResult = {
  visual_coach: CoachFeedback
  audio_coach: CoachFeedback
  total_time: number
  instrument: string
}

function RecordingStudio() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const instrumentId = searchParams.get("instrument")
  const customName = searchParams.get("customName")
  const gmProgram = searchParams.get("gmProgram")

  // Support both built-in instruments and custom discovered ones
  const builtInInstrument = instruments.find((i) => i.id === instrumentId)
  const instrument: { id: string; name: string; color: string } | null =
    builtInInstrument ??
    (instrumentId && customName
      ? { id: instrumentId, name: customName, color: "#CE82FF" }
      : null)

  // ----- Core state -----
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [midiEvents, setMidiEvents] = useState<MidiEvent[]>([])

  // ----- Vision WebSocket state -----
  const [wsConnected, setWsConnected] = useState(false)
  const [frameSrc, setFrameSrc] = useState<string | null>(null)
  const [showOverlays, setShowOverlays] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  // ----- Microphone & AI coaching state -----
  const [micActive, setMicActive] = useState(false)
  const [coachingLoading, setCoachingLoading] = useState(false)
  const [coachingResult, setCoachingResult] = useState<CoachingResult | null>(null)
  const [coachingError, setCoachingError] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // ----- Refs for intervals -----
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Redirect if missing params
  useEffect(() => {
    if (!instrument) {
      router.push("/select")
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
        console.log("[Vision WS] Connected")
        // Tell the Python server which instrument we're playing
        if (instrumentId && ws?.readyState === WebSocket.OPEN) {
          const msg: Record<string, string> = {
            action: "set_instrument",
            instrumentId,
          }
          // For custom instruments, also send the GM program number
          if (gmProgram) msg.gmProgram = gmProgram
          ws.send(JSON.stringify(msg))
          console.log(`[Vision WS] Set instrument: ${instrumentId}${gmProgram ? ` (GM ${gmProgram})` : ""}`)
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
              console.log(`[Vision WS] Received ${data.total} MIDI events`)
            } else if (data.type === "coaching") {
              console.log("[Vision WS] AI coaching received")
              setCoachingResult({
                visual_coach: data.visual_coach,
                audio_coach: data.audio_coach,
                total_time: data.total_time,
                instrument: data.instrument,
              })
              setCoachingLoading(false)
            } else if (data.type === "coaching_loading") {
              console.log(`[Vision WS] ${data.message}`)
            } else if (data.type === "coaching_error") {
              console.warn(`[Vision WS] Coaching error: ${data.error}`)
              setCoachingError(data.error)
              setCoachingLoading(false)
            } else if (data.type === "status") {
              console.log(`[Vision WS] ${data.message}`)
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      ws.onclose = () => {
        if (mounted) {
          setWsConnected(false)
          console.log("[Vision WS] Disconnected, reconnecting in 2s...")
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
        ws.onclose = null
        ws.close()
      }
      setFrameSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [])

  // ----- Microphone management -----
  const startMicrophone = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.start(1000) // collect chunks every second
      mediaRecorderRef.current = recorder
      setMicActive(true)
      console.log("[Mic] Recording started")
    } catch (err) {
      console.error("[Mic] Failed to start:", err)
      setMicActive(false)
    }
  }, [])

  /** Stop the mic and return a Promise that resolves with all recorded audio chunks. */
  const stopMicrophone = useCallback((): Promise<Blob[]> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = () => {
          // All chunks (including the final one) are now in audioChunksRef
          const chunks = [...audioChunksRef.current]
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop())
            streamRef.current = null
          }
          mediaRecorderRef.current = null
          setMicActive(false)
          console.log(`[Mic] Stopped — ${chunks.length} chunks collected`)
          resolve(chunks)
        }
        recorder.stop()
      } else {
        // No recorder was active
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop())
          streamRef.current = null
        }
        mediaRecorderRef.current = null
        setMicActive(false)
        resolve([...audioChunksRef.current])
      }
    })
  }, [])

  // Cleanup mic on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop())
      }
    }
  }, [])

  // ----- Send WS command -----
  const sendWsCommand = useCallback((action: string, extra?: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...extra }))
    }
  }, [])

  // ----- Toggle CV overlays -----
  const toggleOverlays = useCallback(() => {
    const next = !showOverlays
    setShowOverlays(next)
    sendWsCommand("set_overlays", { enabled: next })
  }, [showOverlays, sendWsCommand])

  // ----- Send coaching request with given audio chunks -----
  const sendCoachingRequest = useCallback(async (chunks: Blob[]) => {
    setCoachingLoading(true)
    setCoachingError(null)

    let audioBase64 = ""
    if (chunks.length > 0) {
      const audioBlob = new Blob(chunks, { type: "audio/webm" })
      const buffer = await audioBlob.arrayBuffer()
      audioBase64 = btoa(
        new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
      )
      console.log(`[Coaching] Audio encoded: ${audioBase64.length} chars`)
    }

    sendWsCommand("get_coaching", {
      audio_base64: audioBase64,
      culture: instrument?.origin || "general",
      instrument: instrument?.name || "string instrument",
    })
  }, [sendWsCommand, instrument])

  // ----- Recording controls -----
  const startRecording = useCallback(() => {
    setIsRecording(true)
    setElapsed(0)
    setMidiEvents([])
    setCoachingResult(null)
    setCoachingError(null)
    setCoachingLoading(false)
    sendWsCommand("start")
    startMicrophone()
  }, [sendWsCommand, startMicrophone])

  const stopRecording = useCallback(async () => {
    sendWsCommand("stop")
    setIsRecording(false)
    if (intervalRef.current) clearInterval(intervalRef.current)

    const chunks = await stopMicrophone()
    sendCoachingRequest(chunks)
  }, [sendWsCommand, stopMicrophone, sendCoachingRequest])

  const viewResults = useCallback(() => {
    // Store MIDI events and session metadata in sessionStorage for the generation page
    sessionStorage.setItem(
      "maestro_recording",
      JSON.stringify({
        midiEvents,
        instrumentId: instrumentId || "guitar",
        elapsed,
      })
    )
    const params = new URLSearchParams({
      instrument: instrumentId || "guitar",
    })
    router.push(`/generate?${params.toString()}`)
  }, [midiEvents, instrumentId, elapsed, router])

  // Timer
  useEffect(() => {
    if (isRecording) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRecording])

  // Auto-navigate when recording stops and we have MIDI events
  useEffect(() => {
    if (!isRecording && midiEvents.length > 0 && elapsed > 0) {
      // Wait 1 second to show the recording summary, then navigate
      const timer = setTimeout(() => {
        viewResults()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [isRecording, midiEvents.length, elapsed, viewResults])

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  if (!instrument) return null

  return (
    <PageTransition className="min-h-screen bg-background flex flex-col">
      <ProgressHeader
        currentStep={2}
        totalSteps={3}
        onClose={() => router.push("/select")}
      />

      <div className="flex-1 flex flex-col items-center gap-6 max-w-3xl mx-auto w-full px-6 py-4">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-2xl md:text-3xl font-black text-foreground">
            Tutoring Studio
          </h1>
          <p className="text-muted-foreground mt-1">
            Playing{" "}
            <span style={{ color: instrument.color }} className="font-semibold">
              {instrument.name}
            </span>
          </p>
        </motion.div>

        {/* Video feed area */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="w-full aspect-video rounded-2xl overflow-hidden relative flex items-center justify-center bg-black"
        >
          {/* CV overlay toggle */}
          {wsConnected && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleOverlays}
              className="absolute top-3 right-3 z-10 flex items-center gap-2 px-4 py-2 rounded-2xl text-sm font-bold cursor-pointer select-none border-b-[3px] active:border-b-0 active:mt-[3px] transition-all"
              style={{
                backgroundColor: showOverlays ? "#CE82FF" : "#333",
                borderBottomColor: showOverlays ? "#9D5CFF" : "#222",
                color: "#fff",
              }}
            >
              <Eye className="w-4 h-4" />
              {showOverlays ? "CV On" : "CV Off"}
            </motion.button>
          )}
          {wsConnected && frameSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
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
                      uv run server.py
                    </code>{" "}
                    in the{" "}
                    <code className="bg-[#222] text-[#aaa] px-2 py-0.5 rounded">
                      vision/
                    </code>{" "}
                    folder
                  </p>
                </>
              ) : (
                <>
                  <Loader2 className="w-10 h-10 text-[#777] animate-spin" />
                  <p className="text-sm text-[#999]">
                    Connecting to camera...
                  </p>
                </>
              )}
            </div>
          )}
        </motion.div>

        {/* Timer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <p className="text-4xl font-black text-foreground tabular-nums">
            {formatTime(elapsed)}
          </p>
        </motion.div>

        {/* Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex items-center gap-6"
        >
          {!isRecording ? (
            <PillowButton
              onClick={startRecording}
              size="lg"
              color="var(--maestro-red)"
              darkColor="#CC3333"
            >
              <span className="flex items-center gap-2">
                <Circle className="w-5 h-5 fill-current" />
                Record
              </span>
            </PillowButton>
          ) : (
            <PillowButton
              onClick={stopRecording}
              size="lg"
              color="var(--maestro-red)"
              darkColor="#CC3333"
            >
              <span className="flex items-center gap-2">
                <Square className="w-4 h-4 fill-current" />
                End Recording
              </span>
            </PillowButton>
          )}
        </motion.div>

        {/* Recording indicator + mic status */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-4"
            >
              <div className="flex items-center gap-2">
                <motion.div
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: "var(--maestro-red)" }}
                />
                <span
                  className="text-sm font-semibold"
                  style={{ color: "var(--maestro-red)" }}
                >
                  Recording...
                </span>
              </div>
              {micActive && (
                <div className="flex items-center gap-1.5">
                  <Mic className="w-3.5 h-3.5" style={{ color: "var(--maestro-green)" }} />
                  <span className="text-xs text-muted-foreground font-medium">Mic on</span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Coaching — loading indicator (shown after session ends) */}
        <AnimatePresence>
          {!isRecording && coachingLoading && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="w-full rounded-2xl border border-border p-6 flex flex-col items-center gap-3"
              style={{ backgroundColor: "var(--maestro-surface)" }}
            >
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#CE82FF" }} />
              <p className="text-sm font-semibold text-foreground">
                Analyzing your performance...
              </p>
              <p className="text-xs text-muted-foreground">
                Sending video + audio to GX10 AI coaches
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI Coaching feedback (shown after session ends) */}
        <AnimatePresence>
          {!isRecording && coachingResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full space-y-4"
            >
              {/* Visual Coach */}
              <div
                className="rounded-2xl border border-border p-5"
                style={{ backgroundColor: "var(--maestro-surface)" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Eye className="w-4 h-4" style={{ color: "#FFD700" }} />
                  <h3 className="font-bold text-foreground text-sm">Visual Form Coach</h3>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {coachingResult.visual_coach.inference_time.toFixed(1)}s
                  </span>
                </div>
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <CheckCircle2
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: "var(--maestro-green)" }}
                    />
                    <p className="text-sm text-foreground">
                      {coachingResult.visual_coach.what_went_well}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <AlertTriangle
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: "var(--maestro-yellow, #FFD700)" }}
                    />
                    <p className="text-sm text-foreground">
                      {coachingResult.visual_coach.what_could_improve}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Sparkles
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: "#CE82FF" }}
                    />
                    <p className="text-sm text-foreground font-medium">
                      {coachingResult.visual_coach.specific_tip}
                    </p>
                  </div>
                </div>
              </div>

              {/* Audio Coach */}
              <div
                className="rounded-2xl border border-border p-5"
                style={{ backgroundColor: "var(--maestro-surface)" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Music className="w-4 h-4" style={{ color: "#CE82FF" }} />
                  <h3 className="font-bold text-foreground text-sm">Audio Performance Coach</h3>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {coachingResult.audio_coach.inference_time.toFixed(1)}s
                  </span>
                </div>
                <div className="space-y-2.5">
                  <div className="flex gap-2">
                    <CheckCircle2
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: "var(--maestro-green)" }}
                    />
                    <p className="text-sm text-foreground">
                      {coachingResult.audio_coach.what_went_well}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <AlertTriangle
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: "var(--maestro-yellow, #FFD700)" }}
                    />
                    <p className="text-sm text-foreground">
                      {coachingResult.audio_coach.what_could_improve}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Sparkles
                      className="w-4 h-4 mt-0.5 shrink-0"
                      style={{ color: "#CE82FF" }}
                    />
                    <p className="text-sm text-foreground font-medium">
                      {coachingResult.audio_coach.specific_tip}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                Analyzed in {coachingResult.total_time.toFixed(1)}s on ASUS GX10
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Coaching error (shown after session ends) */}
        <AnimatePresence>
          {!isRecording && coachingError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="w-full rounded-xl border border-red-500/30 p-4 text-center"
              style={{ backgroundColor: "rgba(255,59,48,0.08)" }}
            >
              <p className="text-sm text-red-400">{coachingError}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Connection status */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-4 text-xs"
        >
          {wsConnected ? (
            <div className="flex items-center gap-2">
              <Wifi className="w-3.5 h-3.5" style={{ color: "var(--maestro-green)" }} />
              <span className="text-muted-foreground font-medium">Vision server connected</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground font-medium">Disconnected</span>
            </div>
          )}
          {micActive ? (
            <div className="flex items-center gap-1.5">
              <Mic className="w-3 h-3" style={{ color: "var(--maestro-green)" }} />
              <span className="text-muted-foreground font-medium">Mic active</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <MicOff className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground font-medium">Mic off</span>
            </div>
          )}
        </motion.div>

        {/* MIDI events summary (shown after recording ends) */}
        <AnimatePresence>
          {!isRecording && midiEvents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="w-full rounded-2xl border border-border p-5"
              style={{ backgroundColor: "var(--maestro-surface)" }}
            >
              <h2 className="font-bold text-foreground text-sm mb-3">
                Recording Complete
              </h2>
              <div className="flex items-center gap-6">
                <div>
                  <p className="text-2xl font-black" style={{ color: "var(--maestro-green)" }}>
                    {midiEvents.length}
                  </p>
                  <p className="text-xs text-muted-foreground font-semibold">Notes captured</p>
                </div>
                <div>
                  <p className="text-2xl font-black" style={{ color: "var(--maestro-blue)" }}>
                    {formatTime(elapsed)}
                  </p>
                  <p className="text-xs text-muted-foreground font-semibold">Duration</p>
                </div>
              </div>

              {/* MIDI event list */}
              <div className="mt-4 max-h-48 overflow-y-auto flex flex-col gap-1">
                {midiEvents.map((event, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs px-3 py-1.5 rounded-lg"
                    style={{
                      backgroundColor: i % 2 === 0 ? "transparent" : "var(--maestro-surface-hover)",
                    }}
                  >
                    <span className="font-bold text-foreground">{event.name}</span>
                    <span className="text-muted-foreground">
                      {event.time.toFixed(1)}s &middot; vel {event.velocity} &middot;{" "}
                      {event.duration.toFixed(2)}s
                    </span>
                  </div>
                ))}
              </div>

              {/* Generate Song CTA */}
              <div className="mt-4 flex justify-center">
                <PillowButton onClick={viewResults} size="lg">
                  <span className="flex items-center gap-2">
                    Generate Songs
                    <ArrowRight className="w-5 h-5" />
                  </span>
                </PillowButton>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </PageTransition>
  )
}

export default function PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-muted-foreground">Loading...</div>
        </div>
      }
    >
      <RecordingStudio />
    </Suspense>
  )
}
