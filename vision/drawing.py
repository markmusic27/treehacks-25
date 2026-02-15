"""
OpenCV drawing helpers for the Vision air instrument overlay.
"""

from __future__ import annotations

import time

import cv2
import numpy as np
from mediapipe.tasks.python.vision import (
    HandLandmarkerResult,
    HandLandmarksConnections,
)

from config import (
    COLOR_BLACK,
    COLOR_CYAN,
    COLOR_GREEN,
    COLOR_RED,
    COLOR_WHITE,
    COLOR_YELLOW,
    HAND_COLORS,
    WS_PORT,
)
from hand_tracking import get_strum_point, signed_perp_distance_3d
from models import FretboardState, PhoneState, PoleState


# ---------------------------------------------------------------------------
# Neck line & strum visuals
# ---------------------------------------------------------------------------
def draw_neck_line(
    image: np.ndarray,
    fretboard: FretboardState,
    strum_hand_landmarks: list | None,
) -> None:
    """Draw the neck axis line and strum detection visuals."""
    if fretboard.left_wrist is None or fretboard.right_wrist is None:
        return

    h, w, _ = image.shape
    lw = fretboard.left_wrist
    rw = fretboard.right_wrist

    lx, ly = lw.to_pixel(w, h)
    rx, ry = rw.to_pixel(w, h)

    # Depth-based thickness
    avg_z = (lw.z + rw.z) / 2
    thickness = int(np.clip(5 - avg_z * 15, 2, 10))

    # Neck line color (flashes white on strum)
    line_color = COLOR_YELLOW
    if fretboard.strum_flash_frames > 0:
        flash_intensity = fretboard.strum_flash_frames / 6.0
        line_color = (
            int(0 + 255 * flash_intensity),
            255,
            255,
        )
        fretboard.strum_flash_frames -= 1

    cv2.line(image, (lx, ly), (rx, ry), line_color, thickness, cv2.LINE_AA)

    # Wrist anchor dots
    cv2.circle(image, (lx, ly), 6, COLOR_YELLOW, -1, cv2.LINE_AA)
    cv2.circle(image, (rx, ry), 6, COLOR_YELLOW, -1, cv2.LINE_AA)

    # Depth label
    depth_text = f"Depth L:{lw.z:.3f} R:{rw.z:.3f}"
    cv2.putText(
        image, depth_text, (lx, ly - 15),
        cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_YELLOW, 1, cv2.LINE_AA,
    )

    # Strum zone: perpendicular band at the strum wrist
    dx, dy = rx - lx, ry - ly
    line_len = (dx ** 2 + dy ** 2) ** 0.5
    if line_len > 10:
        px, py = -dy / line_len, dx / line_len
        strum_zone_len = 40

        sz_x1 = int(rx + px * strum_zone_len)
        sz_y1 = int(ry + py * strum_zone_len)
        sz_x2 = int(rx - px * strum_zone_len)
        sz_y2 = int(ry - py * strum_zone_len)
        cv2.line(
            image, (sz_x1, sz_y1), (sz_x2, sz_y2),
            COLOR_CYAN, 2, cv2.LINE_AA,
        )

    # Strum point indicator
    if strum_hand_landmarks is not None:
        sp = get_strum_point(strum_hand_landmarks)
        cx, cy = sp.to_pixel(w, h)
        cv2.circle(image, (cx, cy), 5, COLOR_CYAN, -1, cv2.LINE_AA)

        perp_dist = signed_perp_distance_3d(sp, lw, rw)
        dist_color = COLOR_GREEN if perp_dist >= 0 else COLOR_RED
        cv2.circle(image, (cx, cy), 8, dist_color, 2, cv2.LINE_AA)


# ---------------------------------------------------------------------------
# Strum info panel
# ---------------------------------------------------------------------------
def draw_strum_panel(image: np.ndarray, fretboard: FretboardState) -> None:
    """Draw strum detection info panel."""
    h, w, _ = image.shape
    panel_x = w - 260
    panel_y = h - 100
    panel_w = 250
    panel_h = 90

    overlay = image.copy()
    cv2.rectangle(
        overlay, (panel_x, panel_y),
        (panel_x + panel_w, panel_y + panel_h), COLOR_BLACK, -1,
    )
    cv2.addWeighted(overlay, 0.6, image, 0.4, 0, image)

    cv2.putText(
        image, "Fretboard / Strum", (panel_x + 10, panel_y + 22),
        cv2.FONT_HERSHEY_SIMPLEX, 0.55, COLOR_YELLOW, 1, cv2.LINE_AA,
    )
    cv2.putText(
        image, f"Strums: {fretboard.strum_count}",
        (panel_x + 10, panel_y + 45),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_WHITE, 1, cv2.LINE_AA,
    )

    if fretboard.last_strum_direction:
        elapsed = time.time() - fretboard.last_strum_time
        if elapsed < 1.0:
            alpha = max(0, 1.0 - elapsed)
            color = (
                int(COLOR_CYAN[0] * alpha),
                int(COLOR_CYAN[1] * alpha),
                int(COLOR_CYAN[2] * alpha),
            )
            arrow = "v" if fretboard.last_strum_direction == "down" else "^"
            cv2.putText(
                image, f"Last: {arrow} {fretboard.last_strum_direction}",
                (panel_x + 10, panel_y + 70),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA,
            )

    if fretboard.perp_history:
        latest = fretboard.perp_history[-1]
        bar_center_x = panel_x + panel_w // 2
        bar_y = panel_y + 80
        bar_half_w = 80
        bar_val = int(np.clip(latest * 500, -bar_half_w, bar_half_w))

        cv2.line(
            image, (bar_center_x, bar_y), (bar_center_x, bar_y),
            COLOR_WHITE, 1,
        )
        bar_color = COLOR_GREEN if bar_val >= 0 else COLOR_RED
        cv2.line(
            image, (bar_center_x, bar_y),
            (bar_center_x + bar_val, bar_y),
            bar_color, 4, cv2.LINE_AA,
        )


# ---------------------------------------------------------------------------
# Phone connection panel
# ---------------------------------------------------------------------------
def draw_phone_panel(image: np.ndarray, phone: PhoneState) -> None:
    """Draw phone connection status and touch data overlay."""
    h, w, _ = image.shape
    panel_x = 10
    panel_y = h - 120
    panel_w = 300
    panel_h = 110

    overlay = image.copy()
    cv2.rectangle(
        overlay, (panel_x, panel_y),
        (panel_x + panel_w, panel_y + panel_h), COLOR_BLACK, -1,
    )
    cv2.addWeighted(overlay, 0.6, image, 0.4, 0, image)

    status_color = COLOR_GREEN if phone.connected else COLOR_RED
    status_text = (
        "Phone: Connected"
        if phone.connected
        else f"Phone: Waiting (ws://IP:{WS_PORT})"
    )
    cv2.putText(
        image, status_text, (panel_x + 10, panel_y + 22),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, status_color, 1, cv2.LINE_AA,
    )

    if phone.connected and phone.touches:
        cv2.putText(
            image, f"Touches: {len(phone.touches)}",
            (panel_x + 10, panel_y + 45),
            cv2.FONT_HERSHEY_SIMPLEX, 0.45, COLOR_WHITE, 1, cv2.LINE_AA,
        )
        for i, t in enumerate(phone.touches[:4]):
            cv2.putText(
                image,
                f"  T{t.id}: ({t.x:.2f}, {t.y:.2f})",
                (panel_x + 10, panel_y + 65 + i * 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, COLOR_CYAN, 1, cv2.LINE_AA,
            )
    elif phone.connected:
        cv2.putText(
            image, "No touches", (panel_x + 10, panel_y + 45),
            cv2.FONT_HERSHEY_SIMPLEX, 0.45, COLOR_WHITE, 1, cv2.LINE_AA,
        )


# ---------------------------------------------------------------------------
# Hand info panel
# ---------------------------------------------------------------------------
def draw_hand_info_panel(
    image: np.ndarray,
    result: HandLandmarkerResult,
) -> None:
    """Draw a translucent panel showing detected hand details."""
    if not result.hand_landmarks:
        return

    num_hands = len(result.hand_landmarks)
    panel_w = 280
    panel_h = 40 + num_hands * 60
    panel_x, panel_y = 10, 10

    overlay = image.copy()
    cv2.rectangle(
        overlay, (panel_x, panel_y),
        (panel_x + panel_w, panel_y + panel_h), COLOR_BLACK, -1,
    )
    cv2.addWeighted(overlay, 0.6, image, 0.4, 0, image)

    cv2.putText(
        image, "Detected Hands", (panel_x + 10, panel_y + 25),
        cv2.FONT_HERSHEY_SIMPLEX, 0.6, COLOR_WHITE, 1, cv2.LINE_AA,
    )

    for idx in range(num_hands):
        hand_landmarks = result.hand_landmarks[idx]
        handedness = result.handedness[idx]
        color = HAND_COLORS[idx % len(HAND_COLORS)]

        label = handedness[0].category_name
        score = handedness[0].score
        y_offset = panel_y + 55 + idx * 60

        cv2.putText(
            image, f"Hand {idx + 1}: {label} ({score:.0%})",
            (panel_x + 15, y_offset),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA,
        )

        wrist = hand_landmarks[0]
        cv2.putText(
            image,
            f"Wrist: ({wrist.x:.2f}, {wrist.y:.2f}, {wrist.z:.2f})",
            (panel_x + 15, y_offset + 20),
            cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_WHITE, 1, cv2.LINE_AA,
        )


# ---------------------------------------------------------------------------
# Fingertip labels
# ---------------------------------------------------------------------------
def draw_fingertip_labels(
    image: np.ndarray, hand_landmarks: list, hand_idx: int,
) -> None:
    """Draw labels at each fingertip."""
    h, w, _ = image.shape
    color = HAND_COLORS[hand_idx % len(HAND_COLORS)]
    fingertip_indices = [4, 8, 12, 16, 20]
    fingertip_names = ["Thumb", "Index", "Middle", "Ring", "Pinky"]

    for tip_idx, name in zip(fingertip_indices, fingertip_names):
        lm = hand_landmarks[tip_idx]
        cx, cy = int(lm.x * w), int(lm.y * h)
        text_size = cv2.getTextSize(name, cv2.FONT_HERSHEY_SIMPLEX, 0.4, 1)[0]
        cv2.rectangle(
            image, (cx - 2, cy - text_size[1] - 6),
            (cx + text_size[0] + 4, cy + 2), COLOR_BLACK, -1,
        )
        cv2.putText(
            image, name, (cx, cy - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA,
        )


# ---------------------------------------------------------------------------
# Skeleton-only mode
# ---------------------------------------------------------------------------
def draw_skeleton_only(
    image: np.ndarray, hand_landmarks: list, hand_idx: int,
) -> None:
    """Draw thin skeleton connections without landmark dots."""
    h, w, _ = image.shape
    color = HAND_COLORS[hand_idx % len(HAND_COLORS)]
    for connection in HandLandmarksConnections.HAND_CONNECTIONS:
        start = hand_landmarks[connection.start]
        end = hand_landmarks[connection.end]
        x1, y1 = int(start.x * w), int(start.y * h)
        x2, y2 = int(end.x * w), int(end.y * h)
        cv2.line(image, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)


# ---------------------------------------------------------------------------
# Note panel (shows last played notes)
# ---------------------------------------------------------------------------
def draw_note_panel(image: np.ndarray, fretboard: FretboardState) -> None:
    """Draw the last played note/chord on the overlay."""
    if not fretboard.last_notes:
        return

    elapsed = time.time() - fretboard.last_note_time
    if elapsed > 2.0:
        return  # fade out after 2 s

    h, w, _ = image.shape
    panel_x = w // 2 - 120
    panel_y = 10
    panel_w = 240
    panel_h = 30 + len(fretboard.last_notes) * 22

    alpha = max(0.0, min(1.0, 1.0 - elapsed / 2.0))

    overlay = image.copy()
    cv2.rectangle(
        overlay, (panel_x, panel_y),
        (panel_x + panel_w, panel_y + panel_h), COLOR_BLACK, -1,
    )
    cv2.addWeighted(overlay, 0.5 * alpha, image, 1.0 - 0.5 * alpha, 0, image)

    title_color = (
        int(COLOR_CYAN[0] * alpha),
        int(COLOR_CYAN[1] * alpha),
        int(COLOR_CYAN[2] * alpha),
    )
    cv2.putText(
        image, "Notes", (panel_x + 10, panel_y + 20),
        cv2.FONT_HERSHEY_SIMPLEX, 0.55, title_color, 1, cv2.LINE_AA,
    )

    for i, note_str in enumerate(fretboard.last_notes):
        note_color = (
            int(COLOR_WHITE[0] * alpha),
            int(COLOR_WHITE[1] * alpha),
            int(COLOR_WHITE[2] * alpha),
        )
        cv2.putText(
            image, note_str,
            (panel_x + 10, panel_y + 42 + i * 22),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, note_color, 1, cv2.LINE_AA,
        )


# ---------------------------------------------------------------------------
# Pole detection overlay
# ---------------------------------------------------------------------------
COLOR_MAGENTA = (255, 0, 255)  # BGR


def draw_pole_overlay(
    image: np.ndarray,
    pole: PoleState,
) -> None:
    """Draw the detected pole line, endpoints, and hand position indicator."""
    if pole.end_a is None or pole.end_b is None:
        # Show "Pole: not detected" status
        h, w, _ = image.shape
        cv2.putText(
            image, "Pole: NOT DETECTED", (w - 250, 90),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_RED, 1, cv2.LINE_AA,
        )
        return

    ax, ay = pole.end_a
    bx, by = pole.end_b

    # Draw the pole line
    cv2.line(image, (ax, ay), (bx, by), COLOR_MAGENTA, 3, cv2.LINE_AA)

    # Endpoint circles
    cv2.circle(image, (ax, ay), 10, COLOR_MAGENTA, -1, cv2.LINE_AA)
    cv2.circle(image, (bx, by), 10, COLOR_MAGENTA, -1, cv2.LINE_AA)

    # Endpoint labels
    cv2.putText(
        image, "A", (ax - 5, ay - 15),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_WHITE, 1, cv2.LINE_AA,
    )
    cv2.putText(
        image, "B", (bx - 5, by - 15),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_WHITE, 1, cv2.LINE_AA,
    )

    # Hand position marker along the pole
    t = pole.position
    hx = int(ax + t * (bx - ax))
    hy = int(ay + t * (by - ay))
    cv2.circle(image, (hx, hy), 8, COLOR_GREEN, -1, cv2.LINE_AA)
    cv2.circle(image, (hx, hy), 10, COLOR_WHITE, 2, cv2.LINE_AA)

    # Position label
    cv2.putText(
        image, f"t={t:.2f}", (hx + 14, hy + 5),
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, COLOR_GREEN, 1, cv2.LINE_AA,
    )

    # Status text
    h, w, _ = image.shape
    cv2.putText(
        image, f"Pole: OK  pos={t:.2f}", (w - 250, 90),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_MAGENTA, 1, cv2.LINE_AA,
    )
