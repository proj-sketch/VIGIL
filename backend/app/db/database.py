"""
db/database.py — Async SQLAlchemy engine and session factory for Supabase.

Design:
  - One engine per process (singleton via module-level variable).
  - AsyncSession is created per-request via get_db() FastAPI dependency.
  - The engine is created at startup and disposed at shutdown.
  - Connection pool is sized conservatively for Supabase's free-tier limits.
"""
from __future__ import annotations

import ssl
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Module-level singletons — initialised in create_engine_and_session()
_engine: AsyncEngine | None = None
_async_session_factory: async_sessionmaker[AsyncSession] | None = None


class Base(DeclarativeBase):
    """SQLAlchemy declarative base — all ORM models inherit from this."""


def create_engine_and_session() -> tuple[AsyncEngine, async_sessionmaker[AsyncSession]]:
    """Create the async engine and session factory.

    Called once at application startup (via lifespan handler in main.py).
    Uses NullPool because Supabase connection pooler (PgBouncer) manages
    its own pool — SQLAlchemy's pool would add unnecessary complexity.
    """
    settings = get_settings()

    # Supabase requires SSL. asyncpg on Python 3.14 needs an SSLContext object,
    # not a string like 'require'. For MVP: cert verification disabled.
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    engine = create_async_engine(
        settings.database_url,
        echo=settings.is_development,   # log SQL in dev only
        poolclass=NullPool,              # NullPool: each request opens/closes its own connection
        connect_args={
            "ssl": ssl_ctx,              # Supabase requires SSL
            "server_settings": {
                "application_name": "emergency-response-voice-agent",
            },
        },
    )

    session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,  # don't expire objects after commit — avoids lazy loads
        autoflush=False,
        autocommit=False,
    )

    logger.info("db.engine.created", database_host=_extract_host(settings.database_url))
    return engine, session_factory


def _extract_host(url: str) -> str:
    """Extract host portion for safe logging (no credentials)."""
    try:
        # postgresql+asyncpg://user:pass@host:port/db → host:port
        return url.split("@")[-1].split("/")[0]
    except Exception:
        return "unknown"


def get_engine() -> AsyncEngine:
    if _engine is None:
        raise RuntimeError("Database engine not initialised. Call init_db() first.")
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _async_session_factory is None:
        raise RuntimeError("Session factory not initialised. Call init_db() first.")
    return _async_session_factory


async def init_db() -> None:
    """Initialise engine and session factory. Called by app lifespan."""
    global _engine, _async_session_factory
    _engine, _async_session_factory = create_engine_and_session()


async def close_db() -> None:
    """Dispose engine on app shutdown."""
    global _engine
    if _engine:
        await _engine.dispose()
        logger.info("db.engine.disposed")
        _engine = None


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI dependency
# ─────────────────────────────────────────────────────────────────────────────

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a transactional AsyncSession per request.

    The session is rolled back automatically on exception and committed
    on success. Callers should not call session.commit() themselves unless
    they need intermediate commits.
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            if session.is_active and (session.new or session.dirty or session.deleted):
                await session.commit()
        except Exception:
            try:
                if session.is_active:
                    await session.rollback()
            except Exception:
                pass
            raise


@asynccontextmanager
async def get_db_context() -> AsyncGenerator[AsyncSession, None]:
    """Context manager version of get_db() for use outside FastAPI request scope
    (e.g. in background tasks, outbox publisher, seed scripts).
    """
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            if session.is_active and (session.new or session.dirty or session.deleted):
                await session.commit()
        except Exception:
            try:
                if session.is_active:
                    await session.rollback()
            except Exception:
                pass
            raise


# Alias for use in background tasks and WS handlers
get_async_session = get_db_context
