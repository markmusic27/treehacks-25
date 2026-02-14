export interface Instrument {
  id: string
  name: string
  icon: string
  color: string
  description: string
  difficulty: "beginner" | "intermediate" | "advanced"
  origin: string
}

export interface Song {
  id: string
  title: string
  artist: string
  genre: string
  difficulty: "beginner" | "intermediate" | "advanced"
  duration: number // seconds
  bpm: number
  key: string
  coverUrl?: string
  /** Instrument IDs this song is most played with (for filtering by instrument). */
  instrumentIds?: string[]
}

export interface RemixStyle {
  id: string
  name: string
  color: string
  icon: string
}

/** Personalized guide/mascot for Juno/Suno-generated remixes and tutoring (e.g. Veena Vijay, Maestro Spirit). */
export interface Persona {
  id: string
  name: string
  shortDescription: string
  color: string
  emoji: string
  /** Optional image URL for animated character (PNG/SVG). Add more characters by extending this. */
  imageUrl?: string
}

/** Pick & Play instructor: distinct personality, guides the session and chats when paused (Claude). */
export interface Instructor {
  id: string
  name: string
  shortDescription: string
  color: string
  /** System prompt for Claude so the instructor acts in character during pause chat. */
  systemPrompt: string
  /** Short live feedback messages shown while the user is playing (content TBD per metric later). */
  liveMessageExamples: string[]
}

export interface Remix {
  id: string
  style: RemixStyle
  audioUrl: string
  coverGradient: [string, string]
  duration: number
  isGenerated: boolean
  /** Persona used to personalize this remix (Juno/Suno). */
  personaId?: string
}

export interface TechniqueFeeback {
  rating: number // 1-5
  summary: string
  tips: string[]
  strengths: string[]
}

export interface ArtistInfo {
  name: string
  bio: string
  genre: string
  famousSongs: string[]
  influence: string
}

export interface InstrumentInfo {
  name: string
  history: string
  origin: string
  famousPlayers: string[]
  culturalSignificance: string
}

export interface SongAnalysis {
  key: string
  tempo: number
  timeSignature: string
  chordProgression: string[]
  musicalElements: string[]
  moodDescription: string
}

export interface PerformanceResult {
  score: number // 0-100
  xpEarned: number
  stars: number // 1-5
  accuracy: number
  rhythm: number
  timing: number
  technique: TechniqueFeeback
  artistInfo: ArtistInfo
  instrumentInfo: InstrumentInfo
  songAnalysis: SongAnalysis
  remixes: Remix[]
}

export interface AppState {
  selectedInstrument: Instrument | null
  selectedSong: Song | null
  isRecording: boolean
  recordingDuration: number
  result: PerformanceResult | null
}
