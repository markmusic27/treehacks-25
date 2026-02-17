import UIKit

final class FretboardViewController: UIViewController {

    private var fretboardView: FretboardView!
    private var ws: WebSocketManager?
    private let motion = MotionManager()
    private var sendTimer: Timer?

    // Change this to your Mac's local IP
    private let wsURLString = "ws://10.35.3.17:8765"

    // MARK: - Lifecycle

    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .landscape }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        // Fretboard fills entire screen
        fretboardView = FretboardView(frame: view.bounds)
        fretboardView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(fretboardView)

        // Store latest touches for streaming
        var latestTouches: [[String: Any]] = []
        fretboardView.onTouchesChanged = { touches in
            latestTouches = touches.map { t in
                ["id": t.id, "x": t.x, "y": t.y]
            }
        }

        // WebSocket
        ws = WebSocketManager()
        ws?.connect(to: wsURLString)

        // Motion
        motion.start()

        // Stream data at ~30fps
        sendTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 30.0, repeats: true) { [weak self] _ in
            guard let self else { return }
            let payload: [String: Any] = [
                "touches": latestTouches,
                "accel": self.motion.toDict()["accel"]!,
                "gyro": self.motion.toDict()["gyro"]!,
                "timestamp": Int(Date().timeIntervalSince1970 * 1000),
            ]
            self.ws?.send(data: payload)
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        sendTimer?.invalidate()
        motion.stop()
        ws?.disconnect()
    }
}
