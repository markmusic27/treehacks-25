"""
Hand tracking logic: landmark math, hand identification, and strum detection.
"""

from __future__ import annotations

import time

from mediapipe.tasks.python.vision import HandLandmarkerResult

from .config import (
    STRUM_COOLDOWN_FRAMES,
    STRUM_LANDMARK_INDEX,
    STRUM_VELOCITY_THRESHOLD,
    SWAP_HANDS,
    WRIST,
)
from .models import FretboardState, StrumEvent, Vec3


# ---------------------------------------------------------------------------
# Landmark helpers
# ---------------------------------------------------------------------------
def landmark_to_vec3(lm) -> Vec3:
    """Convert a MediaPipe landmark to Vec3."""
    return Vec3(lm.x, lm.y, lm.z)


def smooth_vec3(old: Vec3 | None, new: Vec3, alpha: float) -> Vec3:
    """Exponential moving average for Vec3."""
    if old is None:
        return new
    return Vec3(
        old.x * alpha + new.x * (1 - alpha),
        old.y * alpha + new.y * (1 - alpha),
        old.z * alpha + new.z * (1 - alpha),
    )


def get_strum_point(hand_landmarks: list) -> Vec3:
    """Get the strum tracking point (index fingertip)."""
    lm = hand_landmarks[STRUM_LANDMARK_INDEX]
    return Vec3(lm.x, lm.y, lm.z)


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------
def signed_perp_distance_3d(point: Vec3, line_start: Vec3, line_end: Vec3) -> float:
    """
    Signed perpendicular distance from *point* to the line through
    *line_start* → *line_end* in 3-D.

    The sign is determined by the cross product's z-component (screen-space):
    positive = "above" the line, negative = "below".
    """
    d = line_end - line_start
    v = point - line_start

    cross = d.cross(v)
    d_len = d.length()
    if d_len < 1e-8:
        return 0.0

    dist = cross.length() / d_len
    sign = d.x * v.y - d.y * v.x
    return dist if sign >= 0 else -dist


# ---------------------------------------------------------------------------
# Strum detection
# ---------------------------------------------------------------------------
def detect_strum(fretboard: FretboardState, perp_dist: float) -> StrumEvent | None:
    """
    Detect strum by tracking sign changes in perpendicular distance.

    Returns a ``StrumEvent`` with direction ("down" / "up") and raw crossing
    velocity, or ``None`` if no strum occurred.
    """
    fretboard.perp_history.append(perp_dist)

    if fretboard.strum_cooldown > 0:
        fretboard.strum_cooldown -= 1
        fretboard.prev_perp_dist = perp_dist
        return None

    if len(fretboard.perp_history) < 2:
        fretboard.prev_perp_dist = perp_dist
        return None

    prev = fretboard.prev_perp_dist
    if prev * perp_dist < 0:  # sign changed — crossed the neck line
        velocity = abs(perp_dist - prev)
        if velocity > STRUM_VELOCITY_THRESHOLD:
            direction = "down" if perp_dist > prev else "up"
            fretboard.strum_cooldown = STRUM_COOLDOWN_FRAMES
            fretboard.last_strum_direction = direction
            fretboard.last_strum_time = time.time()
            fretboard.strum_count += 1
            fretboard.strum_flash_frames = 18
            fretboard.prev_perp_dist = perp_dist
            return StrumEvent(direction=direction, velocity=velocity)

    fretboard.prev_perp_dist = perp_dist
    return None


# ---------------------------------------------------------------------------
# Hand identification
# ---------------------------------------------------------------------------
def identify_hands(
    result: HandLandmarkerResult,
) -> tuple[list | None, list | None]:
    """
    Identify fret (left) and strum (right) hands from the detection result.

    Returns ``(fret_hand_landmarks, strum_hand_landmarks)``.
    When ``SWAP_HANDS`` is True the MediaPipe labels are flipped so the
    correct physical hand maps to fret / strum.
    """
    left_lm = None
    right_lm = None

    for i, handedness in enumerate(result.handedness):
        label = handedness[0].category_name
        if SWAP_HANDS:
            label = "Right" if label == "Left" else "Left"
        if label == "Left":
            left_lm = result.hand_landmarks[i]
        elif label == "Right":
            right_lm = result.hand_landmarks[i]

    return left_lm, right_lm
