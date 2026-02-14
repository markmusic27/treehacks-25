"use client"

import { useState, useMemo, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, ArrowRight, Loader2, Globe } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { ProgressHeader } from "@/components/maestro/progress-header"
import { PillowButton } from "@/components/maestro/pillow-button"
import { InstrumentCard } from "@/components/maestro/instrument-card"
import { SongCard } from "@/components/maestro/song-card"
import { instruments, songs, instructors } from "@/lib/mock-data"
import { setCustomSong, songFromSearchResult } from "@/lib/songs"
import type { Instrument, Song, Instructor } from "@/lib/types"

type SearchResult = { id: string; title: string; artist: string; duration: number }

export default function SelectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [selectedInstrument, setSelectedInstrument] =
    useState<Instrument | null>(null)
  const [selectedSong, setSelectedSong] = useState<Song | null>(null)
  const [selectedInstructor, setSelectedInstructor] = useState<Instructor | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Pre-fill from URL (e.g. "Change song" from play page)
  useEffect(() => {
    const instrumentId = searchParams.get("instrument")
    const instructorId = searchParams.get("instructor")
    if (instrumentId) {
      const inst = instruments.find((i) => i.id === instrumentId)
      if (inst) setSelectedInstrument(inst)
    }
    if (instructorId) {
      const instr = instructors.find((i) => i.id === instructorId)
      if (instr) setSelectedInstructor(instr)
    }
    if (instrumentId) setStep(2)
  }, [searchParams])
  const [showAllSongs, setShowAllSongs] = useState(false)
  const [externalQuery, setExternalQuery] = useState("")
  const [externalResults, setExternalResults] = useState<SearchResult[]>([])
  const [externalLoading, setExternalLoading] = useState(false)
  const [externalError, setExternalError] = useState<string | null>(null)

  const filteredSongs = useMemo(() => {
    let list = songs
    if (selectedInstrument && !showAllSongs) {
      list = list.filter(
        (s) =>
          !s.instrumentIds?.length ||
          s.instrumentIds.includes(selectedInstrument.id)
      )
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q) ||
          s.genre.toLowerCase().includes(q)
      )
    }
    return list
  }, [searchQuery, selectedInstrument, showAllSongs])

  function handleInstrumentSelect(instrument: Instrument) {
    setSelectedInstrument(instrument)
  }

  function handleSongSelect(song: Song) {
    setSelectedSong(song)
  }

  async function runExternalSearch() {
    const q = externalQuery.trim()
    if (q.length < 2) return
    setExternalError(null)
    setExternalLoading(true)
    setExternalResults([])
    try {
      const res = await fetch(`/api/songs/search?q=${encodeURIComponent(q)}&limit=25`)
      const data = await res.json()
      if (!res.ok) {
        setExternalError(data.error || "Search failed")
        return
      }
      setExternalResults(data.results ?? [])
    } catch {
      setExternalError("Search failed")
    } finally {
      setExternalLoading(false)
    }
  }

  function handlePickExternalResult(r: SearchResult) {
    const song: Song = songFromSearchResult(`mb-${r.id}`, r.title, r.artist, r.duration)
    setCustomSong(song)
    setSelectedSong(song)
    setExternalResults([])
    setExternalQuery("")
  }

  function handleContinue() {
    if (step === 1 && selectedInstrument) {
      setStep(2)
    } else if (step === 2 && selectedSong && selectedInstrument) {
      setStep(3)
    } else if (step === 3 && selectedInstrument && selectedSong && selectedInstructor) {
      const params = new URLSearchParams({
        instrument: selectedInstrument.id,
        song: selectedSong.id,
        instructor: selectedInstructor.id,
      })
      router.push(`/play?${params.toString()}`)
    }
  }

  return (
    <PageTransition className="min-h-screen bg-background flex flex-col">
      <ProgressHeader
        currentStep={step}
        totalSteps={3}
        onClose={() => router.push("/")}
      />

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 pb-32">
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex flex-col gap-8"
            >
              <div className="text-center">
                <motion.h1
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-3xl md:text-4xl font-black text-foreground"
                >
                  Pick your instrument
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-muted-foreground mt-2"
                >
                  What will you be playing today?
                </motion.p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {instruments.slice(0, 8).map((instrument, i) => (
                  <InstrumentCard
                    key={instrument.id}
                    instrument={instrument}
                    isSelected={selectedInstrument?.id === instrument.id}
                    onClick={() => handleInstrumentSelect(instrument)}
                    index={i}
                  />
                ))}
              </div>
            </motion.div>
          ) : step === 2 ? (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex flex-col gap-6"
            >
              <div className="text-center">
                <motion.h1
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-3xl md:text-4xl font-black text-foreground"
                >
                  Choose a song
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-muted-foreground mt-2"
                >
                  Playing{" "}
                  <span
                    className="font-bold"
                    style={{ color: selectedInstrument?.color }}
                  >
                    {selectedInstrument?.name}
                  </span>{" "}
                  -- now pick your song
                </motion.p>
              </div>

              {/* Search */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="relative"
              >
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search songs, artists, genres..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 rounded-2xl bg-maestro-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-maestro-green"
                />
              </motion.div>

              {/* Show all songs vs for this instrument */}
              {selectedInstrument && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.18 }}
                  className="flex items-center gap-2 flex-wrap"
                >
                  <span className="text-sm text-muted-foreground">Songs:</span>
                  <button
                    type="button"
                    onClick={() => setShowAllSongs(false)}
                    className="px-3 py-1.5 rounded-full text-sm font-semibold transition-colors cursor-pointer"
                    style={{
                      backgroundColor: !showAllSongs ? "var(--maestro-green)" : "var(--maestro-surface)",
                      color: !showAllSongs ? "#FFFFFF" : "var(--muted-foreground)",
                    }}
                  >
                    For {selectedInstrument.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAllSongs(true)}
                    className="px-3 py-1.5 rounded-full text-sm font-semibold transition-colors cursor-pointer"
                    style={{
                      backgroundColor: showAllSongs ? "var(--maestro-blue)" : "var(--maestro-surface)",
                      color: showAllSongs ? "#FFFFFF" : "var(--muted-foreground)",
                    }}
                  >
                    All songs
                  </button>
                </motion.div>
              )}

              {/* Genre filter chips */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex gap-2 flex-wrap"
              >
                {["All", "Classical", "Jazz", "Pop", "Rock"].map((genre) => (
                  <button
                    key={genre}
                    onClick={() =>
                      setSearchQuery(genre === "All" ? "" : genre)
                    }
                    className="px-4 py-1.5 rounded-full text-sm font-semibold transition-colors cursor-pointer"
                    style={{
                      backgroundColor:
                        (genre === "All" && !searchQuery) ||
                        searchQuery.toLowerCase() === genre.toLowerCase()
                          ? "var(--maestro-green)"
                          : "var(--maestro-surface)",
                      color:
                        (genre === "All" && !searchQuery) ||
                        searchQuery.toLowerCase() === genre.toLowerCase()
                          ? "#FFFFFF"
                          : "var(--muted-foreground)",
                    }}
                  >
                    {genre}
                  </button>
                ))}
              </motion.div>

              {/* Song list */}
              <div className="flex flex-col gap-2">
                {filteredSongs.map((song, i) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    isSelected={selectedSong?.id === song.id}
                    onClick={() => handleSongSelect(song)}
                    index={i}
                  />
                ))}
                {filteredSongs.length === 0 && !externalQuery && (
                  <p className="text-center text-muted-foreground py-8">
                    No songs found. Try a different search or search millions more below.
                  </p>
                )}
              </div>

              {/* Search millions more (MusicBrainz) */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25 }}
                className="rounded-2xl bg-maestro-surface/80 border border-border p-4 flex flex-col gap-3"
              >
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Globe className="w-5 h-5" />
                  <span className="text-sm font-semibold text-foreground">
                    Search millions more songs (free MusicBrainz database)
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Bohemian Rhapsody, Taylor Swift..."
                    value={externalQuery}
                    onChange={(e) => {
                      setExternalQuery(e.target.value)
                      setExternalError(null)
                    }}
                    onKeyDown={(e) => e.key === "Enter" && runExternalSearch()}
                    className="flex-1 pl-4 pr-4 py-2.5 rounded-xl bg-background border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-maestro-green"
                  />
                  <button
                    type="button"
                    onClick={runExternalSearch}
                    disabled={externalLoading || externalQuery.trim().length < 2}
                    className="px-4 py-2.5 rounded-xl bg-maestro-green text-white font-semibold disabled:opacity-50 flex items-center gap-2"
                  >
                    {externalLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                    Search
                  </button>
                </div>
                {externalError && (
                  <p className="text-sm text-amber-600 dark:text-amber-400">{externalError}</p>
                )}
                {externalResults.length > 0 && (
                  <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                    <p className="text-xs text-muted-foreground">
                      Click a song to pick it for this session:
                    </p>
                    {externalResults.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => handlePickExternalResult(r)}
                        className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-background hover:bg-maestro-surface-hover border border-border text-left transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground truncate">{r.title}</p>
                          <p className="text-sm text-muted-foreground truncate">{r.artist}</p>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {Math.floor(r.duration / 60)}:{String(r.duration % 60).padStart(2, "0")}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            </motion.div>
          ) : (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex flex-col gap-6"
            >
              <div className="text-center">
                <motion.h1
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-3xl md:text-4xl font-black text-foreground"
                >
                  Choose your instructor
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-muted-foreground mt-2"
                >
                  They’ll guide you live and chat when you pause
                </motion.p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {instructors.map((instructor, i) => (
                  <motion.button
                    key={instructor.id}
                    type="button"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => setSelectedInstructor(instructor)}
                    className={`flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all cursor-pointer text-left ${
                      selectedInstructor?.id === instructor.id
                        ? "border-foreground bg-maestro-surface"
                        : "border-border bg-transparent hover:border-muted-foreground/50"
                    }`}
                  >
                    <span
                      className="text-2xl w-12 h-12 flex items-center justify-center rounded-full shrink-0"
                      style={{ backgroundColor: `${instructor.color}30`, color: instructor.color }}
                    >
                      <span className="font-black text-lg">
                        {instructor.name.charAt(0)}
                      </span>
                    </span>
                    <span className="font-bold text-sm text-foreground text-center leading-tight">
                      {instructor.name}
                    </span>
                    <span className="text-xs text-muted-foreground text-center">
                      {instructor.shortDescription}
                    </span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fixed bottom CTA */}
      <AnimatePresence>
        {((step === 1 && selectedInstrument) ||
          (step === 2 && selectedSong) ||
          (step === 3 && selectedInstructor)) && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border z-40"
          >
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              {step === 2 && (
                <button
                  onClick={() => {
                    setStep(1)
                    setSelectedSong(null)
                  }}
                  className="text-muted-foreground hover:text-foreground font-semibold transition-colors cursor-pointer"
                >
                  Back
                </button>
              )}
              {step === 3 && (
                <button
                  onClick={() => {
                    setStep(2)
                    setSelectedInstructor(null)
                  }}
                  className="text-muted-foreground hover:text-foreground font-semibold transition-colors cursor-pointer"
                >
                  Back
                </button>
              )}
              <div className="flex-1" />
              <PillowButton onClick={handleContinue} size="md">
                <span className="flex items-center gap-2">
                  {step === 1 || step === 2 ? "Continue" : "Start Recording"}
                  <ArrowRight className="w-5 h-5" />
                </span>
              </PillowButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
