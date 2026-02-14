import SwiftUI
import UIKit

// MARK: - WebSocket Manager

final class WebSocketManager {
    private var webSocketTask: URLSessionWebSocketTask?
    private var session: URLSession
    private var url: URL?
    private var isConnected = false
    private var reconnectTimer: Timer?

    init() {
        session = URLSession(configuration: .default)
    }

    func connect(to urlString: String) {
        guard let url = URL(string: urlString) else { return }
        self.url = url
        openConnection()
    }

    func disconnect() {
        reconnectTimer?.invalidate()
        reconnectTimer = nil
        webSocketTask?.cancel(with: .goingAway, reason: nil)
        webSocketTask = nil
        isConnected = false
    }

    func send(touches: [[String: Any]]) {
        send(data: ["touches": touches])
    }

    func send(data: [String: Any]) {
        guard isConnected else { return }
        guard let jsonData = try? JSONSerialization.data(withJSONObject: data),
              let jsonString = String(data: jsonData, encoding: .utf8) else { return }
        webSocketTask?.send(.string(jsonString)) { _ in }
    }

    private func openConnection() {
        guard let url = url else { return }
        let task = session.webSocketTask(with: url)
        webSocketTask = task
        task.resume()
        isConnected = true
        listenForDisconnect()
    }

    private func listenForDisconnect() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .failure:
                self?.handleDisconnect()
            case .success:
                // Keep listening
                self?.listenForDisconnect()
            }
        }
    }

    private func handleDisconnect() {
        isConnected = false
        webSocketTask = nil
        // Auto-reconnect after 2 seconds
        DispatchQueue.main.async { [weak self] in
            self?.reconnectTimer?.invalidate()
            self?.reconnectTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: false) { [weak self] _ in
                self?.openConnection()
            }
        }
    }
}

// MARK: - Theme colors (Duolingo-inspired green)

/// Primary green #58CC02
private let accentGreen = UIColor(red: 0.345, green: 0.80, blue: 0.008, alpha: 1)
/// Inactive string shades (slightly different grays)
private let stringIdleColors: [UIColor] = [
    UIColor(white: 0.42, alpha: 1),
    UIColor(white: 0.46, alpha: 1),
    UIColor(white: 0.39, alpha: 1),
    UIColor(white: 0.48, alpha: 1),
    UIColor(white: 0.41, alpha: 1),
    UIColor(white: 0.44, alpha: 1),
]
/// Active string colors: distinct warm/cool hues so you can tell them apart
private let stringActiveColors: [UIColor] = [
    UIColor(red: 1.00, green: 0.85, blue: 0.85, alpha: 1), // warm pink-white
    UIColor(red: 1.00, green: 0.95, blue: 0.80, alpha: 1), // warm amber-white
    UIColor(red: 0.90, green: 1.00, blue: 0.85, alpha: 1), // soft green-white
    UIColor(red: 0.85, green: 0.95, blue: 1.00, alpha: 1), // cool blue-white
    UIColor(red: 0.95, green: 0.85, blue: 1.00, alpha: 1), // lavender-white
    UIColor(red: 0.85, green: 1.00, blue: 0.95, alpha: 1), // mint-white
]
/// Fret bar colors
private let fretDark    = UIColor(white: 0.08, alpha: 1)
private let fretLight   = UIColor(white: 0.15, alpha: 1)
/// Background
private let bgLeft      = UIColor(red: 0.06, green: 0.06, blue: 0.07, alpha: 1)
private let bgRight     = UIColor(red: 0.08, green: 0.09, blue: 0.10, alpha: 1)

// MARK: - Root

struct ContentView: View {
    @State private var showFretboard = false
    @State private var numStrings = 6
    @State private var hostIP = ""
    private let wsManager = WebSocketManager()

    var body: some View {
        if showFretboard {
            FretboardScreen(numStrings: numStrings, wsManager: wsManager)
        } else {
            WelcomeScreen(numStrings: $numStrings, hostIP: $hostIP, onConnect: {
                wsManager.connect(to: "ws://\(hostIP):8765")
                showFretboard = true
            })
        }
    }
}

// MARK: - Welcome Screen

struct WelcomeScreen: View {
    @Binding var numStrings: Int
    @Binding var hostIP: String
    var onConnect: () -> Void

    private let green = Color(red: 0.345, green: 0.80, blue: 0.008)

    var body: some View {
        ZStack {
            Color(red: 0.06, green: 0.06, blue: 0.07).ignoresSafeArea()

            VStack(spacing: 28) {
                Text("Fretboard")
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundColor(green)

                Text("Touch controller for\nstringed instruments")
                    .font(.system(size: 14, weight: .medium, design: .rounded))
                    .foregroundColor(Color(white: 0.45))
                    .multilineTextAlignment(.center)

                // String count picker
                VStack(spacing: 12) {
                    Text("STRINGS")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(Color(white: 0.4))
                        .tracking(2)

                    HStack(spacing: 12) {
                        ForEach(3...6, id: \.self) { n in
                            Button(action: { numStrings = n }) {
                                Text("\(n)")
                                    .font(.system(size: 18, weight: .bold, design: .rounded))
                                    .foregroundColor(numStrings == n ? .black : Color(white: 0.5))
                                    .frame(width: 52, height: 52)
                                    .background(numStrings == n ? green : Color(white: 0.12))
                                    .cornerRadius(14)
                            }
                        }
                    }
                }
                .padding(.top, 4)

                // Host IP input
                VStack(spacing: 12) {
                    Text("HOST IP")
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .foregroundColor(Color(white: 0.4))
                        .tracking(2)

                    TextField("192.168.x.x", text: $hostIP)
                        .font(.system(size: 18, weight: .medium, design: .monospaced))
                        .foregroundColor(.white)
                        .multilineTextAlignment(.center)
                        .keyboardType(.decimalPad)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 14)
                        .background(Color(white: 0.12))
                        .cornerRadius(14)
                        .frame(width: 240)
                }
                .padding(.top, 4)

                Button(action: onConnect) {
                    Text("Connect")
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundColor(.black)
                        .padding(.horizontal, 44)
                        .padding(.vertical, 16)
                        .background(green)
                        .cornerRadius(14)
                }
                .padding(.top, 12)
            }
        }
    }
}

// MARK: - Fretboard Screen

struct FretboardScreen: View {
    let numStrings: Int
    let wsManager: WebSocketManager

    var body: some View {
        TouchTrackingView(numStrings: numStrings, wsManager: wsManager)
            .ignoresSafeArea()
            .statusBarHidden(true)
    }
}

// MARK: - UIKit touch view wrapped for SwiftUI

struct TouchTrackingView: UIViewRepresentable {
    let numStrings: Int
    let wsManager: WebSocketManager

    func makeUIView(context: Context) -> RawTouchView {
        let view = RawTouchView(numStrings: numStrings, wsManager: wsManager)
        return view
    }

    func updateUIView(_ uiView: RawTouchView, context: Context) {
        uiView.numStrings = numStrings
    }
}

// MARK: - Raw UIKit touch view

final class RawTouchView: UIView {

    var numStrings: Int {
        didSet { setNeedsDisplay() }
    }

    /// Active touches: hash -> normalized (x, y)
    private var activeTouches: [Int: CGPoint] = [:]

    /// Previously active strings (for haptic on new string)
    private var prevActiveStrings: Set<Int> = []

    private let haptic = UIImpactFeedbackGenerator(style: .light)
    private let wsManager: WebSocketManager

    // MARK: Init

    init(numStrings: Int, wsManager: WebSocketManager) {
        self.numStrings = numStrings
        self.wsManager = wsManager
        super.init(frame: .zero)
        isMultipleTouchEnabled = true
        backgroundColor = .black
        haptic.prepare()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: String geometry

    private func stringPositions() -> [CGFloat] {
        (0..<numStrings).map { i in
            CGFloat(i + 1) / CGFloat(numStrings + 1)
        }
    }

    private func closestString(x: CGFloat) -> Int {
        let positions = stringPositions()
        var best = 0
        var bestDist = abs(x - positions[0])
        for i in 1..<positions.count {
            let d = abs(x - positions[i])
            if d < bestDist {
                bestDist = d
                best = i
            }
        }
        return best
    }

    // MARK: Touch handling

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        updateAllTouches(event)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        updateAllTouches(event)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches { activeTouches.removeValue(forKey: t.hash) }
        refreshState()
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches { activeTouches.removeValue(forKey: t.hash) }
        refreshState()
    }

    private func updateAllTouches(_ event: UIEvent?) {
        guard let allTouches = event?.allTouches else { return }
        let w = bounds.width
        let h = bounds.height
        guard w > 0, h > 0 else { return }

        for t in allTouches {
            switch t.phase {
            case .began, .moved, .stationary:
                let loc = t.location(in: self)
                activeTouches[t.hash] = CGPoint(x: loc.x / w, y: loc.y / h)
            case .ended, .cancelled:
                activeTouches.removeValue(forKey: t.hash)
            default: break
            }
        }
        refreshState()
    }

    private func refreshState() {
        // Haptics
        var currentStrings = Set<Int>()
        for (_, pt) in activeTouches {
            currentStrings.insert(closestString(x: pt.x))
        }
        if !currentStrings.subtracting(prevActiveStrings).isEmpty {
            haptic.impactOccurred()
            haptic.prepare()
        }
        prevActiveStrings = currentStrings

        // WebSocket
        var touchPayload: [[String: Any]] = []
        for (hash, pt) in activeTouches {
            let si = closestString(x: pt.x)
            touchPayload.append([
                "id": hash, "x": Double(pt.x), "y": Double(pt.y), "string": si
            ])
        }
        wsManager.send(touches: touchPayload)

        setNeedsDisplay()
    }

    // MARK: Drawing

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let w = bounds.width
        let h = bounds.height
        let colorSpace = CGColorSpaceCreateDeviceRGB()

        // 1. Background gradient
        let bgColors = [bgLeft.cgColor, bgRight.cgColor] as CFArray
        if let bgGradient = CGGradient(colorsSpace: colorSpace, colors: bgColors, locations: [0, 1]) {
            ctx.drawLinearGradient(
                bgGradient,
                start: CGPoint(x: 0, y: 0),
                end: CGPoint(x: w, y: 0),
                options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
            )
        }

        // 2. Fret lines
        let fretCount = 5
        let fretHeight: CGFloat = 4
        let fretColors = [fretDark.cgColor, fretLight.cgColor, fretDark.cgColor] as CFArray
        let fretGradient = CGGradient(colorsSpace: colorSpace, colors: fretColors, locations: [0, 0.5, 1])

        for j in 0..<fretCount {
            let fretY = CGFloat(j + 1) / CGFloat(fretCount + 1) * h
            let fretRect = CGRect(x: 0, y: fretY - fretHeight / 2, width: w, height: fretHeight)
            ctx.saveGState()
            ctx.clip(to: fretRect)
            if let fg = fretGradient {
                ctx.drawLinearGradient(fg,
                    start: CGPoint(x: 0, y: fretRect.minY),
                    end: CGPoint(x: 0, y: fretRect.maxY),
                    options: [])
            }
            ctx.restoreGState()
        }

        // 3. Determine active strings
        let positions = stringPositions()
        var activeStrings = Set<Int>()
        for (_, pt) in activeTouches {
            activeStrings.insert(closestString(x: pt.x))
        }

        // 4. Draw vertical strings
        for i in 0..<numStrings {
            let xPos = positions[i] * w
            let isActive = activeStrings.contains(i)
            let isBass = i < numStrings / 2
            let lineWidth: CGFloat = isBass ? 3.0 : 2.0

            let idleColor = stringIdleColors[i % stringIdleColors.count]
            let activeColor = stringActiveColors[i % stringActiveColors.count]

            ctx.setLineWidth(lineWidth)
            ctx.setStrokeColor(isActive ? activeColor.cgColor : idleColor.cgColor)
            ctx.move(to: CGPoint(x: xPos, y: 0))
            ctx.addLine(to: CGPoint(x: xPos, y: h))
            ctx.strokePath()

            // Glow when active
            if isActive {
                ctx.saveGState()
                ctx.setShadow(offset: .zero, blur: 10, color: activeColor.withAlphaComponent(0.4).cgColor)
                ctx.setStrokeColor(activeColor.cgColor)
                ctx.setLineWidth(lineWidth)
                ctx.move(to: CGPoint(x: xPos, y: 0))
                ctx.addLine(to: CGPoint(x: xPos, y: h))
                ctx.strokePath()
                ctx.restoreGState()
            }
        }

        // 4. Touch circles at actual position
        let markerSize: CGFloat = 60
        for (_, pt) in activeTouches {
            let si = closestString(x: pt.x)
            let activeColor = stringActiveColors[si % stringActiveColors.count]
            let cx = pt.x * w
            let cy = pt.y * h
            let markerRect = CGRect(
                x: cx - markerSize / 2,
                y: cy - markerSize / 2,
                width: markerSize,
                height: markerSize
            )
            ctx.setFillColor(activeColor.withAlphaComponent(0.15).cgColor)
            ctx.fillEllipse(in: markerRect)
            ctx.setStrokeColor(activeColor.withAlphaComponent(0.6).cgColor)
            ctx.setLineWidth(2)
            ctx.strokeEllipse(in: markerRect)
        }
    }
}

#Preview {
    ContentView()
}
