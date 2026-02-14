"""
MediaPipe Hand Landmark Detection

Real-time hand landmark detection using Google's MediaPipe.
Detects up to 2 hands and draws 21 landmarks per hand with connections.

Controls:
  - ESC or 'q': Quit
  - 'f': Toggle FPS display
  - 'm': Cycle through detection modes (full / landmarks only / skeleton only)
"""

import time
import threading
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

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

# Model path
MODEL_PATH = str(Path(__file__).parent / "hand_landmarker.task")

# Display mode constants
MODE_FULL = 0       # Landmarks + connections + labels
MODE_LANDMARKS = 1  # Landmarks + connections (no labels)
MODE_SKELETON = 2   # Connections only (thin lines)
MODE_NAMES = ["Full", "Landmarks", "Skeleton"]

# Colors (BGR)
COLOR_GREEN = (0, 255, 0)
COLOR_WHITE = (255, 255, 255)
COLOR_BLACK = (0, 0, 0)

# Hand colors for multi-hand distinction
HAND_COLORS = [
    (0, 255, 0),    # Green for first hand
    (255, 165, 0),  # Orange for second hand
]


def draw_hand_info_panel(
    image: np.ndarray,
    result: HandLandmarkerResult,
) -> None:
    """Draw a translucent info panel showing detected hand details."""
    if not result.hand_landmarks:
        return

    num_hands = len(result.hand_landmarks)

    # Panel dimensions
    panel_w = 280
    panel_h = 40 + num_hands * 60
    panel_x, panel_y = 10, 10

    # Draw translucent background
    overlay = image.copy()
    cv2.rectangle(
        overlay,
        (panel_x, panel_y),
        (panel_x + panel_w, panel_y + panel_h),
        COLOR_BLACK,
        -1,
    )
    cv2.addWeighted(overlay, 0.6, image, 0.4, 0, image)

    # Title
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

        # Hand label and confidence
        cv2.putText(
            image, f"Hand {idx + 1}: {label} ({score:.0%})",
            (panel_x + 15, y_offset),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1, cv2.LINE_AA,
        )

        # Wrist position
        wrist = hand_landmarks[0]
        cv2.putText(
            image,
            f"Wrist: ({wrist.x:.2f}, {wrist.y:.2f}, {wrist.z:.2f})",
            (panel_x + 15, y_offset + 20),
            cv2.FONT_HERSHEY_SIMPLEX, 0.4, COLOR_WHITE, 1, cv2.LINE_AA,
        )


def draw_fingertip_labels(
    image: np.ndarray,
    hand_landmarks: list,
    hand_idx: int,
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
            image,
            (cx - 2, cy - text_size[1] - 6),
            (cx + text_size[0] + 4, cy + 2),
            COLOR_BLACK, -1,
        )
        cv2.putText(
            image, name, (cx, cy - 4),
            cv2.FONT_HERSHEY_SIMPLEX, 0.4, color, 1, cv2.LINE_AA,
        )


def draw_skeleton_only(
    image: np.ndarray,
    hand_landmarks: list,
    hand_idx: int,
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


def main() -> None:
    """Run real-time hand landmark detection."""
    # Verify model exists
    if not Path(MODEL_PATH).exists():
        print(f"Error: Model not found at {MODEL_PATH}")
        print("Download it with:")
        print("  curl -L -o hand_landmarker.task \\")
        print("    https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task")
        return

    print("Starting MediaPipe Hand Landmark Detection...")
    print("Controls: ESC/q = Quit | f = Toggle FPS | m = Cycle display mode")

    # Shared state for LIVE_STREAM callback
    latest_result: HandLandmarkerResult | None = None
    result_lock = threading.Lock()

    def on_result(
        result: HandLandmarkerResult,
        output_image: mp.Image,
        timestamp_ms: int,
    ) -> None:
        nonlocal latest_result
        with result_lock:
            latest_result = result

    # Create HandLandmarker
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

    # Set camera resolution
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)

    show_fps = True
    display_mode = MODE_FULL
    prev_time = time.time()
    fps = 0.0
    frame_timestamp_ms = 0

    with HandLandmarker.create_from_options(options) as landmarker:
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                print("Ignoring empty camera frame.")
                continue

            # Flip horizontally for selfie-view
            frame = cv2.flip(frame, 1)

            # Convert to MediaPipe Image and detect
            frame_timestamp_ms += 33  # ~30fps
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            landmarker.detect_async(mp_image, frame_timestamp_ms)

            # Get the latest result
            with result_lock:
                result = latest_result

            # Draw hand landmarks
            if result and result.hand_landmarks:
                for idx, hand_landmarks in enumerate(result.hand_landmarks):
                    if display_mode == MODE_SKELETON:
                        draw_skeleton_only(frame, hand_landmarks, idx)
                    else:
                        # Use MediaPipe drawing utilities
                        drawing_utils.draw_landmarks(
                            frame,
                            hand_landmarks,
                            HandLandmarksConnections.HAND_CONNECTIONS,
                            drawing_styles.get_default_hand_landmarks_style(),
                            drawing_styles.get_default_hand_connections_style(),
                        )

                    if display_mode == MODE_FULL:
                        draw_fingertip_labels(frame, hand_landmarks, idx)

                # Draw info panel
                draw_hand_info_panel(frame, result)

            # Calculate and display FPS
            current_time = time.time()
            fps = 0.9 * fps + 0.1 * (1.0 / max(current_time - prev_time, 1e-6))
            prev_time = current_time

            if show_fps:
                cv2.putText(
                    frame, f"FPS: {fps:.0f}", (frame.shape[1] - 130, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, COLOR_GREEN, 2, cv2.LINE_AA,
                )

            # Display mode indicator
            cv2.putText(
                frame, f"Mode: {MODE_NAMES[display_mode]}",
                (frame.shape[1] - 200, 60),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, COLOR_WHITE, 1, cv2.LINE_AA,
            )

            # Show the frame
            cv2.imshow("MediaPipe Hand Landmark Detection", frame)

            # Handle key presses
            key = cv2.waitKey(5) & 0xFF
            if key == 27 or key == ord("q"):
                break
            elif key == ord("f"):
                show_fps = not show_fps
            elif key == ord("m"):
                display_mode = (display_mode + 1) % 3

    cap.release()
    cv2.destroyAllWindows()
    print("Hand landmark detection stopped.")


if __name__ == "__main__":
    main()
