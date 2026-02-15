"""
Air Guitar App — Unified orchestrator for the full play flow.

Flow:
  1. Pick a plucked string instrument
  2. Soundfont check (local or download)
  3. CV session (phone fretboard + air strum → MIDI recording)

Modules:
  session          — Session configuration and state
  instrument_setup — Instrument selection + soundfont management
  cv_session       — Computer vision recording session
  main             — Entry point and flow orchestrator
"""
