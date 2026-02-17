"use client"

import { useState, useEffect, useCallback, useRef, Suspense } from "react"
import { motion } from "framer-motion"
import { Loader2, WifiOff, Eye, Minimize2 } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { PageTransition } from "@/components/maestro/page-transition"
import { instruments } from "@/lib/mock-data"

const VISION_WS_URL = "ws://localhost:8766"

function PlayLiveFullscreen() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const instrumentId = searchParams.get("instrument")
  const customName = searchParams.get("customName")
  const gmProgram = searchParams.get("gmProgram")

  const builtInInstrument = instruments.find((i) => i.id === instrumentId)
  const instrument: { id: string; name: string; color: string } | null =
    builtInInstrument ??
    (instrumentId && customName
      ? { id: instrumentId, name: customName, color: "#CE82FF" }
      : null)

  const [wsConnected, setWsConnected] = useState(false)
  const [frameSrc, setFrameSrc] = useState<string | null>(null)
  const [showOverlays, setShowOverlays] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!instrument) {
      router.push("/select?mode=play")
    }
  }, [instrument, router])

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let mounted = true

    function connect() {
      if (!mounted) return
      ws = new WebSocket(VISION_WS_URL)
      ws.binaryType = "blob"
      wsRef.current = ws

      ws.onopen = () => {
        if (mounted) setWsConnected(true)
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "resume" }))
        }
        if (instrumentId && ws?.readyState === WebSocket.OPEN) {
          const msg: Record<string, string> = {
            action: "set_instrument",
            instrumentId,
          }
          if (gmProgram) msg.gmProgram = gmProgram
          ws.send(JSON.stringify(msg))
        }
      }

      ws.onmessage = (event) => {
        if (!mounted) return
        if (event.data instanceof Blob) {
          const url = URL.createObjectURL(event.data)
          setFrameSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return url
          })
        }
      }

      ws.onclose = () => {
        if (mounted) {
          setWsConnected(false)
          reconnectTimer = setTimeout(connect, 2000)
        }
      }

      ws.onerror = () => {
        ws?.close()
      }
    }

    connect()

    return () => {
      mounted = false
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ action: "pause" }))
        }
        ws.onclose = null
        ws.close()
      }
      setFrameSrc((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
    }
  }, [instrumentId, gmProgram])

  const sendWsCommand = useCallback((action: string, extra?: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ action, ...extra }))
    }
  }, [])

  const toggleOverlays = useCallback(() => {
    const next = !showOverlays
    setShowOverlays(next)
    sendWsCommand("set_overlays", { enabled: next })
  }, [showOverlays, sendWsCommand])

  const handleExit = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
    router.push("/select?mode=play")
  }, [router])

  useEffect(() => {
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleExit()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleExit])

  if (!instrument) return null

  return (
    <PageTransition className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
      {wsConnected && frameSrc ? (
        <img
          src={frameSrc}
          alt="Vision camera feed"
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="flex flex-col items-center gap-4 p-8">
          {!wsConnected ? (
            <>
              <WifiOff className="w-12 h-12 text-[#777]" />
              <p className="text-sm text-[#999] text-center font-semibold">
                Waiting for Vision server...
              </p>
              <p className="text-xs text-[#666] text-center">
                Run{" "}
                <code className="bg-[#222] text-[#CE82FF] px-2 py-0.5 rounded">
                  uv run treehacks-server
                </code>{" "}
                in the project root
              </p>
            </>
          ) : (
            <>
              <Loader2 className="w-10 h-10 text-[#777] animate-spin" />
              <p className="text-sm text-[#999]">Connecting to camera...</p>
            </>
          )}
        </div>
      )}

      {/* Floating controls — same style as song generation fullscreen */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3"
      >
        {wsConnected && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={toggleOverlays}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold cursor-pointer select-none border-b-[3px] active:border-b-0 active:mt-[3px] transition-all backdrop-blur-sm"
            style={{
              backgroundColor: showOverlays
                ? "rgba(206,130,255,0.9)"
                : "rgba(51,51,51,0.85)",
              borderBottomColor: showOverlays
                ? "rgba(157,92,255,0.9)"
                : "rgba(34,34,34,0.85)",
              color: "#fff",
            }}
          >
            <Eye className="w-4 h-4" />
            {showOverlays ? "CV On" : "CV Off"}
          </motion.button>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleExit}
          className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-bold cursor-pointer select-none border-b-[3px] active:border-b-0 active:mt-[3px] transition-all backdrop-blur-sm"
          style={{
            backgroundColor: "rgba(51,51,51,0.85)",
            borderBottomColor: "rgba(34,34,34,0.85)",
            color: "#fff",
          }}
        >
          <Minimize2 className="w-4 h-4" />
          Exit
        </motion.button>
      </motion.div>

      <div className="absolute top-5 right-5 text-[#666] text-xs font-medium">
        Press <kbd className="bg-[#222] text-[#aaa] px-1.5 py-0.5 rounded text-[10px] font-mono">ESC</kbd> to exit
      </div>
    </PageTransition>
  )
}

export default function PlayLivePage() {
  return (
    <Suspense
      fallback={
        <div className="fixed inset-0 bg-black flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#777]" />
        </div>
      }
    >
      <PlayLiveFullscreen />
    </Suspense>
  )
}
