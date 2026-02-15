"""
Configuration constants for the Vision air instrument system.
"""

from pathlib import Path

# ---------------------------------------------------------------------------
# MediaPipe model
# ---------------------------------------------------------------------------
MODEL_PATH = str(Path(__file__).parent / "hand_landmarker.task")

# ---------------------------------------------------------------------------
# Display modes
# ---------------------------------------------------------------------------
MODE_FULL = 0
MODE_LANDMARKS = 1
MODE_SKELETON = 2
MODE_NAMES = ["Full", "Landmarks", "Skeleton"]

# ---------------------------------------------------------------------------
# Colors (BGR)
# ---------------------------------------------------------------------------
COLOR_GREEN = (0, 255, 0)
COLOR_WHITE = (255, 255, 255)
COLOR_BLACK = (0, 0, 0)
COLOR_YELLOW = (0, 255, 255)
COLOR_RED = (0, 0, 255)
COLOR_CYAN = (255, 255, 0)

HAND_COLORS = [
    (0, 255, 0),    # Green
    (255, 165, 0),  # Orange
]

# ---------------------------------------------------------------------------
# Hand tracking
# ---------------------------------------------------------------------------
# Smoothing factor for exponential moving average (0 = no smoothing, 1 = frozen)
SMOOTH_ALPHA = 0.6

# Hand assignment — set to True to swap which hand strums vs frets
SWAP_HANDS = True

# Strum detection
STRUM_VELOCITY_THRESHOLD = 0.008  # Min perpendicular velocity to count as strum
STRUM_COOLDOWN_FRAMES = 4         # Ignore strums within this many frames of last

# Strum tracking landmark — index fingertip
STRUM_LANDMARK_INDEX = 8  # INDEX_FINGER_TIP

# Wrist landmark index
WRIST = 0

# Landmark used for pole position projection (MIDDLE_FINGER_MCP)
POLE_PROJECTION_LANDMARK = 9

# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------
WS_PORT = 8765

# ---------------------------------------------------------------------------
# Note engine defaults
# ---------------------------------------------------------------------------
# Standard guitar tuning — absolute MIDI note numbers for open strings.
# 6 strings low→high: E2=40, A2=45, D3=50, G3=55, B3=59, E4=64
STRING_BASE_MIDI_6 = [40, 45, 50, 55, 59, 64]
STRING_BASE_MIDI_5 = [40, 45, 50, 55, 59]
STRING_BASE_MIDI_4 = [40, 45, 50, 55]
STRING_BASE_MIDI_3 = [40, 45, 50]

STRING_BASE_MIDI = {
    3: STRING_BASE_MIDI_3,
    4: STRING_BASE_MIDI_4,
    5: STRING_BASE_MIDI_5,
    6: STRING_BASE_MIDI_6,
}

# Number of fret spaces on the phone (5 fret bars → 6 spaces → 0-5 semitones)
NUM_FRETS = 6

# How many semitones the full pole travel adds (like sliding up the neck).
# 14 semitones + 6 phone frets = 20 total — matches a real guitar neck.
POLE_SEMITONE_RANGE = 14

# MIDI velocity range (narrowed to reduce dynamic extremes)
MIDI_VELOCITY_MIN = 70
MIDI_VELOCITY_MAX = 110

# Note duration range (seconds, narrowed for consistency)
NOTE_DURATION_MIN = 1.5
NOTE_DURATION_MAX = 2.5

# Strum velocity range used for mapping (raw perpendicular crossing velocity)
STRUM_VEL_MAP_MIN = 0.02
STRUM_VEL_MAP_MAX = 0.15

# ---------------------------------------------------------------------------
# Pole detection (magenta tape)
# ---------------------------------------------------------------------------
import numpy as np  # noqa: E402 (import needed for array constants)

# HSV range for magenta/hot-pink tape (OpenCV H: 0-180, S/V: 0-255)
TAPE_HSV_LOWER = np.array([140, 80, 80])
TAPE_HSV_UPPER = np.array([175, 255, 255])

# Minimum contour area (pixels²) to count as a tape band
TAPE_MIN_AREA = 300

# Gaussian blur kernel size for the mask (must be odd)
TAPE_BLUR_KSIZE = 7

# Morphological open/close kernel size
TAPE_MORPH_KSIZE = 5

# Smoothing factor for pole endpoint EMA (0 = no smoothing, 1 = frozen)
POLE_SMOOTH_ALPHA = 0.6

# Flip pole endpoints (swap A and B).  Toggle if octave direction is inverted.
POLE_FLIP = False

# ---------------------------------------------------------------------------
# GX10 AI Coach (ASUS Ascent GX10 — dual-agent coaching server)
# ---------------------------------------------------------------------------
# Set GX10_URL env var to the machine's address, e.g. "http://192.168.1.50:8001"
import os  # noqa: E402
GX10_URL = os.environ.get("GX10_URL", "http://10.35.0.235:8001")

# How often the browser may request coaching feedback (seconds)
GX10_COACH_COOLDOWN = 5

# ---------------------------------------------------------------------------
# FluidSynth
# ---------------------------------------------------------------------------
SOUNDFONT_PATH = str(Path(__file__).parent / "soundfont.sf2")
FLUIDSYNTH_GAIN = 0.8
INSTRUMENT_PROGRAM = 27  # GM program 27 = Electric Guitar (clean)
