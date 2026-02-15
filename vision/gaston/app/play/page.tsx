"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Circle,
  Square,
  Pause,
  Play,
  Video,
  VideoOff,
  Music,
  Send,
  Loader2,
  Music2,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { ProgressHeader } from "@/components/maestro/progress-header"
import { PillowButton } from "@/components/maestro/pillow-button"
import { WaveformVisualizer } from "@/components/maestro/waveform-visualizer"
import { EncouragingPopup } from "@/components/maestro/encouraging-popup"
import { instruments, instructors } from "@/lib/mock-data"
import { getSong } from "@/lib/songs"
import type { Instrument } from "@/lib/types"

const PAUSE_GREETING =
  "You're paused. Want to change the song? Or ask me anything about what we're working on."

function RecordingStudio() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const instrumentId = searchParams.get("instrument")
  const songId = searchParams.get("song")
  const instructorId = searchParams.get("instructor")

  const instrument = instruments.find((i) => i.id === instrumentId)
  const song = getSong(songId)
  const instructor = instructorId ? instructors.find((i) => i.id === instructorId) : null

  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [cameraActive, setCameraActive] = useState(false)
  const [encouragement, setEncouragement] = useState<string | null>(null)
  const [mockScore, setMockScore] = useState(0)
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const encourageRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const duration = song?.duration || 120

  useEffect(() => {
    if (!instrument || !song || !instructor) {
      router.push("/select")
    }
  }, [instrument, song, instructor, router])

  // When pause panel opens, show instructor greeting once
  useEffect(() => {
    if (isPaused && chatMessages.length === 0) {
      setChatMessages([{ role: "assistant", content: PAUSE_GREETING }])
    }
  }, [isPaused, chatMessages.length])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages])

  const startRecording = useCallback(() => {
    setIsRecording(true)
    setIsPaused(false)
    setElapsed(0)
    setMockScore(0)
  }, [])

  const pauseRecording = useCallback(() => {
    setIsPaused(true)
  }, [])

  const resumeRecording = useCallback(() => {
    setIsPaused(false)
  }, [])

  const stopRecording = useCallback(() => {
    setIsRecording(false)
    setIsPaused(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (encourageRef.current) clearInterval(encourageRef.current)

    const params = new URLSearchParams({
      instrument: instrumentId || "",
      song: songId || "",
      duration: String(elapsed),
    })
    if (instructorId) params.set("instructor", instructorId)
    params.set("new", "1")
    router.push(`/results?${params.toString()}`)
  }, [instrumentId, songId, instructorId, elapsed, router])

  async function sendChat() {
    const text = chatInput.trim()
    if (!text || !instructor || chatLoading) return
    const newMessages: { role: "user" | "assistant"; content: string }[] = [
      ...chatMessages,
      { role: "user", content: text },
    ]
    const apiMessages = newMessages.filter(
      (m) => m.role === "user" || (m.role === "assistant" && m.content !== PAUSE_GREETING)
    )
    setChatInput("")
    setChatMessages(newMessages)
    setChatLoading(true)
    try {
      const res = await fetch("/api/instructor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instructorId: instructor.id,
          messages: apiMessages,
          context: {
            songTitle: song?.title,
            instrumentName: instrument?.name,
          },
        }),
      })
      const data = await res.json().catch(() => ({})) as { message?: string; error?: string }
      if (res.ok && data.message) {
        setChatMessages((prev) => [...prev, { role: "assistant", content: data.message }])
      } else {
        const errMsg = data.error || "I'm having trouble replying right now. Try again or continue your session."
        setChatMessages((prev) => [...prev, { role: "assistant", content: errMsg }])
      }
    } catch {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Try again in a moment." },
      ])
    } finally {
      setChatLoading(false)
    }
  }

  // Timer
  useEffect(() => {
    if (isRecording && !isPaused) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => {
          if (prev >= duration) {
            stopRecording()
            return prev
          }
          return prev + 1
        })
        setMockScore((prev) => Math.min(prev + Math.random() * 2, 100))
      }, 1000)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isRecording, isPaused, duration, stopRecording])

  // Live feedback from instructor (short messages while playing)
  useEffect(() => {
    if (isRecording && !isPaused && instructor?.liveMessageExamples?.length) {
      encourageRef.current = setInterval(() => {
        const msg =
          instructor.liveMessageExamples[
            Math.floor(Math.random() * instructor.liveMessageExamples.length)
          ]
        setEncouragement(msg)
        setTimeout(() => setEncouragement(null), 2000)
      }, 5000 + Math.random() * 5000)
    } else {
      if (encourageRef.current) clearInterval(encourageRef.current)
    }

    return () => {
      if (encourageRef.current) clearInterval(encourageRef.current)
    }
  }, [isRecording, isPaused, instructor])

  function formatTime(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, "0")}`
  }

  const progress = (elapsed / duration) * 100

  if (!instrument || !song || !instructor) return null

  return (
    <PageTransition className="min-h-screen bg-background flex flex-col">
      <ProgressHeader
        currentStep={2}
        totalSteps={3}
        onClose={() => router.push("/select")}
      />

      <div className="flex-1 flex flex-col items-center gap-6 max-w-3xl mx-auto w-full px-6 py-4">
        {/* Song info header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-2xl md:text-3xl font-black text-foreground">
            {song.title}
          </h1>
          <p className="text-muted-foreground mt-1">
            {song.artist} --{" "}
            <span style={{ color: instrument.color }} className="font-semibold">
              {instrument.name}
            </span>
          </p>
        </motion.div>

        {/* Camera / visualizer area */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="w-full aspect-video rounded-2xl overflow-hidden relative flex items-center justify-center"
          style={{ backgroundColor: "var(--maestro-surface)" }}
        >
          {cameraActive ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <Video
                  className="w-12 h-12"
                  style={{ color: instrument.color }}
                />
                <p className="text-sm text-muted-foreground">
                  Camera feed active
                </p>
                {isRecording && (
                  <motion.div
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: "var(--maestro-red)" }}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 p-8">
              <motion.div
                animate={
                  isRecording && !isPaused
                    ? {
                        scale: [1, 1.1, 1],
                        rotate: [0, 5, -5, 0],
                      }
                    : {}
                }
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Music
                  className="w-16 h-16"
                  style={{ color: instrument.color }}
                />
              </motion.div>
              <WaveformVisualizer
                isActive={isRecording && !isPaused}
                color={instrument.color}
                height={80}
                barCount={50}
              />
            </div>
          )}

          {/* Live score overlay */}
          {isRecording && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              className="absolute top-4 right-4 flex flex-col items-end gap-2"
            >
              <div className="px-3 py-1.5 rounded-xl bg-background/80 backdrop-blur-sm">
                <p className="text-xs text-muted-foreground">Accuracy</p>
                <p
                  className="text-lg font-bold"
                  style={{ color: "var(--maestro-green)" }}
                >
                  {Math.round(mockScore)}%
                </p>
              </div>
            </motion.div>
          )}

          {/* Camera toggle */}
          <button
            onClick={() => setCameraActive(!cameraActive)}
            className="absolute top-4 left-4 p-2 rounded-xl bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            aria-label={cameraActive ? "Turn off camera" : "Turn on camera"}
          >
            {cameraActive ? (
              <VideoOff className="w-5 h-5" />
            ) : (
              <Video className="w-5 h-5" />
            )}
          </button>
        </motion.div>

        {/* Progress bar */}
        <div className="w-full flex flex-col gap-2">
          <div className="h-3 bg-maestro-surface rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full relative shimmer"
              style={{ backgroundColor: instrument.color }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: "linear" }}
            />
          </div>
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{formatTime(elapsed)}</span>
            <span className="font-semibold text-foreground">
              {song.key} -- {song.bpm} BPM
            </span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

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
            <>
              <PillowButton
                onClick={isPaused ? resumeRecording : pauseRecording}
                size="md"
                color="var(--maestro-blue)"
                darkColor="#1490CC"
              >
                {isPaused ? (
                  <span className="flex items-center gap-2">
                    <Play className="w-5 h-5" />
                    Resume
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Pause className="w-5 h-5" />
                    Pause
                  </span>
                )}
              </PillowButton>

              <PillowButton
                onClick={stopRecording}
                size="md"
                color="var(--maestro-red)"
                darkColor="#CC3333"
              >
                <span className="flex items-center gap-2">
                  <Square className="w-4 h-4 fill-current" />
                  Stop
                </span>
              </PillowButton>
            </>
          )}
        </motion.div>

        {/* Recording indicator */}
        <AnimatePresence>
          {isRecording && !isPaused && (
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
              <span className="text-sm font-semibold" style={{ color: "var(--maestro-red)" }}>
                Recording...
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pause panel: instructor chat + change song */}
        <AnimatePresence>
          {isPaused && (
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full mt-4 rounded-2xl border border-border overflow-hidden"
              style={{ backgroundColor: "var(--maestro-surface)" }}
            >
              <div
                className="p-4 border-b border-border flex items-center justify-between"
                style={{ backgroundColor: `${instructor.color}18` }}
              >
                <span className="font-bold text-foreground" style={{ color: instructor.color }}>
                  {instructor.name}
                </span>
                <button
                  type="button"
                  onClick={() => router.push(`/select?instrument=${instrumentId || ""}&instructor=${instructorId || ""}`)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                  style={{
                    backgroundColor: `${instructor.color}30`,
                    color: instructor.color,
                  }}
                >
                  <Music2 className="w-4 h-4" />
                  Change song
                </button>
              </div>
              <div className="flex flex-col max-h-64">
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  {chatMessages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm"
                        style={
                          m.role === "user"
                            ? { backgroundColor: instructor.color, color: "#fff" }
                            : { backgroundColor: "var(--maestro-surface-hover)", color: "var(--foreground)" }
                        }
                      >
                        {m.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="rounded-2xl px-4 py-2.5 bg-maestro-surface-hover flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {instructor.name} is typing...
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="p-3 border-t border-border flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendChat()}
                    placeholder="Ask anything or type a message..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-maestro-green"
                  />
                  <button
                    type="button"
                    onClick={sendChat}
                    disabled={chatLoading || !chatInput.trim()}
                    className="p-2.5 rounded-xl font-semibold text-white disabled:opacity-50 flex items-center justify-center cursor-pointer"
                    style={{ backgroundColor: instructor.color }}
                  >
                    {chatLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <EncouragingPopup message={encouragement} />
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
