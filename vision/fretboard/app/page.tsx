"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket, ConnectionStatus } from "./hooks/useWebSocket";
import { useMultiTouch, TouchPoint } from "./hooks/useMultiTouch";
import { useDeviceMotion } from "./hooks/useDeviceMotion";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const NUM_STRINGS = 6;
const SEND_INTERVAL_MS = 33; // ~30 fps

// String colors — warm palette
const STRING_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
];

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const color =
    status === "connected"
      ? "bg-green-500"
      : status === "connecting"
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${color} mr-2`}
    />
  );
}

function ConnectScreen({
  wsUrl,
  setWsUrl,
  onConnect,
}: {
  wsUrl: string;
  setWsUrl: (url: string) => void;
  onConnect: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center h-dvh gap-6 p-8">
      <h1 className="text-2xl font-bold">Fretboard</h1>
      <p className="text-neutral-400 text-center text-sm max-w-xs">
        Enter the WebSocket URL of your vision server. Both devices must be on
        the same WiFi network.
      </p>
      <input
        type="text"
        value={wsUrl}
        onChange={(e) => setWsUrl(e.target.value)}
        className="w-full max-w-xs px-4 py-3 rounded-lg bg-neutral-800 border border-neutral-700 text-white text-center text-sm"
        placeholder="ws://192.168.x.x:8765"
      />
      <button
        onClick={onConnect}
        className="px-8 py-3 rounded-lg bg-white text-black font-semibold text-sm active:bg-neutral-300 transition-colors"
      >
        Connect
      </button>
    </div>
  );
}

/**
 * Finds which string index (0-based) a y-coordinate (0-1) falls on.
 * Returns -1 if outside the string zone.
 */
function getStringIndex(y: number): number {
  const padding = 0.08; // top and bottom padding
  const usable = 1 - 2 * padding;
  const normalized = (y - padding) / usable;
  if (normalized < 0 || normalized > 1) return -1;
  const idx = Math.floor(normalized * NUM_STRINGS);
  return Math.min(idx, NUM_STRINGS - 1);
}

function Fretboard({
  wsUrl,
  onDisconnect,
}: {
  wsUrl: string;
  onDisconnect: () => void;
}) {
  const { status, send } = useWebSocket(wsUrl);
  const { touches, touchesRef, handlers } = useMultiTouch();
  const { motion, motionRef, permissionGranted, requestPermission } =
    useDeviceMotion();
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Stream data at fixed interval
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      const t = touchesRef.current;
      const m = motionRef.current;
      send({
        touches: t.map((p) => ({ id: p.id, x: p.x, y: p.y })),
        accel: m.accel,
        gyro: m.gyro,
        timestamp: Date.now(),
      });
    }, SEND_INTERVAL_MS);

    return () => clearInterval(intervalRef.current);
  }, [send, touchesRef, motionRef]);

  // Track which strings have active touches
  const activeStrings = new Set<number>();
  const touchOnString: Map<number, TouchPoint> = new Map();
  for (const t of touches) {
    const si = getStringIndex(t.y);
    if (si >= 0) {
      activeStrings.add(si);
      touchOnString.set(si, t);
    }
  }

  return (
    <div className="flex flex-col h-dvh bg-neutral-950 overflow-hidden select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-neutral-900/80 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          <span className="text-neutral-400">
            {status === "connected" ? "Connected" : status === "connecting" ? "Connecting…" : "Disconnected"}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {!permissionGranted && (
            <button
              onClick={requestPermission}
              className="px-3 py-1 rounded bg-neutral-800 text-neutral-300 text-xs active:bg-neutral-700"
            >
              Enable Motion
            </button>
          )}
          <span className="text-neutral-500">
            {touches.length} touch{touches.length !== 1 ? "es" : ""}
          </span>
          <button
            onClick={onDisconnect}
            className="px-3 py-1 rounded bg-neutral-800 text-neutral-400 text-xs active:bg-neutral-700"
          >
            ×
          </button>
        </div>
      </div>

      {/* Fretboard touch area */}
      <div
        className="fretboard-touch-area flex-1 relative"
        {...handlers}
      >
        {/* Strings */}
        {Array.from({ length: NUM_STRINGS }, (_, i) => {
          const padding = 0.08;
          const usable = 1 - 2 * padding;
          const yPct = padding + (i + 0.5) * (usable / NUM_STRINGS);
          const isActive = activeStrings.has(i);
          const touchPt = touchOnString.get(i);

          return (
            <div
              key={i}
              className="absolute left-0 right-0 transition-all duration-75"
              style={{ top: `${yPct * 100}%` }}
            >
              {/* String line */}
              <div
                className="absolute left-0 right-0 transition-all duration-75"
                style={{
                  height: isActive ? "4px" : "2px",
                  marginTop: isActive ? "-2px" : "-1px",
                  backgroundColor: isActive
                    ? STRING_COLORS[i]
                    : `${STRING_COLORS[i]}66`,
                  boxShadow: isActive
                    ? `0 0 12px ${STRING_COLORS[i]}88`
                    : "none",
                }}
              />
              {/* String label */}
              <span
                className="absolute right-3 text-[10px] font-mono transition-colors"
                style={{
                  color: isActive ? STRING_COLORS[i] : "#666",
                  top: "-14px",
                }}
              >
                {i + 1}
              </span>
              {/* Touch position marker */}
              {isActive && touchPt && (
                <div
                  className="absolute w-6 h-6 rounded-full -mt-3 -ml-3 border-2 pointer-events-none"
                  style={{
                    left: `${touchPt.x * 100}%`,
                    borderColor: STRING_COLORS[i],
                    backgroundColor: `${STRING_COLORS[i]}33`,
                    boxShadow: `0 0 8px ${STRING_COLORS[i]}66`,
                  }}
                />
              )}
            </div>
          );
        })}

        {/* All active touch indicators */}
        {touches.map((t) => (
          <div
            key={t.id}
            className="absolute w-10 h-10 rounded-full -mt-5 -ml-5 border border-white/20 bg-white/5 pointer-events-none"
            style={{
              left: `${t.x * 100}%`,
              top: `${t.y * 100}%`,
            }}
          />
        ))}

        {/* Empty state */}
        {touches.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-neutral-600 text-sm">
              Touch the strings to play
            </p>
          </div>
        )}
      </div>

      {/* Bottom debug bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-neutral-900/80 text-[10px] text-neutral-500 shrink-0">
        <span>
          accel: {motion.accel.x.toFixed(1)}, {motion.accel.y.toFixed(1)},{" "}
          {motion.accel.z.toFixed(1)}
        </span>
        <span>
          gyro: {motion.gyro.alpha.toFixed(0)}°, {motion.gyro.beta.toFixed(0)}°,{" "}
          {motion.gyro.gamma.toFixed(0)}°
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function Home() {
  const [wsUrl, setWsUrl] = useState("");
  const [active, setActive] = useState(false);

  // Auto-detect server URL from the page's host
  useEffect(() => {
    if (typeof window !== "undefined" && !wsUrl) {
      const host = window.location.hostname;
      setWsUrl(`ws://${host}:8765`);
    }
  }, [wsUrl]);

  const handleConnect = useCallback(() => {
    if (wsUrl.trim()) setActive(true);
  }, [wsUrl]);

  if (!active) {
    return (
      <ConnectScreen
        wsUrl={wsUrl}
        setWsUrl={setWsUrl}
        onConnect={handleConnect}
      />
    );
  }

  return <Fretboard wsUrl={wsUrl} onDisconnect={() => setActive(false)} />;
}
