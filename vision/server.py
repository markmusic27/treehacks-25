"""
Vision — Browser Bridge Server
================================

Replaces ``main.py``'s OpenCV window with a WebSocket server that streams
processed video frames to the browser and accepts start/stop commands.

The phone fretboard WebSocket (port 8765) runs as before.
A new browser WebSocket (port 8766) handles:
  - Binary messages OUT → JPEG frames (~30 fps)
  - JSON messages IN  → {"action": "start"} / {"action": "stop"}
  - JSON messages OUT → {"type": "midi", "events": [...]} on stop
  - JSON messages OUT → {"type": "status", ...} for connection state
"""

import asyncio
import json
import threading
import time
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    HandLandmarker,
    HandLandmarkerOptions,
    HandLandmarkerResult,
    HandLandmarksConnections,
    RunningMode,
    drawing_utils,
    drawing_styles,
)
from websockets.asyncio.server import serve as ws_serve

from audio_engine import AudioEngine
from config import (
    COLOR_GREEN,
    COLOR_WHITE,
    MODE_FULL,
    MODE_NAMES,
    MODE_SKELETON,
    MODEL_PATH,
    POLE_PROJECTION_LANDMARK,
    SMOOTH_ALPHA,
    WRIST,
)
from drawing import (
    draw_fingertip_labels,
    draw_hand_info_panel,
    draw_neck_line,
    draw_note_panel,
    draw_phone_panel,
    draw_pole_overlay,
    draw_skeleton_only,
    draw_strum_panel,
)
from hand_tracking import (
    detect_strum,
    get_strum_point,
    identify_hands,
    landmark_to_vec3,
    signed_perp_distance_3d,
    smooth_vec3,
)
from models import FretboardState, PhoneState, PoleState
from note_engine import NoteEngine
from pole_detection import compute_pole_position, update_pole_state
from websocket_server import start_ws_server

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BROWSER_WS_PORT = 8766
JPEG_QUALITY = 70  # 0-100, lower = faster but blurrier
TARGET_FPS = 30

# Map website instrument IDs → GM program numbers
INSTRUMENT_PROGRAM_MAP: dict[str, int] = {
    "guitar":  25,   # Acoustic Guitar (steel)
    "violin":  40,   # Violin
    "cello":   42,   # Cello
    "ukulele": 24,   # Nylon Guitar (closest match)
    "bass":    32,   # Acoustic Bass
    "harp":    46,   # Orchestral Harp
    "banjo":   105,  # Banjo
    "sitar":   104,  # Sitar
}


# ---------------------------------------------------------------------------
# MIDI event recording
# ---------------------------------------------------------------------------
class MidiRecorder:
    """Collects MIDI events between start() and stop()."""

    def __init__(self):
        self.recording = False
        self.events: list[dict] = []
        self._start_time = 0.0
        self._lock = threading.Lock()

    def start(self):
        with self._lock:
            self.recording = True
            self.events = []
            self._start_time = time.time()

    def stop(self) -> list[dict]:
        with self._lock:
            self.recording = False
            events = list(self.events)
            self.events = []
            return events

    def record(self, midi_note: int, velocity: int, duration: float, name: str):
        with self._lock:
            if not self.recording:
                return
            self.events.append({
                "time": round(time.time() - self._start_time, 3),
                "midi_note": midi_note,
                "velocity": velocity,
                "duration": round(duration, 3),
                "name": name,
            })


# ---------------------------------------------------------------------------
# Note triggering (matches main.py — uses pole position)
# ---------------------------------------------------------------------------
def handle_strum(
    fretboard: FretboardState,
    phone: PhoneState,
    pole: PoleState,
    strum_velocity: float,
    note_engine: NoteEngine,
    audio: AudioEngine,
    midi_recorder: MidiRecorder,
) -> None:
    """
    Called on each detected down-strum.  Reads the current phone touches
    and pole position, then plays the appropriate strings.

    - No fingers pressed → strum all strings open.
    - One or more strings pressed → only strum those strings.
    - Two fingers on the same string → the one closest to the
      strummer (highest y / nearest the bridge) wins.
    """
    pole_pos = pole.position  # 0-1 along the physical pole

    # Build a set of fretted strings from phone touches.
    # If two fingers press the same string, keep the one closest to
    # the strummer (highest y value = nearest the bridge).
    fretted: dict[int, float] = {}
    for touch in phone.touches:
        if touch.string not in fretted or touch.y > fretted[touch.string]:
            fretted[touch.string] = touch.y

    # Decide which strings to play
    if fretted:
        # Only strum pressed strings
        strings_to_play = sorted(fretted.keys())
    else:
        # No fingers → strum all strings open
        strings_to_play = list(range(note_engine.num_strings))

    note_strings: list[str] = []
    for s in strings_to_play:
        if s in fretted:
            # Finger on this string → pole shift + phone fret semitones
            result = note_engine.compute_note(
                string_index=s,
                fret_y=fretted[s],
                pole_position=pole_pos,
                strum_velocity=strum_velocity,
            )
        else:
            # Open string → just the base tuning note, no shift
            result = note_engine.compute_note(
                string_index=s,
                fret_y=0.0,
                pole_position=0.0,
                strum_velocity=strum_velocity,
            )
        audio.play_note(result.midi_note, result.velocity, result.duration)
        midi_recorder.record(result.midi_note, result.velocity, result.duration, result.name)
        open_tag = "" if s in fretted else " (open)"
        label = (
            f"{result.name}  str={s}  vel={result.velocity}  "
            f"dur={result.duration:.2f}s{open_tag}"
        )
        note_strings.append(label)
        print(
            f"  -> {result.name} (MIDI {result.midi_note}) "
            f"str={s} vel={result.velocity} "
            f"dur={result.duration:.2f}s  pole={pole_pos:.2f}{open_tag}"
        )

    fretboard.last_notes = note_strings
    fretboard.last_note_time = time.time()


# ---------------------------------------------------------------------------
# Frame producer (runs in its own thread)
# ---------------------------------------------------------------------------
class FrameProducer:
    """
    Captures webcam, runs MediaPipe, draws overlays, and produces JPEG frames.
    The latest frame is always available for the WebSocket to grab.
    """

    def __init__(self, phone: PhoneState, phone_lock: threading.Lock,
                 midi_recorder: MidiRecorder):
        self.phone = phone
        self.phone_lock = phone_lock
        self.midi_recorder = midi_recorder

        self.latest_jpeg: bytes | None = None
        self.frame_lock = threading.Lock()
        self.running = False

        self.fretboard = FretboardState()
        self.pole = PoleState()
        self.note_engine = NoteEngine(num_strings=6)
        self.audio = AudioEngine()

        self._latest_result: HandLandmarkerResult | None = None
        self._result_lock = threading.Lock()

    def _on_result(self, result: HandLandmarkerResult, _img, _ts):
        with self._result_lock:
            self._latest_result = result

    def run(self):
        if not Path(MODEL_PATH).exists():
            print(f"[FrameProducer] Model not found at {MODEL_PATH}")
            return

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=MODEL_PATH),
            running_mode=RunningMode.LIVE_STREAM,
            num_hands=2,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
            result_callback=self._on_result,
        )

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("[FrameProducer] Could not open webcam.")
            return
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

        self.running = True
        display_mode = MODE_FULL
        frame_timestamp_ms = 0
        frame_interval = 1.0 / TARGET_FPS
        prev_time = time.time()
        fps = 0.0

        print("[FrameProducer] Webcam started, streaming frames...")

        try:
            with HandLandmarker.create_from_options(options) as landmarker:
                while self.running:
                    loop_start = time.time()

                    success, frame = cap.read()
                    if not success:
                        continue

                    frame = cv2.flip(frame, 1)
                    frame_timestamp_ms += 33

                    # --- Pole detection (magenta tape) ---
                    update_pole_state(self.pole, frame)

                    mp_image = mp.Image(
                        image_format=mp.ImageFormat.SRGB,
                        data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB),
                    )
                    landmarker.detect_async(mp_image, frame_timestamp_ms)

                    with self._result_lock:
                        result = self._latest_result

                    strum_hand_lm = None

                    if result and result.hand_landmarks:
                        # Draw hands
                        for idx, hand_landmarks in enumerate(result.hand_landmarks):
                            if display_mode == MODE_SKELETON:
                                draw_skeleton_only(frame, hand_landmarks, idx)
                            else:
                                drawing_utils.draw_landmarks(
                                    frame,
                                    hand_landmarks,
                                    HandLandmarksConnections.HAND_CONNECTIONS,
                                    drawing_styles.get_default_hand_landmarks_style(),
                                    drawing_styles.get_default_hand_connections_style(),
                                )
                            if display_mode == MODE_FULL:
                                draw_fingertip_labels(frame, hand_landmarks, idx)

                        draw_hand_info_panel(frame, result)

                        # --- Hand tracking & strum detection ---
                        fret_lm, strum_lm = identify_hands(result)

                        if fret_lm is not None:
                            self.fretboard.left_wrist = smooth_vec3(
                                self.fretboard.left_wrist,
                                landmark_to_vec3(fret_lm[WRIST]),
                                SMOOTH_ALPHA,
                            )
                            # Project fret hand onto the pole for pitch
                            # (uses middle finger MCP — the grip point on the pole)
                            grip_point = landmark_to_vec3(fret_lm[POLE_PROJECTION_LANDMARK])
                            h, w, _ = frame.shape
                            self.pole.position = compute_pole_position(
                                grip_point, self.pole, w, h,
                            )

                        if strum_lm is not None:
                            self.fretboard.right_wrist = smooth_vec3(
                                self.fretboard.right_wrist,
                                landmark_to_vec3(strum_lm[WRIST]),
                                SMOOTH_ALPHA,
                            )
                            strum_hand_lm = strum_lm

                        # Strum detection (need both hands)
                        if (
                            self.fretboard.left_wrist is not None
                            and self.fretboard.right_wrist is not None
                            and strum_lm is not None
                        ):
                            strum_point = get_strum_point(strum_lm)
                            perp = signed_perp_distance_3d(
                                strum_point,
                                self.fretboard.left_wrist,
                                self.fretboard.right_wrist,
                            )
                            strum_event = detect_strum(self.fretboard, perp)

                            if strum_event is not None and strum_event.direction == "down":
                                print(f"STRUM DOWN (#{self.fretboard.strum_count})")
                                with self.phone_lock:
                                    phone_snap = PhoneState(
                                        connected=self.phone.connected,
                                        touches=list(self.phone.touches),
                                    )
                                handle_strum(
                                    self.fretboard,
                                    phone_snap,
                                    self.pole,
                                    strum_event.velocity,
                                    self.note_engine,
                                    self.audio,
                                    self.midi_recorder,
                                )

                    # --- Draw overlays ---
                    draw_pole_overlay(frame, self.pole)
                    draw_neck_line(frame, self.fretboard, strum_hand_lm)
                    draw_strum_panel(frame, self.fretboard)
                    draw_note_panel(frame, self.fretboard)

                    with self.phone_lock:
                        phone_snapshot = PhoneState(
                            connected=self.phone.connected,
                            touches=list(self.phone.touches),
                            accel_x=self.phone.accel_x,
                            accel_y=self.phone.accel_y,
                            accel_z=self.phone.accel_z,
                            last_update=self.phone.last_update,
                        )
                    draw_phone_panel(frame, phone_snapshot)

                    # Recording indicator
                    if self.midi_recorder.recording:
                        cv2.circle(frame, (30, 30), 12, (0, 0, 255), -1, cv2.LINE_AA)
                        cv2.putText(
                            frame, "REC", (50, 38),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2, cv2.LINE_AA,
                        )

                    # FPS
                    current_time = time.time()
                    fps = 0.9 * fps + 0.1 / max(current_time - prev_time, 1e-6)
                    prev_time = current_time
                    cv2.putText(
                        frame, f"FPS: {fps:.0f}",
                        (frame.shape[1] - 130, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, COLOR_GREEN, 2, cv2.LINE_AA,
                    )

                    cv2.putText(
                        frame, f"Mode: {MODE_NAMES[display_mode]}",
                        (frame.shape[1] - 200, 60),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                        COLOR_WHITE, 1, cv2.LINE_AA,
                    )

                    # Encode to JPEG
                    _, jpeg = cv2.imencode(
                        ".jpg", frame,
                        [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY],
                    )
                    with self.frame_lock:
                        self.latest_jpeg = jpeg.tobytes()

                    # Throttle to target FPS
                    elapsed = time.time() - loop_start
                    sleep_time = frame_interval - elapsed
                    if sleep_time > 0:
                        time.sleep(sleep_time)

        finally:
            self.audio.shutdown()
            cap.release()
            self.running = False
            print(f"[FrameProducer] Stopped. Total strums: {self.fretboard.strum_count}")

    def stop(self):
        self.running = False


# ---------------------------------------------------------------------------
# Browser WebSocket server
# ---------------------------------------------------------------------------
async def browser_ws_handler(websocket, producer: FrameProducer,
                              midi_recorder: MidiRecorder):
    """Handle a single browser WebSocket connection."""
    print(f"[Browser WS] Connected: {websocket.remote_address}")

    # Send initial status
    await websocket.send(json.dumps({
        "type": "status",
        "recording": midi_recorder.recording,
        "message": "Connected to Vision server",
    }))

    # Two concurrent tasks: send frames + receive commands
    stop_event = asyncio.Event()

    async def send_frames():
        """Stream JPEG frames to the browser."""
        last_jpeg = None
        while not stop_event.is_set():
            with producer.frame_lock:
                jpeg = producer.latest_jpeg

            if jpeg is not None and jpeg is not last_jpeg:
                try:
                    await websocket.send(jpeg)
                    last_jpeg = jpeg
                except Exception:
                    break

            await asyncio.sleep(1.0 / TARGET_FPS)

    async def receive_commands():
        """Listen for start/stop/set_instrument commands from the browser."""
        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                except (json.JSONDecodeError, TypeError):
                    continue

                action = data.get("action")

                if action == "set_instrument":
                    instrument_id = data.get("instrumentId", "")
                    # Check built-in map first, then fall back to gmProgram from browser
                    program = INSTRUMENT_PROGRAM_MAP.get(instrument_id)
                    if program is None:
                        gm_str = data.get("gmProgram")
                        if gm_str is not None:
                            try:
                                program = int(gm_str)
                            except (ValueError, TypeError):
                                pass
                    if program is not None:
                        producer.audio.set_program(program)
                        print(f"[Browser WS] Instrument set to '{instrument_id}' (program {program})")
                        await websocket.send(json.dumps({
                            "type": "status",
                            "recording": midi_recorder.recording,
                            "message": f"Instrument: {instrument_id}",
                        }))
                    else:
                        print(f"[Browser WS] Unknown instrument: '{instrument_id}' — using default")
                        await websocket.send(json.dumps({
                            "type": "status",
                            "recording": midi_recorder.recording,
                            "message": f"Using default sound for: {instrument_id}",
                        }))

                elif action == "start":
                    midi_recorder.start()
                    print("[Browser WS] Recording STARTED")
                    await websocket.send(json.dumps({
                        "type": "status",
                        "recording": True,
                        "message": "Recording started",
                    }))

                elif action == "stop":
                    events = midi_recorder.stop()
                    print(f"[Browser WS] Recording STOPPED — {len(events)} MIDI events")
                    await websocket.send(json.dumps({
                        "type": "midi",
                        "events": events,
                        "total": len(events),
                    }))
                    await websocket.send(json.dumps({
                        "type": "status",
                        "recording": False,
                        "message": f"Recording stopped — {len(events)} notes captured",
                    }))

        except Exception:
            pass
        finally:
            stop_event.set()

    # Run both concurrently; when one ends, cancel the other
    send_task = asyncio.create_task(send_frames())
    recv_task = asyncio.create_task(receive_commands())
    done, pending = await asyncio.wait(
        [send_task, recv_task], return_when=asyncio.FIRST_COMPLETED,
    )
    for task in pending:
        task.cancel()

    print(f"[Browser WS] Disconnected: {websocket.remote_address}")


async def run_browser_ws(producer: FrameProducer, midi_recorder: MidiRecorder):
    """Start the browser-facing WebSocket server."""
    async with ws_serve(
        lambda ws: browser_ws_handler(ws, producer, midi_recorder),
        "0.0.0.0", BROWSER_WS_PORT,
        max_size=2 ** 22,  # 4 MB max message (for JPEG frames)
    ):
        print(f"[Browser WS] Listening on ws://0.0.0.0:{BROWSER_WS_PORT}")
        await asyncio.Future()  # run forever


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
def main():
    print("=" * 60)
    print("  Vision — Browser Bridge Server")
    print("=" * 60)
    print()

    # Shared state
    phone = PhoneState()
    phone_lock = threading.Lock()
    midi_recorder = MidiRecorder()

    # 1) Start phone fretboard WebSocket (port 8765) — background thread
    ws_thread = threading.Thread(
        target=start_ws_server, args=(phone, phone_lock), daemon=True,
    )
    ws_thread.start()

    # 2) Start frame producer (webcam + MediaPipe) — background thread
    producer = FrameProducer(phone, phone_lock, midi_recorder)
    producer_thread = threading.Thread(target=producer.run, daemon=True)
    producer_thread.start()

    # Give the producer a moment to initialise
    time.sleep(1.0)

    # 3) Start browser WebSocket (port 8766) — main thread (asyncio)
    print()
    print(f"  Phone fretboard WS  → ws://localhost:8765")
    print(f"  Browser video WS    → ws://localhost:{BROWSER_WS_PORT}")
    print(f"  Website             → http://localhost:3000")
    print()

    try:
        asyncio.run(run_browser_ws(producer, midi_recorder))
    except KeyboardInterrupt:
        print("\nShutting down...")
    finally:
        producer.stop()


if __name__ == "__main__":
    main()
