import SwiftUI

struct ContentView: View {
    @State private var showFretboard = false

    var body: some View {
        if showFretboard {
            FretboardScreen(onBack: { showFretboard = false })
        } else {
            WelcomeScreen(onConnect: { showFretboard = true })
        }
    }
}

// MARK: - Welcome Screen

struct WelcomeScreen: View {
    var onConnect: () -> Void

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            VStack(spacing: 24) {
                Text("Fretboard")
                    .font(.system(size: 28, weight: .bold, design: .monospaced))
                    .foregroundColor(.white)

                Text("Touch controller for\nstringed instruments")
                    .font(.system(size: 14, design: .monospaced))
                    .foregroundColor(.gray)
                    .multilineTextAlignment(.center)

                Button(action: onConnect) {
                    Text("Connect")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.black)
                        .padding(.horizontal, 40)
                        .padding(.vertical, 14)
                        .background(Color.white)
                        .cornerRadius(10)
                }
                .padding(.top, 8)
            }
        }
    }
}

// MARK: - Fretboard Screen (touch tracking)

struct FretboardScreen: View {
    var onBack: () -> Void

    var body: some View {
        ZStack(alignment: .topLeading) {
            // The UIKit touch view fills the screen
            TouchTrackingView()
                .ignoresSafeArea()

            // Back arrow
            Button(action: onBack) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 20, weight: .medium))
                    .foregroundColor(.gray)
                    .frame(width: 44, height: 44)
            }
            .padding(.leading, 8)
            .padding(.top, 8)
        }
        .statusBarHidden(true)
    }
}

// MARK: - UIKit touch view wrapped for SwiftUI

struct TouchTrackingView: UIViewRepresentable {
    func makeUIView(context: Context) -> RawTouchView {
        let view = RawTouchView()
        return view
    }

    func updateUIView(_ uiView: RawTouchView, context: Context) {}
}

// MARK: - Raw UIKit touch view

final class RawTouchView: UIView {
    /// Active touches: hash -> normalized (x, y)
    private var activeTouches: [Int: CGPoint] = [:]

    override init(frame: CGRect) {
        super.init(frame: frame)
        isMultipleTouchEnabled = true
        backgroundColor = .black
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: Touch handling

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        updateAllTouches(event)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        updateAllTouches(event)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches { activeTouches.removeValue(forKey: t.hash) }
        setNeedsDisplay()
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches { activeTouches.removeValue(forKey: t.hash) }
        setNeedsDisplay()
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
                activeTouches[t.hash] = CGPoint(
                    x: loc.x / w,  // 0-1
                    y: loc.y / h   // 0-1
                )
            case .ended, .cancelled:
                activeTouches.removeValue(forKey: t.hash)
            default:
                break
            }
        }
        setNeedsDisplay()
    }

    // MARK: Drawing

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let w = bounds.width
        let h = bounds.height

        // Clear
        ctx.setFillColor(UIColor.black.cgColor)
        ctx.fill(bounds)

        // Draw a circle at each touch point
        let circleSize: CGFloat = 60
        for (_, pt) in activeTouches {
            let cx = pt.x * w
            let cy = pt.y * h
            let circleRect = CGRect(
                x: cx - circleSize / 2,
                y: cy - circleSize / 2,
                width: circleSize,
                height: circleSize
            )

            // Filled circle
            ctx.setFillColor(UIColor(white: 0.25, alpha: 1).cgColor)
            ctx.fillEllipse(in: circleRect)

            // Border
            ctx.setStrokeColor(UIColor(white: 0.6, alpha: 1).cgColor)
            ctx.setLineWidth(2)
            ctx.strokeEllipse(in: circleRect)
        }
    }
}

#Preview {
    ContentView()
}
