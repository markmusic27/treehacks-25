"use client"

import { useState, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, ArrowRight, ExternalLink } from "lucide-react"
import { useRouter } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { ProgressHeader } from "@/components/maestro/progress-header"
import { PillowButton } from "@/components/maestro/pillow-button"
import { InstrumentCard } from "@/components/maestro/instrument-card"
import { instruments } from "@/lib/mock-data"
import type { Instrument } from "@/lib/types"

export default function SelectPage() {
  const router = useRouter()
  const [selectedInstrument, setSelectedInstrument] =
    useState<Instrument | null>(null)
  const [searchQuery, setSearchQuery] = useState("")

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
    })
    router.push(`/play?${params.toString()}`)
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
              Choose an instrument or search for a soundfont
            </motion.p>
          </div>

          {/* Search bar for soundfonts / instruments */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="relative"
          >
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search instruments, soundfonts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
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
                index={i}
              />
            ))}
          </div>

          {filteredInstruments.length === 0 && searchQuery.trim() && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-4 py-8"
            >
              <p className="text-center text-muted-foreground">
                No instruments found for &ldquo;{searchQuery}&rdquo;
              </p>
              <a
                href={`https://www.perplexity.ai/search?q=${encodeURIComponent(searchQuery + " soundfont .sf2 download")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <PillowButton size="md" color="var(--maestro-purple)" darkColor="#A866CC">
                  <span className="flex items-center gap-2">
                    Find &ldquo;{searchQuery}&rdquo; using Perplexity Sonar!
                    <ExternalLink className="w-4 h-4" />
                  </span>
                </PillowButton>
              </a>
            </motion.div>
          )}
        </motion.div>
      </div>

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
                <span style={{ color: selectedInstrument.color }} className="font-bold">
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
