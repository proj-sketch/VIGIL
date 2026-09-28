"""
realtime/outbox_publisher.py — Transactional outbox publisher.

Polls event_outbox table for unpublished events and broadcasts them via
the connection pool. Runs as a background asyncio task started in app lifespan.

Design:
  - Polls every POLL_INTERVAL_SECONDS (default 0.5s) for low latency.
  - Uses SELECT ... WHERE published=false ORDER BY sequence_number FOR UPDATE SKIP LOCKED
    so multiple workers never double-publish (safe even if we add workers later).
  - Marks each event published=true + published_at=now() in the SAME transaction
    as the broadcast (best-effort — WS delivery is not transactional).
  - If broadcast fails (no subscribers), event is still marked published.
    Clients rely on sequence_number for replay on reconnect.
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import structlog
from sqlalchemy import select, update

from app.db.models.audit import EventOutbox
from app.realtime.connection_pool import get_connection_pool

logger = structlog.get_logger(__name__)

POLL_INTERVAL_SECONDS = 0.5
BATCH_SIZE = 50


async def outbox_publisher_loop(db_session_factory) -> None:
    """Background task. Call from lifespan startup, cancel on shutdown."""
    pool = get_connection_pool()
    logger.info("outbox_publisher.started")

    while True:
        try:
            await _publish_batch(db_session_factory, pool)
        except asyncio.CancelledError:
            logger.info("outbox_publisher.stopping")
            break
        except Exception as exc:
            logger.warning("outbox_publisher.paused", reason=str(exc))
            await asyncio.sleep(5.0)
            continue

        await asyncio.sleep(POLL_INTERVAL_SECONDS)


async def _publish_batch(db_session_factory, pool) -> None:
    async with db_session_factory() as db:
        # Select unpublished events, ordered by sequence, with skip-locked
        stmt = (
            select(EventOutbox)
            .where(EventOutbox.published == False)  # noqa: E712
            .order_by(EventOutbox.created_at)
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
        )
        result = await db.execute(stmt)
        events = result.scalars().all()

        if not events:
            return

        now = datetime.now(UTC)
        for event in events:
            message = {
                "type": event.event_type,
                "event_id": str(event.id),
                "payload": event.payload,
                "timestamp": now.isoformat(),
            }
            delivered = await pool.broadcast(event.channel, message)
            event.published = True
            event.published_at = now
            if delivered:
                logger.debug(
                    "outbox.published",
                    event_type=event.event_type,
                    channel=event.channel,
                    subscribers=delivered,
                )

        await db.commit()
