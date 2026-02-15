"use client"

import { useState, useEffect, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Loader2, Music, Sparkles, Play, Download, ArrowRight } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { ProgressHeader } from "@/components/maestro/progress-header"
import { PillowButton } from "@/components/maestro/pillow-button"

type MidiEvent = {
  time: number
  midi_note: number
  velocity: number
  duration: number
  name: string
}

type Song = {
  id: string
  title: string
  prompt: string
  audio_url: string | null
  status: "generating" | "complete" | "failed"
}

type GenerationResponse = {
  success: boolean
  mp3_path: string
  description: string
  songs: Song[]
}

function GenerationStudio() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const instrumentId = searchParams.get("instrument") || "guitar"

  const [generating, setGenerating] = useState(false)
  const [generationComplete, setGenerationComplete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [description, setDescription] = useState<string>("")
  const [songs, setSongs] = useState<Song[]>([])
  const [selectedSong, setSelectedSong] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)

  // Load recording data from sessionStorage
  useEffect(() => {
    const raw = sessionStorage.getItem("maestro_recording")
    if (!raw) {
      router.push("/select")
      return
    }

    try {
      const recording = JSON.parse(raw) as {
        midiEvents: MidiEvent[]
        instrumentId: string
        elapsed: number
      }

      if (recording.midiEvents.length === 0) {
        setError("No MIDI events found in recording")
        return
      }

      // Start generation automatically
      generateSongs(recording.midiEvents, recording.instrumentId, recording.elapsed)
    } catch (err) {
      setError("Failed to load recording data")
    }
  }, [router])

  async function generateSongs(
    midiEvents: MidiEvent[],
    instrumentId: string,
    duration: number
  ) {
    setGenerating(true)
    setError(null)

    try {
      const response = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ midiEvents, instrumentId, duration }),
      })

      if (!response.ok) {
        throw new Error("Song generation failed")
      }

      const data = (await response.json()) as GenerationResponse
      setDescription(data.description)
      setSongs(data.songs)
      setGenerationComplete(true)

      // Poll for song completion
      pollSongStatus(data.songs)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      setGenerating(false)
    }
  }

  async function pollSongStatus(initialSongs: Song[]) {
    // TODO: Poll Suno API for song completion status
    // For now, simulate completion after 5 seconds
    setTimeout(() => {
      setSongs((prev) =>
        prev.map((song) => ({
          ...song,
          status: "complete",
          audio_url: `https://example.com/audio/${song.id}.mp3`, // Placeholder
        }))
      )
    }, 5000)
  }

  function handleSelectSong(songId: string) {
    setSelectedSong(songId)
  }

  function handleContinue() {
    if (!selectedSong) return
    const song = songs.find((s) => s.id === selectedSong)
    if (!song) return

    // Store selected song and navigate to results
    sessionStorage.setItem("maestro_selected_song", JSON.stringify(song))
    const params = new URLSearchParams({
      instrument: instrumentId,
      new: "1",
    })
    router.push(`/results?${params.toString()}`)
  }

  return (
    <PageTransition className="min-h-screen bg-background flex flex-col">
      <ProgressHeader
        currentStep={3}
        totalSteps={3}
        onClose={() => router.push("/select")}
      />

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 py-8 gap-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-3xl md:text-4xl font-black text-foreground">
            Generating Your Songs
          </h1>
          <p className="text-muted-foreground mt-2">
            Creating 4 unique variations from your performance
          </p>
        </motion.div>

        {/* Loading state with guitar animation */}
        {generating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-8 py-12"
          >
            {/* Animated guitar strings */}
            <div className="relative w-64 h-32">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <motion.div
                  key={i}
                  className="absolute w-full h-0.5 bg-gradient-to-r from-maestro-purple to-maestro-blue rounded-full"
                  style={{
                    top: `${i * 20 + 10}%`,
                    opacity: 0.6,
                  }}
                  animate={{
                    scaleY: [1, 1.5, 1],
                    opacity: [0.6, 1, 0.6],
                  }}
                  transition={{
                    duration: 0.8,
                    repeat: Infinity,
                    delay: i * 0.1,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </div>

            {/* Progress text */}
            <div className="text-center">
              <motion.p
                className="text-2xl font-black text-foreground"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                Creating your masterpiece...
              </motion.p>
              <motion.div
                className="mt-4 flex flex-col gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-maestro-green"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  Converting MIDI to audio...
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-maestro-blue"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.3 }}
                  />
                  Analyzing your performance...
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <motion.div
                    className="w-2 h-2 rounded-full bg-maestro-purple"
                    animate={{ scale: [1, 1.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity, delay: 0.6 }}
                  />
                  Generating 4 unique songs...
                </div>
              </motion.div>
            </div>

            {/* Loading bar */}
            <div className="w-full max-w-md">
              <div className="h-2 bg-maestro-surface rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-maestro-purple via-maestro-blue to-maestro-green"
                  initial={{ width: "0%" }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 15, ease: "easeInOut" }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Error state */}
        {error && !generating && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-6 rounded-2xl border border-red-500/20 bg-red-500/5"
          >
            <p className="text-red-500 font-semibold">Generation failed</p>
            <p className="text-sm text-muted-foreground mt-1">{error}</p>
            <PillowButton
              onClick={() => router.push("/select")}
              size="sm"
              className="mt-4"
            >
              Try Again
            </PillowButton>
          </motion.div>
        )}

        {/* Description */}
        {description && !generating && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-xl bg-maestro-surface border border-border"
          >
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
              Your Performance
            </p>
            <p className="text-foreground">{description}</p>
          </motion.div>
        )}

        {/* Generated songs */}
        {generationComplete && songs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col gap-4"
          >
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Pick your favorite (4 variations)
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {songs.map((song, index) => (
                <motion.button
                  key={song.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  onClick={() => handleSelectSong(song.id)}
                  className="relative p-5 rounded-2xl border-2 transition-all bg-maestro-surface hover:bg-maestro-surface-hover"
                  style={{
                    borderColor: selectedSong === song.id ? "var(--maestro-purple)" : "var(--border)",
                  }}
                >
                  {/* Status indicator */}
                  <div className="absolute top-3 right-3">
                    {song.status === "generating" && (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    )}
                    {song.status === "complete" && (
                      <div className="w-3 h-3 rounded-full bg-green-500" />
                    )}
                    {song.status === "failed" && (
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                    )}
                  </div>

                  {/* Song info */}
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-maestro-purple/20">
                      <Music className="w-6 h-6" style={{ color: "var(--maestro-purple)" }} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-bold text-foreground">{song.title}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {song.prompt}
                      </p>

                      {song.status === "complete" && song.audio_url && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setPlayingId(playingId === song.id ? null : song.id)
                          }}
                          className="mt-3 flex items-center gap-2 text-xs font-semibold"
                          style={{ color: "var(--maestro-purple)" }}
                        >
                          <Play className="w-3.5 h-3.5" />
                          {playingId === song.id ? "Pause" : "Preview"}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Selection checkmark */}
                  {selectedSong === song.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute top-3 left-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ backgroundColor: "var(--maestro-purple)", color: "#FFF" }}
                    >
                      ✓
                    </motion.div>
                  )}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Continue button */}
        {selectedSong && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border"
          >
            <div className="max-w-4xl mx-auto">
              <PillowButton onClick={handleContinue} size="lg" fullWidth>
                <span className="flex items-center justify-center gap-2">
                  Continue with Selected Song
                  <ArrowRight className="w-5 h-5" />
                </span>
              </PillowButton>
            </div>
          </motion.div>
        )}
      </div>
    </PageTransition>
  )
}

export default function GeneratePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <GenerationStudio />
    </Suspense>
  )
}
