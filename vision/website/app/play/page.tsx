"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Circle,
  Square,
  Loader2,
  Wifi,
  WifiOff,
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

function RecordingStudio() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const instrumentId = searchParams.get("instrument")

  const instrument = instruments.find((i) => i.id === instrumentId)

  // ----- Core state -----
  const [isRecording, setIsRecording] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [midiEvents, setMidiEvents] = useState<MidiEvent[]>([])

  // ----- Vision WebSocket state -----
  const [wsConnected, setWsConnected] = useState(false)
  const [frameSrc, setFrameSrc] = useState<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

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

  // ----- Send WS command -----
  const sendWsCommand = useCallback((action: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action }))
    }
  }, [])

  // ----- Recording controls -----
  const startRecording = useCallback(() => {
    setIsRecording(true)
    setElapsed(0)
    setMidiEvents([])
    sendWsCommand("start")
  }, [sendWsCommand])

  const stopRecording = useCallback(() => {
    sendWsCommand("stop")
    setIsRecording(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [sendWsCommand])

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
        totalSteps={2}
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
            Recording Studio
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

        {/* Recording indicator */}
        <AnimatePresence>
          {isRecording && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Connection status */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex items-center gap-2 text-xs"
        >
          {wsConnected ? (
            <>
              <Wifi className="w-3.5 h-3.5" style={{ color: "var(--maestro-green)" }} />
              <span className="text-muted-foreground font-medium">Vision server connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-muted-foreground font-medium">Disconnected</span>
            </>
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
