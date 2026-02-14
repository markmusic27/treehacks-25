"""
MediaPipe Hand Landmark Detection + Fretboard

Real-time hand landmark detection with neck line projection and strum detection.
- The neck axis is the line between the two wrists.
- Strum is detected when the strum hand's fingertip crosses the neck axis.
- Depth (z) is used for 3D perpendicular distance calculation.
- Phone fretboard connects via WebSocket for multi-touch string data.

Controls:
  - ESC or 'q': Quit
  - 'f': Toggle FPS display
  - 'm': Cycle through detection modes (full / landmarks only / skeleton only)
  - Set SWAP_HANDS constant to flip which hand strums vs frets
"""

import asyncio
import json
import time
import threading
from collections import deque
from dataclasses import dataclass, field
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import websockets
from websockets.asyncio.server import serve as ws_serve

# MediaPipe task-based imports
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.vision import (
    HandLandmarker,
    HandLandmarkerOptions,
    HandLandmarkerResult,
    HandLandmarksConnections,
    RunningMode,
    drawing_utils,
    drawing_styles,
)
from mediapipe.tasks.python import BaseOptions

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
MODEL_PATH = str(Path(__file__).parent / "hand_landmarker.task")

MODE_FULL = 0
MODE_LANDMARKS = 1
MODE_SKELETON = 2
MODE_NAMES = ["Full", "Landmarks", "Skeleton"]

# Colors (BGR)
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

# Smoothing factor for exponential moving average (0 = no smoothing, 1 = frozen)
SMOOTH_ALPHA = 0.6

# Hand assignment — set to True to swap which hand strums vs frets
SWAP_HANDS = True

# Strum detection
STRUM_VELOCITY_THRESHOLD = 0.02   # Min perpendicular velocity to count as strum
STRUM_COOLDOWN_FRAMES = 8         # Ignore strums within this many frames of last

# Strum tracking landmark — index fingertip only for more reliable detection
STRUM_LANDMARK_INDEX = 8  # INDEX_FINGER_TIP

# Wrist landmark index
WRIST = 0

# Network
WS_PORT = 8765
HTTP_PORT = 8766

# Path to built fretboard app (Next.js static export)
FRETBOARD_DIST = Path(__file__).parent / "fretboard" / "out"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------
@dataclass
class Vec3:
    """Simple 3D vector for landmark math."""
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0

    def __add__(self, o: "Vec3") -> "Vec3":
        return Vec3(self.x + o.x, self.y + o.y, self.z + o.z)

    def __sub__(self, o: "Vec3") -> "Vec3":
        return Vec3(self.x - o.x, self.y - o.y, self.z - o.z)

    def __mul__(self, s: float) -> "Vec3":
        return Vec3(self.x * s, self.y * s, self.z * s)

    def dot(self, o: "Vec3") -> float:
        return self.x * o.x + self.y * o.y + self.z * o.z

    def cross(self, o: "Vec3") -> "Vec3":
        return Vec3(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )

    def length(self) -> float:
        return (self.x ** 2 + self.y ** 2 + self.z ** 2) ** 0.5

    def to_pixel(self, w: int, h: int) -> tuple[int, int]:
        return int(self.x * w), int(self.y * h)


@dataclass
class FretboardState:
    """Tracks the neck line and strum detection state."""
    # Smoothed wrist positions (normalized coords)
    left_wrist: Vec3 | None = None
    right_wrist: Vec3 | None = None

    # Strum detection
    prev_perp_dist: float = 0.0
    strum_cooldown: int = 0
    last_strum_direction: str = ""  # "down" or "up"
    last_strum_time: float = 0.0
    strum_count: int = 0

    # History for velocity calculation
    perp_history: deque = field(default_factory=lambda: deque(maxlen=5))

    # Visual feedback
    strum_flash_frames: int = 0


@dataclass
class PhoneTouch:
    """A single touch point from the phone fretboard."""
    id: int
    x: float  # 0-1 normalized
    y: float  # 0-1 normalized


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


# ---------------------------------------------------------------------------
# Math helpers
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


def signed_perp_distance_3d(point: Vec3, line_start: Vec3, line_end: Vec3) -> float:
    """
    Compute signed perpendicular distance from a point to a line in 3D.

    The sign is determined by the cross product's z-component (in image space,
    this tells us which side of the neck axis the point is on).
    Returns positive if the point is "above" the line (in screen coords),
    negative if "below".
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


def detect_strum(fretboard: FretboardState, perp_dist: float) -> str | None:
    """
    Detect strum by tracking sign changes in perpendicular distance.
    Returns "down", "up", or None.
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
    if prev * perp_dist < 0:  # Sign changed — crossed the neck line
        velocity = abs(perp_dist - prev)
        if velocity > STRUM_VELOCITY_THRESHOLD:
            direction = "down" if perp_dist > prev else "up"
            fretboard.strum_cooldown = STRUM_COOLDOWN_FRAMES
            fretboard.last_strum_direction = direction
            fretboard.last_strum_time = time.time()
            # Only count and flash for down strums
            if direction == "down":
                fretboard.strum_count += 1
                fretboard.strum_flash_frames = 6
            fretboard.prev_perp_dist = perp_dist
            return direction

    fretboard.prev_perp_dist = perp_dist
    return None


def identify_hands(
    result: HandLandmarkerResult,
) -> tuple[list | None, list | None]:
    """
    Identify fret (left) and strum (right) hands from the result.
    Returns (fret_hand_landmarks, strum_hand_landmarks).

    When SWAP_HANDS is True the MediaPipe "Left"/"Right" labels are swapped
    so the correct physical hand maps to fret/strum.
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


# ---------------------------------------------------------------------------
# Drawing helpers
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

    # Depth-based thickness: closer = thicker
    avg_z = (lw.z + rw.z) / 2
    thickness = int(np.clip(5 - avg_z * 15, 2, 10))

    # Neck line color (flashes white on strum)
    line_color = COLOR_YELLOW
    if fretboard.strum_flash_frames > 0:
        flash_intensity = fretboard.strum_flash_frames / 6.0
        line_color = (
            int(0 + 255 * flash_intensity),
            int(255),
            int(255),
        )
        fretboard.strum_flash_frames -= 1

    cv2.line(image, (lx, ly), (rx, ry), line_color, thickness, cv2.LINE_AA)

    # Wrist anchor dots
    cv2.circle(image, (lx, ly), 6, COLOR_YELLOW, -1, cv2.LINE_AA)
    cv2.circle(image, (rx, ry), 6, COLOR_YELLOW, -1, cv2.LINE_AA)

    # Depth label
    depth_text = f"Depth L:{lw.z:.3f} R:{rw.z:.3f}"
    cv2.putText(image, depth_text, (lx, ly - 15),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_YELLOW, 1, cv2.LINE_AA)

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
        cv2.line(image, (sz_x1, sz_y1), (sz_x2, sz_y2),
                 COLOR_CYAN, 2, cv2.LINE_AA)

    # Strum point indicator
    if strum_hand_landmarks is not None:
        sp = get_strum_point(strum_hand_landmarks)
        cx, cy = sp.to_pixel(w, h)
        cv2.circle(image, (cx, cy), 5, COLOR_CYAN, -1, cv2.LINE_AA)

        perp_dist = signed_perp_distance_3d(sp, lw, rw)
        dist_color = COLOR_GREEN if perp_dist >= 0 else COLOR_RED
        cv2.circle(image, (cx, cy), 8, dist_color, 2, cv2.LINE_AA)


def draw_strum_panel(image: np.ndarray, fretboard: FretboardState) -> None:
    """Draw strum detection info panel."""
    h, w, _ = image.shape
    panel_x = w - 260
    panel_y = h - 100
    panel_w = 250
    panel_h = 90

    overlay = image.copy()
    cv2.rectangle(overlay, (panel_x, panel_y),
                  (panel_x + panel_w, panel_y + panel_h), COLOR_BLACK, -1)
    cv2.addWeighted(overlay, 0.6, image, 0.4, 0, image)

    cv2.putText(image, "Fretboard / Strum", (panel_x + 10, panel_y + 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, COLOR_YELLOW, 1, cv2.LINE_AA)

    cv2.putText(image, f"Strums: {fretboard.strum_count}",
                (panel_x + 10, panel_y + 45),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_WHITE, 1, cv2.LINE_AA)

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
            cv2.putText(image, f"Last: {arrow} {fretboard.last_strum_direction}",
                        (panel_x + 10, panel_y + 70),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

    if fretboard.perp_history:
        latest = fretboard.perp_history[-1]
        bar_center_x = panel_x + panel_w // 2
        bar_y = panel_y + 80
        bar_half_w = 80
        bar_val = int(np.clip(latest * 500, -bar_half_w, bar_half_w))

        cv2.line(image, (bar_center_x, bar_y), (bar_center_x, bar_y),
                 COLOR_WHITE, 1)
        bar_color = COLOR_GREEN if bar_val >= 0 else COLOR_RED
        cv2.line(image, (bar_center_x, bar_y),
                 (bar_center_x + bar_val, bar_y),
                 bar_color, 4, cv2.LINE_AA)


def draw_phone_panel(image: np.ndarray, phone: PhoneState) -> None:
    """Draw phone connection status and touch data overlay."""
    h, w, _ = image.shape
    panel_x = 10
    panel_y = h - 120
    panel_w = 300
    panel_h = 110

    overlay = image.copy()
    cv2.rectangle(overlay, (panel_x, panel_y),
                  (panel_x + panel_w, panel_y + panel_h), COLOR_BLACK, -1)
    cv2.addWeighted(overlay, 0.6, image, 0.4, 0, image)

    # Connection status
    status_color = COLOR_GREEN if phone.connected else COLOR_RED
    status_text = "Phone: Connected" if phone.connected else f"Phone: Waiting (ws://IP:{WS_PORT})"
    cv2.putText(image, status_text, (panel_x + 10, panel_y + 22),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, status_color, 1, cv2.LINE_AA)

    if phone.connected and phone.touches:
        # Show active touches
        touch_text = f"Touches: {len(phone.touches)}"
        cv2.putText(image, touch_text, (panel_x + 10, panel_y + 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, COLOR_WHITE, 1, cv2.LINE_AA)

        for i, t in enumerate(phone.touches[:4]):  # Show max 4
            cv2.putText(
                image,
                f"  T{t.id}: ({t.x:.2f}, {t.y:.2f})",
                (panel_x + 10, panel_y + 65 + i * 16),
                cv2.FONT_HERSHEY_SIMPLEX, 0.35, COLOR_CYAN, 1, cv2.LINE_AA,
            )
    elif phone.connected:
        cv2.putText(image, "No touches", (panel_x + 10, panel_y + 45),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, COLOR_WHITE, 1, cv2.LINE_AA)


def draw_hand_info_panel(
    image: np.ndarray,
    result: HandLandmarkerResult,
) -> None:
    """Draw a translucent info panel showing detected hand details."""
    if not result.hand_landmarks:
        return

    num_hands = len(result.hand_landmarks)
    panel_w = 280
    panel_h = 40 + num_hands * 60
    panel_x, panel_y = 10, 10

    overlay = image.copy()
    cv2.rectangle(overlay, (panel_x, panel_y),
                  (panel_x + panel_w, panel_y + panel_h), COLOR_BLACK, -1)
    cv2.addWeighted(overlay, 0.6, image, 0.4, 0, image)

    cv2.putText(image, "Detected Hands", (panel_x + 10, panel_y + 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, COLOR_WHITE, 1, cv2.LINE_AA)

    for idx in range(num_hands):
        hand_landmarks = result.hand_landmarks[idx]
        handedness = result.handedness[idx]
        color = HAND_COLORS[idx % len(HAND_COLORS)]

        label = handedness[0].category_name
        score = handedness[0].score
        y_offset = panel_y + 55 + idx * 60

        cv2.putText(image, f"Hand {idx + 1}: {label} ({score:.0%})",
                    (panel_x + 15, y_offset),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA)

        wrist = hand_landmarks[0]
        cv2.putText(image,
                    f"Wrist: ({wrist.x:.2f}, {wrist.y:.2f}, {wrist.z:.2f})",
                    (panel_x + 15, y_offset + 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_WHITE, 1, cv2.LINE_AA)


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
        cv2.rectangle(image, (cx - 2, cy - text_size[1] - 6),
                      (cx + text_size[0] + 4, cy + 2), COLOR_BLACK, -1)
        cv2.putText(image, name, (cx, cy - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA)


def draw_skeleton_only(
    image: np.ndarray, hand_landmarks: list, hand_idx: int,
) -> None:
    """Draw only thin skeleton connections without landmark dots."""
    h, w, _ = image.shape
    color = HAND_COLORS[hand_idx % len(HAND_COLORS)]
    for connection in HandLandmarksConnections.HAND_CONNECTIONS:
        start = hand_landmarks[connection.start]
        end = hand_landmarks[connection.end]
        x1, y1 = int(start.x * w), int(start.y * h)
        x2, y2 = int(end.x * w), int(end.y * h)
        cv2.line(image, (x1, y1), (x2, y2), color, 2, cv2.LINE_AA)


# ---------------------------------------------------------------------------
# WebSocket server for phone fretboard
# ---------------------------------------------------------------------------
def start_ws_server(phone: PhoneState, phone_lock: threading.Lock) -> None:
    """Run the WebSocket server in a background thread."""

    async def handler(websocket):
        print(f"Phone connected: {websocket.remote_address}")
        with phone_lock:
            phone.connected = True

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                except json.JSONDecodeError:
                    continue

                touches = [
                    PhoneTouch(id=t["id"], x=t["x"], y=t["y"])
                    for t in data.get("touches", [])
                ]

                accel = data.get("accel", {})
                gyro = data.get("gyro", {})

                with phone_lock:
                    phone.touches = touches
                    phone.accel_x = accel.get("x", 0.0)
                    phone.accel_y = accel.get("y", 0.0)
                    phone.accel_z = accel.get("z", 0.0)
                    phone.gyro_alpha = gyro.get("alpha", 0.0)
                    phone.gyro_beta = gyro.get("beta", 0.0)
                    phone.gyro_gamma = gyro.get("gamma", 0.0)
                    phone.last_update = time.time()
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            print("Phone disconnected.")
            with phone_lock:
                phone.connected = False
                phone.touches = []

    async def run():
        async with ws_serve(handler, "0.0.0.0", WS_PORT):
            print(f"WebSocket server listening on ws://0.0.0.0:{WS_PORT}")
            await asyncio.Future()  # run forever

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(run())


def start_http_server() -> None:
    """Serve the fretboard app's built files over HTTP."""
    import functools

    dist_path = str(FRETBOARD_DIST)

    handler = functools.partial(SimpleHTTPRequestHandler, directory=dist_path)
    httpd = HTTPServer(("0.0.0.0", HTTP_PORT), handler)
    print(f"HTTP server serving fretboard at http://0.0.0.0:{HTTP_PORT}")
    httpd.serve_forever()


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------
def main() -> None:
    """Run real-time hand landmark detection with neck line + strum."""
    if not Path(MODEL_PATH).exists():
        print(f"Error: Model not found at {MODEL_PATH}")
        print("Download it with:")
        print("  curl -L -o hand_landmarker.task \\")
        print("    https://storage.googleapis.com/mediapipe-models/"
              "hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task")
        return

    print("Starting Fretboard — Hand Landmark Detection + Strum")
    print("Controls: ESC/q = Quit | f = Toggle FPS | m = Cycle mode")

    # Shared state
    latest_result: HandLandmarkerResult | None = None
    result_lock = threading.Lock()

    phone = PhoneState()
    phone_lock = threading.Lock()

    def on_result(
        result: HandLandmarkerResult,
        output_image: mp.Image,
        timestamp_ms: int,
    ) -> None:
        nonlocal latest_result
        with result_lock:
            latest_result = result

    # Start WebSocket server in background
    ws_thread = threading.Thread(target=start_ws_server, args=(phone, phone_lock), daemon=True)
    ws_thread.start()

    # Start HTTP server for fretboard app (if built)
    if FRETBOARD_DIST.exists():
        http_thread = threading.Thread(target=start_http_server, daemon=True)
        http_thread.start()
    else:
        print(f"Note: Fretboard app not built yet ({FRETBOARD_DIST}).")
        print("  Run: cd fretboard && npm run build")
        print(f"  Or use Vite dev server: cd fretboard && npm run dev")

    options = HandLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=RunningMode.LIVE_STREAM,
        num_hands=2,
        min_hand_detection_confidence=0.5,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        result_callback=on_result,
    )

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    show_fps = True
    display_mode = MODE_FULL
    prev_time = time.time()
    fps = 0.0
    frame_timestamp_ms = 0

    fretboard = FretboardState()

    with HandLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                continue

            frame = cv2.flip(frame, 1)

            frame_timestamp_ms += 33
            mp_image = mp.Image(
                image_format=mp.ImageFormat.SRGB,
                data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB),
            )
            landmarker.detect_async(mp_image, frame_timestamp_ms)

            with result_lock:
                result = latest_result

            strum_hand_lm = None

            if result and result.hand_landmarks:
                for idx, hand_landmarks in enumerate(result.hand_landmarks):
                    if display_mode == MODE_SKELETON:
                        draw_skeleton_only(frame, hand_landmarks, idx)
                    else:
                        drawing_utils.draw_landmarks(
                            frame, hand_landmarks,
                            HandLandmarksConnections.HAND_CONNECTIONS,
                            drawing_styles.get_default_hand_landmarks_style(),
                            drawing_styles.get_default_hand_connections_style(),
                        )
                    if display_mode == MODE_FULL:
                        draw_fingertip_labels(frame, hand_landmarks, idx)

                draw_hand_info_panel(frame, result)

                # --- Fretboard logic ---
                fret_lm, strum_lm = identify_hands(result)

                if fret_lm is not None:
                    raw_left = landmark_to_vec3(fret_lm[WRIST])
                    fretboard.left_wrist = smooth_vec3(
                        fretboard.left_wrist, raw_left, SMOOTH_ALPHA,
                    )

                if strum_lm is not None:
                    raw_right = landmark_to_vec3(strum_lm[WRIST])
                    fretboard.right_wrist = smooth_vec3(
                        fretboard.right_wrist, raw_right, SMOOTH_ALPHA,
                    )
                    strum_hand_lm = strum_lm

                # Strum detection (need both hands)
                if (fretboard.left_wrist is not None
                        and fretboard.right_wrist is not None
                        and strum_lm is not None):
                    strum_point = get_strum_point(strum_lm)
                    perp = signed_perp_distance_3d(
                        strum_point, fretboard.left_wrist, fretboard.right_wrist,
                    )
                    strum = detect_strum(fretboard, perp)
                    if strum == "down":
                        print(f"STRUM DOWN (#{fretboard.strum_count})")

            # Draw overlays
            draw_neck_line(frame, fretboard, strum_hand_lm)
            draw_strum_panel(frame, fretboard)

            with phone_lock:
                phone_snapshot = PhoneState(
                    connected=phone.connected,
                    touches=list(phone.touches),
                    accel_x=phone.accel_x,
                    accel_y=phone.accel_y,
                    accel_z=phone.accel_z,
                    last_update=phone.last_update,
                )
            draw_phone_panel(frame, phone_snapshot)

            # FPS
            current_time = time.time()
            fps = 0.9 * fps + 0.1 / max(current_time - prev_time, 1e-6)
            prev_time = current_time

            if show_fps:
                cv2.putText(frame, f"FPS: {fps:.0f}",
                            (frame.shape[1] - 130, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, COLOR_GREEN,
                            2, cv2.LINE_AA)

            cv2.putText(frame, f"Mode: {MODE_NAMES[display_mode]}",
                        (frame.shape[1] - 200, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_WHITE,
                        1, cv2.LINE_AA)

            cv2.imshow("Fretboard — MediaPipe", frame)

            key = cv2.waitKey(5) & 0xFF
            if key == 27 or key == ord("q"):
                break
            elif key == ord("f"):
                show_fps = not show_fps
            elif key == ord("m"):
                display_mode = (display_mode + 1) % 3

    cap.release()
    cv2.destroyAllWindows()
    print(f"Done. Total strums detected: {fretboard.strum_count}")


if __name__ == "__main__":
    main()
