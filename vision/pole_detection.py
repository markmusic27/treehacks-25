"""
Pole detection via colored tape markers.

Detects two bands of magenta tape at the endpoints of a physical pole
and computes where the fretting hand is positioned along it.

The fretting-hand position ``t ∈ [0, 1]`` replaces the old wrist-to-wrist
distance, giving a physically grounded pitch axis.
"""

from __future__ import annotations

import cv2
import numpy as np

from config import (
    TAPE_HSV_LOWER,
    TAPE_HSV_UPPER,
    TAPE_MIN_AREA,
    TAPE_BLUR_KSIZE,
    TAPE_MORPH_KSIZE,
    POLE_SMOOTH_ALPHA,
)
from models import PoleState, Vec3


# ---------------------------------------------------------------------------
# Core detection
# ---------------------------------------------------------------------------
def detect_pole_endpoints(
    frame: np.ndarray,
) -> tuple[tuple[int, int] | None, tuple[int, int] | None]:
    """
    Detect two magenta tape bands in *frame*.

    Returns two endpoint centroids in **pixel coordinates** sorted
    left-to-right, or ``(None, None)`` if detection fails.
    """
    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # Threshold for magenta
    mask = cv2.inRange(hsv, TAPE_HSV_LOWER, TAPE_HSV_UPPER)

    # Clean up noise
    mask = cv2.GaussianBlur(mask, (TAPE_BLUR_KSIZE, TAPE_BLUR_KSIZE), 0)
    kernel = np.ones((TAPE_MORPH_KSIZE, TAPE_MORPH_KSIZE), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

    # Find contours
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if len(contours) < 2:
        return None, None

    # Filter by area and keep the two largest
    valid = [
        (c, cv2.contourArea(c))
        for c in contours
        if cv2.contourArea(c) > TAPE_MIN_AREA
    ]
    if len(valid) < 2:
        return None, None

    valid.sort(key=lambda x: x[1], reverse=True)
    top_two = valid[:2]

    # Compute centroids
    centroids: list[tuple[int, int]] = []
    for contour, _ in top_two:
        M = cv2.moments(contour)
        if M["m00"] == 0:
            continue
        cx = int(M["m10"] / M["m00"])
        cy = int(M["m01"] / M["m00"])
        centroids.append((cx, cy))

    if len(centroids) < 2:
        return None, None

    # Sort left-to-right for consistent ordering
    centroids.sort(key=lambda p: p[0])
    return centroids[0], centroids[1]


# ---------------------------------------------------------------------------
# Smoothing
# ---------------------------------------------------------------------------
def _smooth_point(
    old: tuple[int, int] | None,
    new: tuple[int, int],
    alpha: float,
) -> tuple[int, int]:
    """Exponential moving average for a 2D pixel point."""
    if old is None:
        return new
    return (
        int(old[0] * alpha + new[0] * (1 - alpha)),
        int(old[1] * alpha + new[1] * (1 - alpha)),
    )


def update_pole_state(
    pole: PoleState,
    frame: np.ndarray,
) -> None:
    """
    Run pole detection on *frame* and update *pole* in-place.

    Smooths the endpoints with an EMA to reduce jitter.
    """
    raw_a, raw_b = detect_pole_endpoints(frame)

    if raw_a is not None and raw_b is not None:
        pole.end_a = _smooth_point(pole.end_a, raw_a, POLE_SMOOTH_ALPHA)
        pole.end_b = _smooth_point(pole.end_b, raw_b, POLE_SMOOTH_ALPHA)
        pole.detected = True
    else:
        # Keep the last known endpoints (don't reset on a single missed frame)
        # but mark as not actively detected
        if pole.end_a is None or pole.end_b is None:
            pole.detected = False


# ---------------------------------------------------------------------------
# Hand → pole projection
# ---------------------------------------------------------------------------
def compute_pole_position(
    wrist: Vec3,
    pole: PoleState,
    frame_w: int,
    frame_h: int,
) -> float:
    """
    Project the fretting wrist onto the pole line segment.

    Returns ``t ∈ [0, 1]`` where 0 = endpoint A (left) and 1 = endpoint B
    (right).  Returns 0.5 if the pole has not been detected.
    """
    if pole.end_a is None or pole.end_b is None:
        return 0.5

    # Wrist from normalised to pixel coords
    wx = wrist.x * frame_w
    wy = wrist.y * frame_h

    ax, ay = pole.end_a
    bx, by = pole.end_b

    # Vector AB
    abx = bx - ax
    aby = by - ay
    ab_len_sq = abx * abx + aby * aby

    if ab_len_sq < 1e-8:
        return 0.5

    # Vector AW
    awx = wx - ax
    awy = wy - ay

    # Scalar projection: t = dot(AW, AB) / |AB|²
    t = (awx * abx + awy * aby) / ab_len_sq
    return float(np.clip(t, 0.0, 1.0))
