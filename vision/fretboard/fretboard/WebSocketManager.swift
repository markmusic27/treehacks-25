import Foundation

/// Lightweight WebSocket client with auto-reconnect.
final class WebSocketManager: NSObject, URLSessionWebSocketDelegate {
    private var url: URL
    private var session: URLSession!
    private var task: URLSessionWebSocketTask?
    private var isConnected = false
    private let reconnectDelay: TimeInterval = 2.0

    var onConnect: (() -> Void)?
    var onDisconnect: (() -> Void)?

    init(url: URL) {
        self.url = url
        super.init()
        self.session = URLSession(
            configuration: .default,
            delegate: self,
            delegateQueue: .main
        )
        connect()
    }

    func connect() {
        task?.cancel()
        task = session.webSocketTask(with: url)
        task?.resume()
    }

    func send(_ data: [String: Any]) {
        guard isConnected, let task else { return }
        do {
            let json = try JSONSerialization.data(withJSONObject: data)
            if let str = String(data: json, encoding: .utf8) {
                task.send(.string(str)) { _ in }
            }
        } catch {}
    }

    func disconnect() {
        task?.cancel(with: .goingAway, reason: nil)
        task = nil
        isConnected = false
    }

    // MARK: - URLSessionWebSocketDelegate

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didOpenWithProtocol protocol: String?
    ) {
        print("[ws] connected to \(url)")
        isConnected = true
        onConnect?()
    }

    func urlSession(
        _ session: URLSession,
        webSocketTask: URLSessionWebSocketTask,
        didCloseWith closeCode: URLSessionWebSocketTask.CloseCode,
        reason: Data?
    ) {
        print("[ws] disconnected, reconnecting in \(reconnectDelay)s…")
        isConnected = false
        onDisconnect?()
        DispatchQueue.main.asyncAfter(deadline: .now() + reconnectDelay) { [weak self] in
            self?.connect()
        }
    }

    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        if error != nil {
            isConnected = false
            onDisconnect?()
            DispatchQueue.main.asyncAfter(deadline: .now() + reconnectDelay) { [weak self] in
                self?.connect()
            }
        }
    }
}
