"use client"

import { useState, useMemo, useCallback, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Search,
  ArrowRight,
  Loader2,
  X,
  Music,
  Globe,
  Users,
  Sparkles,
  Volume2,
  Box,
  Play,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { ProgressHeader } from "@/components/maestro/progress-header"
import { PillowButton } from "@/components/maestro/pillow-button"
import { InstrumentCard } from "@/components/maestro/instrument-card"
import { instruments } from "@/lib/mock-data"
import type { Instrument } from "@/lib/types"

// ---------- Perplexity discovery result type ----------

type DiscoveredInstrument = {
  instrument: {
    name: string
    description: string
    history: string
    origin: string
    family: string
    famousPlayers: string[]
    sound: string
  }
  gmProgram: number | null
  gmName: string | null
  sketchfabEmbed: string | null
}

// ---------- Page ----------

export default function SelectPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get("mode") || "tutor"
  const [selectedInstrument, setSelectedInstrument] =
    useState<Instrument | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Discovery popup state
  const [discovering, setDiscovering] = useState(false)
  const [discovered, setDiscovered] = useState<DiscoveredInstrument | null>(
    null
  )
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [showDiscovery, setShowDiscovery] = useState(false)

  // Track which built-in instrument triggered the overlay (for the Select CTA)
  const [overlayBuiltInInstrument, setOverlayBuiltInInstrument] = useState<Instrument | null>(null)

  // YouTube video results (fetched after discovery completes)
  type YTVideo = { videoId: string; title: string }
  const [ytVideos, setYtVideos] = useState<YTVideo[]>([])
  const [ytPlaying, setYtPlaying] = useState<string | null>(null)

  // Fetch YouTube videos when we have a discovered instrument
  useEffect(() => {
    if (!discovered) {
      setYtVideos([])
      setYtPlaying(null)
      return
    }
    const name = discovered.instrument.name
    const player = discovered.instrument.famousPlayers?.[0] ?? ""
    const q = `${name} ${player} performance solo`.trim()
    fetch(`/api/youtube?q=${encodeURIComponent(q)}&limit=3`)
      .then((r) => r.json())
      .then((data) => setYtVideos(data.results ?? []))
      .catch(() => setYtVideos([]))
  }, [discovered])

  const filteredInstruments = useMemo(() => {
    if (!searchQuery.trim()) return instruments
    const q = searchQuery.toLowerCase()
    return instruments.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.origin.toLowerCase().includes(q) ||
        i.description.toLowerCase().includes(q) ||
        i.difficulty.toLowerCase().includes(q)
    )
  }, [searchQuery])

  function handleInstrumentSelect(instrument: Instrument) {
    setSelectedInstrument(instrument)
  }

  function handleContinue() {
    if (!selectedInstrument) return
    const params = new URLSearchParams({
      instrument: selectedInstrument.id,
      mode,
    })
    router.push(`/play?${params.toString()}`)
  }

  // Open the full overlay for a built-in instrument (reuses the discovery popup)
  const handleViewInstrument = useCallback(async (inst: Instrument) => {
    setOverlayBuiltInInstrument(inst)
    setDiscovering(true)
    setDiscovered(null)
    setDiscoveryError(null)
    setShowDiscovery(true)

    try {
      const res = await fetch("/api/soundfont/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: inst.name }),
      })
      const data = await res.json()
      if (data.error) {
        setDiscoveryError(data.error)
      } else {
        setDiscovered(data as DiscoveredInstrument)
      }
    } catch {
      setDiscoveryError("Search failed — check your connection")
    } finally {
      setDiscovering(false)
    }
  }, [])

  // ---------- Perplexity discovery ----------

  const handleDiscover = useCallback(async () => {
    if (!searchQuery.trim()) return
    setDiscovering(true)
    setDiscovered(null)
    setDiscoveryError(null)
    setShowDiscovery(true)

    try {
      const res = await fetch("/api/soundfont/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQuery.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        setDiscoveryError(data.error)
      } else {
        setDiscovered(data as DiscoveredInstrument)
      }
    } catch {
      setDiscoveryError("Search failed — check your connection")
    } finally {
      setDiscovering(false)
    }
  }, [searchQuery])

  function handlePlayDiscovered() {
    if (!discovered) return
    // Create a custom instrument entry and navigate to /play
    // We pass the GM program info so the Python server can use it
    const customId = discovered.instrument.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
    const params = new URLSearchParams({
      instrument: customId,
      customName: discovered.instrument.name,
      gmProgram: String(discovered.gmProgram ?? 25),
      mode,
    })
    router.push(`/play?${params.toString()}`)
  }

  function closeDiscovery() {
    setShowDiscovery(false)
    setDiscovered(null)
    setDiscoveryError(null)
    setOverlayBuiltInInstrument(null)
    setYtPlaying(null)
  }

  return (
    <PageTransition className="min-h-screen bg-background flex flex-col">
      <ProgressHeader
        currentStep={1}
        totalSteps={2}
        onClose={() => router.push("/")}
      />

      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-6 pb-32">
        <motion.div
          key="instrument-select"
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
              Choose an instrument or search for any sound
            </motion.p>
          </div>

          {/* Search bar */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search instruments, soundfonts... try 'Oud', 'Erhu', 'Shamisen'"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  filteredInstruments.length === 0 &&
                  searchQuery.trim()
                ) {
                  handleDiscover()
                }
              }}
              className="w-full pl-12 pr-4 py-3 rounded-2xl bg-maestro-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-maestro-green"
            />
          </motion.div>

          {/* Instrument grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {filteredInstruments.map((instrument, i) => (
              <InstrumentCard
                key={instrument.id}
                instrument={instrument}
                isSelected={selectedInstrument?.id === instrument.id}
                onClick={() => handleInstrumentSelect(instrument)}
                onExplore={() => handleViewInstrument(instrument)}
                index={i}
              />
            ))}
          </div>

          {/* No results — discover with Perplexity */}
          {filteredInstruments.length === 0 && searchQuery.trim() && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4 py-8"
            >
              <p className="text-center text-muted-foreground">
                No built-in instruments for &ldquo;{searchQuery}&rdquo;
              </p>
              <PillowButton
                size="md"
                color="var(--maestro-purple)"
                darkColor="#A866CC"
                onClick={handleDiscover}
                disabled={discovering}
              >
                <span className="flex items-center gap-2">
                  {discovering ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Discover &ldquo;{searchQuery}&rdquo; with Perplexity
                      Sonar
                    </>
                  )}
                </span>
              </PillowButton>
            </motion.div>
          )}
        </motion.div>
      </div>

      {/* ========== Unified Discovery / Instrument Overlay ========== */}
      <AnimatePresence>
        {showDiscovery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={closeDiscovery}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-3xl border border-border bg-background shadow-2xl"
            >
              {/* Close button */}
              <button
                type="button"
                onClick={closeDiscovery}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-maestro-surface text-muted-foreground hover:text-foreground transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Loading state */}
              {discovering && (
                <div className="flex flex-col items-center gap-4 p-12">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  >
                    <Sparkles
                      className="w-10 h-10"
                      style={{ color: "var(--maestro-purple)" }}
                    />
                  </motion.div>
                  <p className="text-foreground font-semibold">
                    Searching with Perplexity Sonar...
                  </p>
                  <p className="text-sm text-muted-foreground text-center">
                    Finding info for &ldquo;
                    {overlayBuiltInInstrument?.name || searchQuery}&rdquo;
                  </p>
                </div>
              )}

              {/* Error state */}
              {!discovering && discoveryError && (
                <div className="flex flex-col items-center gap-4 p-12">
                  <p className="text-foreground font-semibold">
                    Search failed
                  </p>
                  <p className="text-sm text-muted-foreground text-center">
                    {discoveryError}
                  </p>
                  <PillowButton
                    size="sm"
                    onClick={handleDiscover}
                    color="var(--maestro-purple)"
                    darkColor="#A866CC"
                  >
                    Try again
                  </PillowButton>
                </div>
              )}

              {/* Discovery result */}
              {!discovering && discovered && (
                <div className="flex flex-col">
                  {/* Header with gradient accent */}
                  <div
                    className="p-6 pb-4 rounded-t-3xl"
                    style={{
                      background:
                        "linear-gradient(135deg, var(--maestro-purple) 0%, var(--maestro-blue) 100%)",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
                        <Music className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black text-white">
                          {discovered.instrument.name}
                        </h2>
                        <p className="text-white/80 text-sm font-medium">
                          {discovered.instrument.family} instrument
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 flex flex-col gap-5">
                    {/* 3D Model Viewer */}
                    {discovered.sketchfabEmbed && (
                      <div className="rounded-2xl overflow-hidden border border-border">
                        <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                          <iframe
                            title={`${discovered.instrument.name} 3D model`}
                            src={`https://sketchfab.com/models/${discovered.sketchfabEmbed}/embed?autostart=1&ui_theme=dark&ui_infos=0&ui_controls=1&ui_stop=0`}
                            allow="autoplay; fullscreen; xr-spatial-tracking"
                            allowFullScreen
                            className="absolute inset-0 w-full h-full"
                          />
                        </div>
                        <div className="px-3 py-2 flex items-center gap-2 bg-maestro-surface">
                          <Box
                            className="w-3.5 h-3.5 shrink-0"
                            style={{ color: "var(--maestro-purple)" }}
                          />
                          <p className="text-xs text-muted-foreground font-medium">
                            Interactive 3D model — drag to rotate, scroll to zoom
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    <p className="text-foreground leading-relaxed">
                      {discovered.instrument.description}
                    </p>

                    {/* History */}
                    {discovered.instrument.history && (
                      <div className="p-4 rounded-xl bg-maestro-surface border border-border">
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                          History
                        </p>
                        <p className="text-sm text-foreground leading-relaxed">
                          {discovered.instrument.history}
                        </p>
                      </div>
                    )}

                    {/* Sound description */}
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-maestro-surface">
                      <Volume2
                        className="w-5 h-5 mt-0.5 shrink-0"
                        style={{ color: "var(--maestro-purple)" }}
                      />
                      <p className="text-sm text-foreground">
                        {discovered.instrument.sound}
                      </p>
                    </div>

                    {/* Origin */}
                    <div className="flex items-center gap-3">
                      <Globe
                        className="w-5 h-5 shrink-0"
                        style={{ color: "var(--maestro-blue)" }}
                      />
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                          Origin
                        </p>
                        <p className="text-sm text-foreground font-medium">
                          {discovered.instrument.origin}
                        </p>
                      </div>
                    </div>

                    {/* Famous players */}
                    {discovered.instrument.famousPlayers.length > 0 && (
                      <div className="flex items-start gap-3">
                        <Users
                          className="w-5 h-5 mt-0.5 shrink-0"
                          style={{ color: "var(--maestro-gold)" }}
                        />
                        <div className="flex flex-wrap gap-2">
                          {discovered.instrument.famousPlayers.map(
                            (player, i) => (
                              <span
                                key={i}
                                className="text-xs px-2.5 py-1 rounded-full bg-maestro-surface text-foreground font-medium"
                              >
                                {player}
                              </span>
                            )
                          )}
                        </div>
                      </div>
                    )}

                    {/* Listen — real YouTube embeds */}
                    {ytVideos.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">
                          Listen
                        </p>
                        <div className="flex flex-col gap-2">
                          {ytVideos.map((vid) => (
                            <div
                              key={vid.videoId}
                              className="rounded-xl border border-border overflow-hidden bg-maestro-surface"
                            >
                              {ytPlaying === vid.videoId ? (
                                <div className="relative w-full aspect-video">
                                  <iframe
                                    src={`https://www.youtube.com/embed/${vid.videoId}?autoplay=1&rel=0&modestbranding=1`}
                                    title={vid.title}
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    className="absolute inset-0 w-full h-full"
                                  />
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setYtPlaying(vid.videoId)}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-maestro-surface-hover transition-colors cursor-pointer"
                                >
                                  <div
                                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                                    style={{
                                      backgroundColor: "rgba(255,0,0,0.1)",
                                    }}
                                  >
                                    <Play
                                      className="w-4 h-4 ml-0.5"
                                      style={{ color: "#FF0000" }}
                                    />
                                  </div>
                                  <p className="text-sm text-foreground font-medium line-clamp-2">
                                    {vid.title}
                                  </p>
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* CTA — Select for built-in, Play for custom */}
                    <div className="pt-2">
                      {overlayBuiltInInstrument ? (
                        <PillowButton
                          size="lg"
                          onClick={() => {
                            handleInstrumentSelect(overlayBuiltInInstrument)
                            closeDiscovery()
                          }}
                          fullWidth
                          color={overlayBuiltInInstrument.color}
                          darkColor={overlayBuiltInInstrument.color}
                        >
                          <span className="flex items-center justify-center gap-2">
                            Select {overlayBuiltInInstrument.name}
                            <ArrowRight className="w-5 h-5" />
                          </span>
                        </PillowButton>
                      ) : (
                        <PillowButton
                          size="lg"
                          onClick={handlePlayDiscovered}
                          fullWidth
                        >
                          <span className="flex items-center justify-center gap-2">
                            Play {discovered.instrument.name}
                            <ArrowRight className="w-5 h-5" />
                          </span>
                        </PillowButton>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fixed bottom CTA */}
      <AnimatePresence>
        {selectedInstrument && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur-lg border-t border-border z-40"
          >
            <div className="max-w-4xl mx-auto flex items-center justify-between">
              <p className="text-sm text-muted-foreground font-semibold">
                Selected:{" "}
                <span
                  style={{ color: selectedInstrument.color }}
                  className="font-bold"
                >
                  {selectedInstrument.name}
                </span>
              </p>
              <PillowButton onClick={handleContinue} size="md">
                <span className="flex items-center gap-2">
                  Start Recording
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
