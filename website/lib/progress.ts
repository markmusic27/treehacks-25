"use client"

const STORAGE_KEY = "maestro-progress"
const LAST_PRACTICED_KEY = "maestro-last-practiced"

export interface LastPracticedEntry {
  songId: string
  instrumentId: string
  practicedAt: string
}

export interface ProgressStats {
  totalXP: number
  sessionsCompleted: number
  lastVisitAt: string | null
  streakDays: number
}

const defaultStats: ProgressStats = {
  totalXP: 0,
  sessionsCompleted: 0,
  lastVisitAt: null,
  streakDays: 0,
}

function getStored(): ProgressStats {
  if (typeof window === "undefined") return defaultStats
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultStats
    const parsed = JSON.parse(raw) as Partial<ProgressStats>
    return { ...defaultStats, ...parsed }
  } catch {
    return defaultStats
  }
}

function setStored(stats: ProgressStats) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  } catch {}
}

/** Returns progress stats and whether this is a "welcome back" (returning user). */
export function getProgress(): ProgressStats & { isReturningUser: boolean } {
  const stats = getStored()
  const now = new Date().toISOString()
  const lastVisit = stats.lastVisitAt ? new Date(stats.lastVisitAt) : null
  const isReturningUser =
    lastVisit !== null &&
    (now.slice(0, 10) !== lastVisit.toISOString().slice(0, 10) ||
      stats.sessionsCompleted > 0)
  return { ...stats, isReturningUser }
}

/** Call when user completes a session (e.g. lands on results page). */
export function recordSession(
  xpEarned: number,
  songId?: string,
  instrumentId?: string
) {
  const stats = getStored()
  const now = new Date().toISOString()
  const today = now.slice(0, 10)
  const lastDay = stats.lastVisitAt
    ? stats.lastVisitAt.slice(0, 10)
    : null

  let streakDays = stats.streakDays
  if (lastDay === null) streakDays = 1
  else if (lastDay === today) {
    // same day, no streak change
  } else {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    if (lastDay === yesterdayStr) streakDays += 1
    else streakDays = 1
  }

  const next: ProgressStats = {
    totalXP: stats.totalXP + xpEarned,
    sessionsCompleted: stats.sessionsCompleted + 1,
    lastVisitAt: now,
    streakDays,
  }
  setStored(next)
  if (songId && instrumentId) addLastPracticed(songId, instrumentId)
  return next
}

const MAX_LAST_PRACTICED = 20

function getLastPracticedStored(): LastPracticedEntry[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(LAST_PRACTICED_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function setLastPracticedStored(entries: LastPracticedEntry[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(LAST_PRACTICED_KEY, JSON.stringify(entries))
  } catch {}
}

function addLastPracticed(songId: string, instrumentId: string) {
  const list = getLastPracticedStored()
  const now = new Date().toISOString()
  const filtered = list.filter(
    (e) => !(e.songId === songId && e.instrumentId === instrumentId)
  )
  setLastPracticedStored(
    [{ songId, instrumentId, practicedAt: now }, ...filtered].slice(
      0,
      MAX_LAST_PRACTICED
    )
  )
}

/** Last practiced songs (for AI Remixes page). Most recent first. */
export function getLastPracticed(): LastPracticedEntry[] {
  return getLastPracticedStored()
}

/** Update last visit time (e.g. on homepage load) so we can show "welcome back" next time. */
export function touchVisit() {
  const stats = getStored()
  setStored({ ...stats, lastVisitAt: new Date().toISOString() })
}
