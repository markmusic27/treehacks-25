import CoreMotion

/// Streams accelerometer + gyro data via CoreMotion.
final class MotionManager {
    private let manager = CMMotionManager()

    struct MotionData {
        var accelX: Double = 0
        var accelY: Double = 0
        var accelZ: Double = 0
        var gyroAlpha: Double = 0
        var gyroBeta: Double = 0
        var gyroGamma: Double = 0
    }

    private(set) var latest = MotionData()

    func start() {
        guard manager.isDeviceMotionAvailable else { return }
        manager.deviceMotionUpdateInterval = 1.0 / 30.0  // 30 Hz
        manager.startDeviceMotionUpdates(to: .main) { [weak self] motion, _ in
            guard let self, let m = motion else { return }
            self.latest.accelX = m.userAcceleration.x + m.gravity.x
            self.latest.accelY = m.userAcceleration.y + m.gravity.y
            self.latest.accelZ = m.userAcceleration.z + m.gravity.z
            self.latest.gyroAlpha = m.attitude.yaw
            self.latest.gyroBeta = m.attitude.pitch
            self.latest.gyroGamma = m.attitude.roll
        }
    }

    func stop() {
        manager.stopDeviceMotionUpdates()
    }

    func toDict() -> [String: Any] {
        return [
            "accel": ["x": latest.accelX, "y": latest.accelY, "z": latest.accelZ],
            "gyro": ["alpha": latest.gyroAlpha, "beta": latest.gyroBeta, "gamma": latest.gyroGamma],
        ]
    }
}
