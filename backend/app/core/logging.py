"""
core/logging.py — Structured JSON logging configuration.

Uses structlog for consistent, machine-parseable log output.
All log entries include: timestamp, level, logger name, event, and any
keyword arguments passed at the call site.

Usage:
    from app.core.logging import get_logger
    logger = get_logger(__name__)
    logger.info("incident.created", incident_id=str(incident.id), type=incident.type)
"""
from __future__ import annotations

import logging
import sys

import structlog

from app.core.config import get_settings


def configure_logging() -> None:
    """Configure structlog + stdlib logging. Call once at application startup."""
    settings = get_settings()
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    # Shared processors for all renderers
    shared_processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if settings.is_development:
        # Human-readable in dev
        renderer = structlog.dev.ConsoleRenderer(colors=True)
    else:
        # JSON in staging/production — machine parseable
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=shared_processors
        + [
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processor=renderer,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    root_logger.addHandler(handler)
    root_logger.setLevel(log_level)

    # Silence noisy libraries in production
    for noisy in ("uvicorn.access", "asyncpg"):
        logging.getLogger(noisy).setLevel(
            logging.WARNING if not settings.is_development else logging.DEBUG
        )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    """Return a bound structlog logger for the given module name."""
    return structlog.get_logger(name)
