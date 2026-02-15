"""
Vision — Air Instrument System
===============================

Entry point that wires together hand tracking, phone fretboard input,
note generation, and audio playback.

Controls
--------
- ESC / 'q' : Quit
- 'f'       : Toggle FPS display
- 'm'       : Cycle display mode (Full / Landmarks / Skeleton)
"""

import threading
import time
from pathlib import Path

import cv2
import mediapipe as mp
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
# Note triggering
# ---------------------------------------------------------------------------
def handle_strum(
    fretboard: FretboardState,
    phone: PhoneState,
    pole: PoleState,
    strum_velocity: float,
    note_engine: NoteEngine,
    audio: AudioEngine,
) -> None:
    """
    Called on each detected down-strum.  Reads the current phone touches
    and pole position, then plays a note for every active string.
    """
    pole_pos = pole.position  # 0-1 along the physical pole

    # Build a set of fretted strings from phone touches
    fretted: dict[int, float] = {}
    for touch in phone.touches:
        fretted[touch.string] = touch.y

    # Always strum ALL strings
    note_strings: list[str] = []
    for s in range(note_engine.num_strings):
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
# Main loop
# ---------------------------------------------------------------------------
def main() -> None:
    """Run the air instrument system."""

    # --- Pre-flight checks ---
    if not Path(MODEL_PATH).exists():
        print(f"Error: Model not found at {MODEL_PATH}")
        print("Download it with:")
        print("  curl -L -o hand_landmarker.task \\")
        print(
            "    https://storage.googleapis.com/mediapipe-models/"
            "hand_landmarker/hand_landmarker/float16/latest/"
            "hand_landmarker.task"
        )
        return

    print("Vision — Air Instrument System")
    print("Controls: ESC/q = Quit | f = Toggle FPS | m = Cycle mode")

    # --- Shared state ---
    latest_result: HandLandmarkerResult | None = None
    result_lock = threading.Lock()

    phone = PhoneState()
    phone_lock = threading.Lock()

    fretboard = FretboardState()
    pole = PoleState()

    def on_result(
        result: HandLandmarkerResult, _output_image: mp.Image, _ts: int,
    ) -> None:
        nonlocal latest_result
        with result_lock:
            latest_result = result

    # --- Background services ---
    ws_thread = threading.Thread(
        target=start_ws_server, args=(phone, phone_lock), daemon=True,
    )
    ws_thread.start()

    note_engine = NoteEngine(num_strings=6)
    audio = AudioEngine()

    # --- MediaPipe ---
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

    try:
        with HandLandmarker.create_from_options(options) as landmarker:
            while cap.isOpened():
                success, frame = cap.read()
                if not success:
                    continue

                frame = cv2.flip(frame, 1)
                frame_timestamp_ms += 33

                # --- Pole detection (magenta tape) ---
                update_pole_state(pole, frame)

                mp_image = mp.Image(
                    image_format=mp.ImageFormat.SRGB,
                    data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB),
                )
                landmarker.detect_async(mp_image, frame_timestamp_ms)

                with result_lock:
                    result = latest_result

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
                        fretboard.left_wrist = smooth_vec3(
                            fretboard.left_wrist,
                            landmark_to_vec3(fret_lm[WRIST]),
                            SMOOTH_ALPHA,
                        )
                        # Project fret hand onto the pole for pitch
                        # (uses middle finger MCP — the grip point on the pole)
                        grip_point = landmark_to_vec3(fret_lm[POLE_PROJECTION_LANDMARK])
                        h, w, _ = frame.shape
                        pole.position = compute_pole_position(
                            grip_point, pole, w, h,
                        )

                    if strum_lm is not None:
                        fretboard.right_wrist = smooth_vec3(
                            fretboard.right_wrist,
                            landmark_to_vec3(strum_lm[WRIST]),
                            SMOOTH_ALPHA,
                        )
                        strum_hand_lm = strum_lm

                    # Strum detection (need both hands)
                    if (
                        fretboard.left_wrist is not None
                        and fretboard.right_wrist is not None
                        and strum_lm is not None
                    ):
                        strum_point = get_strum_point(strum_lm)
                        perp = signed_perp_distance_3d(
                            strum_point,
                            fretboard.left_wrist,
                            fretboard.right_wrist,
                        )
                        strum_event = detect_strum(fretboard, perp)

                        if strum_event is not None and strum_event.direction == "down":
                            print(f"STRUM DOWN (#{fretboard.strum_count})")
                            with phone_lock:
                                phone_snap = PhoneState(
                                    connected=phone.connected,
                                    touches=list(phone.touches),
                                )
                            handle_strum(
                                fretboard,
                                phone_snap,
                                pole,
                                strum_event.velocity,
                                note_engine,
                                audio,
                            )

                # --- Draw overlays ---
                draw_pole_overlay(frame, pole)
                draw_strum_panel(frame, fretboard)
                draw_note_panel(frame, fretboard)

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
                    cv2.putText(
                        frame, f"FPS: {fps:.0f}",
                        (frame.shape[1] - 130, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                        COLOR_GREEN, 2, cv2.LINE_AA,
                    )

                cv2.putText(
                    frame, f"Mode: {MODE_NAMES[display_mode]}",
                    (frame.shape[1] - 200, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5,
                    COLOR_WHITE, 1, cv2.LINE_AA,
                )

                cv2.imshow("Vision — Air Instrument", frame)

                key = cv2.waitKey(5) & 0xFF
                if key == 27 or key == ord("q"):
                    break
                elif key == ord("f"):
                    show_fps = not show_fps
                elif key == ord("m"):
                    display_mode = (display_mode + 1) % 3

    finally:
        audio.shutdown()
        cap.release()
        cv2.destroyAllWindows()
        print(f"Done. Total strums detected: {fretboard.strum_count}")


if __name__ == "__main__":
    main()
