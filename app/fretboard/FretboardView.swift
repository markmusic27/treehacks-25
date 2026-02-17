import UIKit

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
private let numStrings = 6
private let stringColors: [UIColor] = [
    UIColor(red: 0.94, green: 0.27, blue: 0.27, alpha: 1), // red
    UIColor(red: 0.98, green: 0.45, blue: 0.09, alpha: 1), // orange
    UIColor(red: 0.92, green: 0.72, blue: 0.03, alpha: 1), // yellow
    UIColor(red: 0.13, green: 0.77, blue: 0.37, alpha: 1), // green
    UIColor(red: 0.23, green: 0.51, blue: 0.96, alpha: 1), // blue
    UIColor(red: 0.66, green: 0.33, blue: 0.97, alpha: 1), // purple
]

// ---------------------------------------------------------------------------
// Touch data
// ---------------------------------------------------------------------------
struct RawTouch {
    let id: Int
    let x: CGFloat  // 0-1 normalized
    let y: CGFloat  // 0-1 normalized
}

/// Callback fired every time touches change.
typealias TouchCallback = ([RawTouch]) -> Void

// ---------------------------------------------------------------------------
// FretboardView — raw UIView for bulletproof multi-touch
// ---------------------------------------------------------------------------
final class FretboardView: UIView {

    var onTouchesChanged: TouchCallback?

    /// All currently active touches, keyed by touch hash.
    private var activeTouches: [Int: RawTouch] = [:]

    /// Which strings were active last frame (for haptic triggers).
    private var prevActiveStrings: Set<Int> = []

    private let haptic = UIImpactFeedbackGenerator(style: .light)

    // Pre-computed string Y positions (0-1).
    private let stringPositions: [CGFloat] = {
        (0..<numStrings).map { i in
            CGFloat(i + 1) / CGFloat(numStrings + 1)
        }
    }()

    // MARK: - Init

    override init(frame: CGRect) {
        super.init(frame: frame)
        isMultipleTouchEnabled = true
        isExclusiveTouch = false
        backgroundColor = UIColor(white: 0.04, alpha: 1)
        haptic.prepare()
    }

    required init?(coder: NSCoder) { fatalError() }

    // MARK: - String math

    func closestString(y: CGFloat) -> Int {
        var best = 0
        var bestDist = abs(y - stringPositions[0])
        for i in 1..<numStrings {
            let d = abs(y - stringPositions[i])
            if d < bestDist {
                bestDist = d
                best = i
            }
        }
        return best
    }

    // MARK: - Touch handling

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        updateTouches(event)
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        updateTouches(event)
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches {
            activeTouches.removeValue(forKey: t.hash)
        }
        publishAndRedraw()
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        for t in touches {
            activeTouches.removeValue(forKey: t.hash)
        }
        publishAndRedraw()
    }

    private func updateTouches(_ event: UIEvent?) {
        guard let allTouches = event?.allTouches else { return }
        let w = bounds.width
        let h = bounds.height
        guard w > 0, h > 0 else { return }

        for t in allTouches {
            switch t.phase {
            case .began, .moved, .stationary:
                let loc = t.location(in: self)
                activeTouches[t.hash] = RawTouch(
                    id: t.hash,
                    x: max(0, min(1, loc.x / w)),
                    y: max(0, min(1, loc.y / h))
                )
            case .ended, .cancelled:
                activeTouches.removeValue(forKey: t.hash)
            default:
                break
            }
        }

        publishAndRedraw()
    }

    private func publishAndRedraw() {
        let pts = Array(activeTouches.values)
        onTouchesChanged?(pts)

        // Haptic on new string activation
        var currentStrings = Set<Int>()
        for t in pts {
            currentStrings.insert(closestString(y: t.y))
        }
        if !currentStrings.subtracting(prevActiveStrings).isEmpty {
            haptic.impactOccurred()
            haptic.prepare()
        }
        prevActiveStrings = currentStrings

        setNeedsDisplay()
    }

    // MARK: - Drawing

    override func draw(_ rect: CGRect) {
        guard let ctx = UIGraphicsGetCurrentContext() else { return }
        let w = bounds.width
        let h = bounds.height

        // Which strings are active
        var activeStrings = Set<Int>()
        var touchOnString: [Int: RawTouch] = [:]
        for t in activeTouches.values {
            let si = closestString(y: t.y)
            activeStrings.insert(si)
            // Keep the closest touch to the string
            if let existing = touchOnString[si] {
                if abs(t.y - stringPositions[si]) < abs(existing.y - stringPositions[si]) {
                    touchOnString[si] = t
                }
            } else {
                touchOnString[si] = t
            }
        }

        // Draw strings
        for i in 0..<numStrings {
            let yPos = stringPositions[i] * h
            let isActive = activeStrings.contains(i)
            let color = stringColors[i]

            // String line
            let lineHeight: CGFloat = isActive ? 4 : 2
            ctx.setStrokeColor(isActive ? color.cgColor : color.withAlphaComponent(0.25).cgColor)
            ctx.setLineWidth(lineHeight)
            ctx.move(to: CGPoint(x: 0, y: yPos))
            ctx.addLine(to: CGPoint(x: w, y: yPos))
            ctx.strokePath()

            // Glow effect when active
            if isActive {
                ctx.setShadow(offset: .zero, blur: 12, color: color.withAlphaComponent(0.5).cgColor)
                ctx.setStrokeColor(color.cgColor)
                ctx.setLineWidth(lineHeight)
                ctx.move(to: CGPoint(x: 0, y: yPos))
                ctx.addLine(to: CGPoint(x: w, y: yPos))
                ctx.strokePath()
                ctx.setShadow(offset: .zero, blur: 0, color: nil)
            }

            // Touch marker on string
            if let touch = touchOnString[i] {
                let cx = touch.x * w
                let markerSize: CGFloat = 28
                let markerRect = CGRect(
                    x: cx - markerSize / 2,
                    y: yPos - markerSize / 2,
                    width: markerSize,
                    height: markerSize
                )
                ctx.setFillColor(color.withAlphaComponent(0.2).cgColor)
                ctx.fillEllipse(in: markerRect)
                ctx.setStrokeColor(color.cgColor)
                ctx.setLineWidth(2)
                ctx.strokeEllipse(in: markerRect)
            }
        }
    }
}
