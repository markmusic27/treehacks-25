"""
Data classes for the Vision air instrument system.
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass, field


# ---------------------------------------------------------------------------
# 3D vector
# ---------------------------------------------------------------------------
@dataclass
class Vec3:
    """Simple 3D vector for landmark math."""

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def __add__(self, o: Vec3) -> Vec3:
        return Vec3(self.x + o.x, self.y + o.y, self.z + o.z)

    def __sub__(self, o: Vec3) -> Vec3:
        return Vec3(self.x - o.x, self.y - o.y, self.z - o.z)

    def __mul__(self, s: float) -> Vec3:
        return Vec3(self.x * s, self.y * s, self.z * s)

    def dot(self, o: Vec3) -> float:
        return self.x * o.x + self.y * o.y + self.z * o.z

    def cross(self, o: Vec3) -> Vec3:
        return Vec3(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )

    def length(self) -> float:
        return (self.x ** 2 + self.y ** 2 + self.z ** 2) ** 0.5

    def to_pixel(self, w: int, h: int) -> tuple[int, int]:
        return int(self.x * w), int(self.y * h)


# ---------------------------------------------------------------------------
# Fretboard / strum state
# ---------------------------------------------------------------------------
@dataclass
class StrumEvent:
    """Result of a detected strum."""

    direction: str  # "down" or "up"
    velocity: float  # raw perpendicular crossing velocity


@dataclass
class FretboardState:
    """Tracks the neck line and strum detection state."""

    # Smoothed wrist positions (normalized coords)
    left_wrist: Vec3 | None = None
    right_wrist: Vec3 | None = None

    # Strum detection
    prev_perp_dist: float = 0.0
    strum_cooldown: int = 0
    last_strum_direction: str = ""
    last_strum_time: float = 0.0
    strum_count: int = 0

    # History for velocity calculation
    perp_history: deque = field(default_factory=lambda: deque(maxlen=5))

    # Visual feedback
    strum_flash_frames: int = 0

    # Last played notes (for overlay display)
    last_notes: list[str] = field(default_factory=list)
    last_note_time: float = 0.0


# ---------------------------------------------------------------------------
# Pole state (physical broomstick with tape markers)
# ---------------------------------------------------------------------------
@dataclass
class PoleState:
    """Tracks the detected pole endpoints and hand position along the pole."""

    # Smoothed endpoint positions in pixel coordinates
    end_a: tuple[int, int] | None = None  # left endpoint
    end_b: tuple[int, int] | None = None  # right endpoint

    # Whether the pole was detected this frame
    detected: bool = False

    # Hand position along the pole: 0.0 = endpoint A, 1.0 = endpoint B
    position: float = 0.5


# ---------------------------------------------------------------------------
# Phone state
# ---------------------------------------------------------------------------
@dataclass
class PhoneTouch:
    """A single touch point from the phone fretboard."""

    id: int
    x: float  # 0–1 normalized
    y: float  # 0–1 normalized
    string: int = -1  # closest string index


@dataclass
class PhoneState:
    """Latest state received from the phone fretboard app."""

    connected: bool = False
    touches: list[PhoneTouch] = field(default_factory=list)
    accel_x: float = 0.0
    accel_y: float = 0.0
    accel_z: float = 0.0
    gyro_alpha: float = 0.0
    gyro_beta: float = 0.0
    gyro_gamma: float = 0.0
    last_update: float = 0.0
