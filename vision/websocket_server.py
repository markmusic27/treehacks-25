"""
WebSocket server for the phone fretboard app.

Receives touch and motion data from the iOS fretboard and updates shared
``PhoneState``.
"""

from __future__ import annotations

import asyncio
import json
import socket
import time
import threading

import websockets
from websockets.asyncio.server import serve as ws_serve

from config import WS_PORT
from models import PhoneState, PhoneTouch


def start_ws_server(phone: PhoneState, phone_lock: threading.Lock) -> None:
    """Run the WebSocket server in a background thread (blocking)."""

    async def handler(websocket):
        print(f"Phone connected: {websocket.remote_address}")
        with phone_lock:
            phone.connected = True

        try:
            async for message in websocket:
                try:
                    data = json.loads(message)
                except json.JSONDecodeError:
                    continue

                touches = [
                    PhoneTouch(
                        id=t["id"],
                        x=t["x"],
                        y=t["y"],
                        string=t.get("string", -1),
                    )
                    for t in data.get("touches", [])
                ]

                accel = data.get("accel", {})
                gyro = data.get("gyro", {})

                with phone_lock:
                    phone.touches = touches
                    phone.accel_x = accel.get("x", 0.0)
                    phone.accel_y = accel.get("y", 0.0)
                    phone.accel_z = accel.get("z", 0.0)
                    phone.gyro_alpha = gyro.get("alpha", 0.0)
                    phone.gyro_beta = gyro.get("beta", 0.0)
                    phone.gyro_gamma = gyro.get("gamma", 0.0)
                    phone.last_update = time.time()
        except websockets.exceptions.ConnectionClosed:
            pass
        finally:
            print("Phone disconnected.")
            with phone_lock:
                phone.connected = False
                phone.touches = []

    async def run():
        async with ws_serve(handler, "0.0.0.0", WS_PORT):
            local_ip = socket.gethostbyname(socket.gethostname())
            print(f"WebSocket server listening on ws://0.0.0.0:{WS_PORT}")
            print(f"  -> Enter this on the app: {local_ip}")
            await asyncio.Future()  # run forever

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(run())
