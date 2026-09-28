"""
realtime/connection_pool.py — In-process WebSocket connection registry.

Tracks all active WebSocket connections keyed by:
  - channel name (e.g. "incident:{uuid}", "incidents:all", "conversation:{uuid}")

The outbox publisher calls broadcast() to fan out events to all subscribers
of a given channel.

For MVP: in-process dict (single server process).
For production: replace with Redis pub/sub or Supabase Realtime.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any


class ConnectionPool:
    def __init__(self) -> None:
        # channel → set of WebSocket send coroutines
        self._channels: dict[str, set[asyncio.Queue]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def subscribe(self, channel: str) -> asyncio.Queue:
        """Subscribe to a channel. Returns a Queue that receives JSON payloads."""
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._channels[channel].add(q)
        return q

    async def unsubscribe(self, channel: str, q: asyncio.Queue) -> None:
        async with self._lock:
            self._channels[channel].discard(q)
            if not self._channels[channel]:
                del self._channels[channel]

    async def broadcast(self, channel: str, message: dict) -> int:
        """Broadcast a message to all subscribers on a channel. Returns delivery count."""
        delivered = 0
        async with self._lock:
            queues = list(self._channels.get(channel, set()))
        for q in queues:
            try:
                q.put_nowait(message)
                delivered += 1
            except asyncio.QueueFull:
                pass  # Slow consumer — drop rather than block
        return delivered

    def subscriber_count(self, channel: str) -> int:
        return len(self._channels.get(channel, set()))


# Global singleton — imported by outbox publisher + WebSocket endpoint
_pool = ConnectionPool()


def get_connection_pool() -> ConnectionPool:
    return _pool
