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

# ---------------------------------------------------------------------------
# Network
# ---------------------------------------------------------------------------
WS_PORT = 8765

# ---------------------------------------------------------------------------
# Note engine defaults
# ---------------------------------------------------------------------------
# Base MIDI note offsets per string (relative to octave root).
# 6 strings: C, D, E, F, G, A  →  semitone offsets from C
STRING_NOTE_OFFSETS_6 = [0, 2, 4, 5, 7, 9]
STRING_NOTE_OFFSETS_5 = [0, 2, 4, 7, 9]
STRING_NOTE_OFFSETS_4 = [0, 4, 7, 9]
STRING_NOTE_OFFSETS_3 = [0, 4, 7]

STRING_NOTE_OFFSETS = {
    3: STRING_NOTE_OFFSETS_3,
    4: STRING_NOTE_OFFSETS_4,
    5: STRING_NOTE_OFFSETS_5,
    6: STRING_NOTE_OFFSETS_6,
}

# Number of fret divisions on the phone fretboard
NUM_FRETS = 5

# Octave range mapped from hand distance
OCTAVE_MIN = 2
OCTAVE_MAX = 6

# MIDI velocity range
MIDI_VELOCITY_MIN = 40
MIDI_VELOCITY_MAX = 127

# Note duration range (seconds)
NOTE_DURATION_MIN = 0.2
NOTE_DURATION_MAX = 1.5

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
# FluidSynth
# ---------------------------------------------------------------------------
SOUNDFONT_PATH = str(Path(__file__).parent / "soundfont.sf2")
FLUIDSYNTH_GAIN = 0.8
INSTRUMENT_PROGRAM = 25  # GM program 25 = Acoustic Guitar (steel)
