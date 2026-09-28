"""
api/ws/events.py — Realtime event subscription WebSocket.

Clients (Mission Control dashboard, mobile apps) subscribe to channels to receive
live incident updates without polling.

Usage:
  ws://.../ws/events?channel=incidents:all
  ws://.../ws/events?channel=incident:{uuid}
  ws://.../ws/events?channel=responder:{uuid}

Protocol:
  Server → Client: JSON event frames from EventOutbox
  Client → Server: {"type": "subscribe", "channel": "..."} to add more channels
                   {"type": "ping"} for keepalive
"""
from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from app.core.logging import get_logger
from app.realtime.connection_pool import get_connection_pool

logger = get_logger(__name__)
router = APIRouter()


@router.websocket("/ws/events")
async def events_ws(
    websocket: WebSocket,
    channel: str = Query("incidents:all"),
) -> None:
    await websocket.accept()
    pool = get_connection_pool()

    # Subscribe to initial channel
    subscribed_channels: dict[str, asyncio.Queue] = {}

    async def subscribe(ch: str) -> None:
        if ch not in subscribed_channels:
            q = await pool.subscribe(ch)
            subscribed_channels[ch] = q
            logger.debug("events_ws.subscribed", channel=ch)

    async def unsubscribe_all() -> None:
        for ch, q in subscribed_channels.items():
            await pool.unsubscribe(ch, q)
        subscribed_channels.clear()

    await subscribe(channel)
    await websocket.send_text(json.dumps({"type": "connected", "channel": channel}))

    # Event delivery task
    async def deliver_events() -> None:
        while True:
            for ch, q in list(subscribed_channels.items()):
                try:
                    msg = q.get_nowait()
                    await websocket.send_text(json.dumps(msg))
                except asyncio.QueueEmpty:
                    pass
            await asyncio.sleep(0.05)  # 50ms polling of in-process queues

    delivery_task = asyncio.create_task(deliver_events())

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                msg = json.loads(raw)
                if msg.get("type") == "subscribe":
                    ch = msg.get("channel", "")
                    if ch:
                        await subscribe(ch)
                        await websocket.send_text(json.dumps({"type": "subscribed", "channel": ch}))
                elif msg.get("type") == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"type": "ping"}))
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.error("events_ws.error", error=str(exc))
    finally:
        delivery_task.cancel()
        await unsubscribe_all()
        logger.info("events_ws.disconnected", channels=list(subscribed_channels.keys()))
