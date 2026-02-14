# Vision -- Air Instrument System

## What This Is

A real-time air instrument system that combines **computer vision** (hand tracking + strum detection on a laptop) with a **mobile fretboard app** (multi-touch string controller on an iPhone). The two communicate over **WebSocket** on the local network.

## Architecture

```
┌──────────────────────────────┐       WebSocket (port 8765)       ┌────────────────────────┐
│      Python Backend          │  <──────────────────────────────  │    iOS Fretboard App   │
│      (vision/main.py)        │       JSON touch + motion data    │    (vision/fretboard/) │
│                              │                                   │                        │
│  - MediaPipe hand detection  │                                   │  - Multi-touch strings │
│  - Strum detection           │                                   │  - Haptic feedback     │
│  - OpenCV visualization      │                                   │  - WebSocket client    │
│  - WebSocket server          │                                   │  - CoreMotion sensors  │
└──────────────────────────────┘                                   └────────────────────────┘
```

## Python Backend (`vision/main.py`)

**Dependencies:** MediaPipe, OpenCV, NumPy, WebSockets (see `pyproject.toml`)

**Run:** `uv run main.py` (prints the local IP to enter on the phone)

**What it does:**
- Opens the webcam and detects up to 2 hands using MediaPipe's Hand Landmarker (task-based API, `LIVE_STREAM` mode)
- Draws a **neck line** between the two wrists (smoothed with exponential moving average)
- Detects **strums** when the right hand's index fingertip crosses the neck line perpendicularly with sufficient velocity (down strums only)
- Runs a **WebSocket server** on port 8765 that receives touch/motion data from the phone
- Renders an overlay showing: hand landmarks, neck line (flashes on strum), strum count, phone connection status, active touches, motion data, FPS

**Key constants:** `SWAP_HANDS` (swap left/right hand roles), `STRUM_VELOCITY_THRESHOLD`, `STRUM_COOLDOWN_FRAMES`, `WS_PORT`

**Controls:** `ESC`/`q` quit, `f` toggle FPS, `m` cycle display mode

## iOS Fretboard App (`vision/fretboard/`)

**Framework:** Native Swift, SwiftUI + UIKit (for multi-touch)

**Screens:**
1. **Welcome Screen** -- pick number of strings (3-6), enter host IP, tap Connect
2. **Fretboard Screen** -- fullscreen dark interface with vertical strings and horizontal frets

**How touch works:**
- `RawTouchView` (UIKit `UIView`) handles `touchesBegan/Moved/Ended` for reliable multi-touch
- Each touch is normalized to (x, y) in [0,1]
- The closest string is determined by the touch's x-coordinate
- Strings light up with distinct hues when active; haptic feedback fires on new string activation
- Touch circles appear at the actual finger position

**Visual style:** Dark background with subtle gradient, 5 horizontal 3D-gradient fret bars, vertical strings (white/gray idle, tinted white when active), Duolingo-inspired green accent on welcome screen

## WebSocket Protocol

**Direction:** iOS --> Python (one-way)

**JSON format sent every touch event:**
```json
{
  "touches": [
    { "id": 123, "x": 0.45, "y": 0.72, "string": 2 }
  ]
}
```

- `id`: touch hash (unique per finger)
- `x`, `y`: normalized 0-1 position on screen
- `string`: index of closest string (0-based)

The Python side also accepts optional `accel` (`x`, `y`, `z`) and `gyro` (`alpha`, `beta`, `gamma`) fields from CoreMotion.

## File Structure

```
vision/
├── main.py                 # Python backend (hand tracking + WS server)
├── hand_landmarker.task    # MediaPipe model file
├── pyproject.toml          # Python dependencies
├── .python-version         # Python 3.12
└── fretboard/
    └── fretboard/
        ├── fretboardApp.swift        # SwiftUI app entry point
        ├── ContentView.swift         # All UI: WebSocketManager, WelcomeScreen, FretboardScreen, RawTouchView
        ├── WebSocketManager.swift    # (legacy) standalone WS manager
        ├── MotionManager.swift       # CoreMotion wrapper
        ├── FretboardView.swift       # (legacy) UIKit fretboard view
        ├── FretboardViewController.swift  # (legacy) UIKit view controller
        ├── AppDelegate.swift         # iOS lifecycle
        ├── SceneDelegate.swift       # iOS scene lifecycle
        └── Info.plist                # App config (landscape, ATS, motion)
```

**Note:** The active code lives primarily in `ContentView.swift` (which contains the `WebSocketManager` class, all SwiftUI views, and `RawTouchView`). The standalone `WebSocketManager.swift`, `FretboardView.swift`, and `FretboardViewController.swift` are legacy files from an earlier UIKit-only approach.
