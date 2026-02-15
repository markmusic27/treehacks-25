"""
Air Guitar App — Unified orchestrator for the full play flow.

Two modes:
  - BEGINNER: Pick a song + instrument → MIDI generated → CV rhythm-only
  - HARD:     No MIDI reference → phone required → CV rhythm + melody

Modules:
  session          — Session configuration and state
  song_search      — Song search via Perplexity / YouTube
  instrument_setup — Instrument + soundfont management
  midi_prep        — MIDI generation from song covers
  cv_session       — Computer vision recording session
  main             — Entry point and flow orchestrator
"""
