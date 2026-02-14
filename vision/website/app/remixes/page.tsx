"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { ChevronLeft, Sparkles, Music } from "lucide-react"
import Link from "next/link"
import { PageTransition } from "@/components/maestro/page-transition"
import { PillowButton } from "@/components/maestro/pillow-button"
import { RemixCard } from "@/components/maestro/remix-card"
import { TalkingMascot } from "@/components/maestro/talking-mascot"
import { getLastPracticed } from "@/lib/progress"
import { songs, instruments, personas, remixStyles, generateMockRemixes } from "@/lib/mock-data"
import type { Remix } from "@/lib/types"

const djPersona = personas.find((p) => p.id === "dj-remix") ?? null

export default function RemixesPage() {
  const [lastPracticed, setLastPracticed] = useState<ReturnType<typeof getLastPracticed>>([])
  const [selectedEntry, setSelectedEntry] = useState<{
    songId: string
    instrumentId: string
  } | null>(null)
  const [remixes, setRemixes] = useState<Remix[]>([])
  const [generating, setGenerating] = useState(false)
  const [playingRemixId, setPlayingRemixId] = useState<string | null>(null)

  useEffect(() => {
    setLastPracticed(getLastPracticed())
  }, [])

  const selectedSong = selectedEntry
    ? songs.find((s) => s.id === selectedEntry.songId)
    : null
  const selectedInstrument = selectedEntry
    ? instruments.find((i) => i.id === selectedEntry.instrumentId)
    : null

  async function handleGenerateRemixes() {
    if (!selectedEntry) return
    setGenerating(true)
    await new Promise((r) => setTimeout(r, 1500))
    setRemixes(generateMockRemixes(djPersona?.id))
    setGenerating(false)
  }

  function clearSelection() {
    setSelectedEntry(null)
    setRemixes([])
  }

  return (
    <PageTransition className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto w-full px-6 py-8 flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-maestro-surface transition-colors"
            aria-label="Back to home"
          >
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <div className="flex items-center gap-3 flex-1">
            <TalkingMascot persona={djPersona} size="md" />
            <div>
              <h1 className="text-2xl font-black text-foreground">
                AI Remixes
              </h1>
              <p className="text-sm text-muted-foreground">
                Pick a song you practiced — create Juno remixes
              </p>
            </div>
          </div>
        </div>

        {!selectedEntry ? (
          <>
            <section>
              <h2 className="text-lg font-bold text-foreground mb-3">
                Last songs you practiced
              </h2>
              {lastPracticed.length === 0 ? (
                <div className="py-12 rounded-2xl bg-maestro-surface border border-border text-center">
                  <Music className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-muted-foreground font-medium">
                    No practice history yet
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Play a song from Pick & Play to see it here
                  </p>
                  <Link href="/select">
                    <PillowButton size="sm" className="mt-4">
                      Pick & Play
                    </PillowButton>
                  </Link>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {lastPracticed.map((entry, i) => {
                    const song = songs.find((s) => s.id === entry.songId)
                    const instrument = instruments.find(
                      (ins) => ins.id === entry.instrumentId
                    )
                    if (!song) return null
                    return (
                      <motion.li
                        key={`${entry.songId}-${entry.instrumentId}-${entry.practicedAt}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedEntry({
                              songId: entry.songId,
                              instrumentId: entry.instrumentId,
                            })
                          }
                          className="w-full flex items-center gap-4 p-4 rounded-2xl bg-maestro-surface hover:bg-maestro-surface-hover border border-border text-left transition-colors cursor-pointer"
                        >
                          <div
                            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: `${instrument?.color ?? "var(--maestro-purple)"}25`,
                            }}
                          >
                            <Music
                              className="w-5 h-5"
                              style={{
                                color: instrument?.color ?? "var(--maestro-purple)",
                              }}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-foreground truncate">
                              {song.title}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {song.artist}
                              {instrument && ` · ${instrument.name}`}
                            </p>
                          </div>
                          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-maestro-purple/20 text-maestro-purple">
                            Create remixes
                          </span>
                        </button>
                      </motion.li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center justify-between flex-wrap gap-4"
            >
              <div>
                <p className="text-sm text-muted-foreground">Selected</p>
                <p className="font-bold text-foreground">
                  {selectedSong?.title} — {selectedSong?.artist}
                </p>
                {selectedInstrument && (
                  <p
                    className="text-sm font-medium"
                    style={{ color: selectedInstrument.color }}
                  >
                    {selectedInstrument.name}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={clearSelection}
                className="text-sm text-muted-foreground hover:text-foreground font-medium"
              >
                Change song
              </button>
            </motion.div>

            {remixes.length === 0 ? (
              <div className="py-10 rounded-2xl bg-maestro-surface border border-border flex flex-col items-center gap-4">
                <p className="text-foreground font-medium">
                  Generate AI remixes with Juno
                </p>
                <p className="text-sm text-muted-foreground text-center max-w-sm">
                  Styles: {remixStyles.map((s) => s.name).join(", ")}
                </p>
                <PillowButton
                  size="lg"
                  color="var(--maestro-purple)"
                  darkColor="#A866CC"
                  onClick={handleGenerateRemixes}
                  disabled={generating}
                >
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5" />
                    {generating ? "Generating…" : "Generate with Juno"}
                  </span>
                </PillowButton>
              </div>
            ) : (
              <section className="flex flex-col gap-4">
                <h2 className="text-lg font-bold text-foreground">
                  Your Juno remixes
                </h2>
                <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6">
                  {remixes.map((remix, i) => (
                    <RemixCard
                      key={remix.id}
                      remix={remix}
                      persona={djPersona}
                      isPlaying={playingRemixId === remix.id}
                      onTogglePlay={() =>
                        setPlayingRemixId(
                          playingRemixId === remix.id ? null : remix.id
                        )
                      }
                      index={i}
                    />
                  ))}
                </div>
                <PillowButton
                  size="sm"
                  color="var(--maestro-purple)"
                  darkColor="#A866CC"
                  onClick={handleGenerateRemixes}
                  disabled={generating}
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" />
                    Generate more styles
                  </span>
                </PillowButton>
              </section>
            )}
          </>
        )}
      </div>
    </PageTransition>
  )
}
