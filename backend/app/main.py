"""
main.py — FastAPI application factory.

Creates the app, attaches middleware, mounts all routers, registers
the lifespan handler (DB init/close), and installs global exception handlers.

The standard error envelope for all errors is:
{
    "error": {
        "code": "ERROR_CODE",
        "message": "Human-readable message",
        "details": { ... }
    }
}
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.router import api_v1_router
from app.api.ws.voice import router as ws_voice_router
from app.api.ws.events import router as ws_events_router
from app.core.config import get_settings
from app.core.exceptions import AppHTTPException
from app.core.logging import configure_logging, get_logger
from app.db.database import close_db, init_db

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Lifespan
# ─────────────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown sequence."""
    settings = get_settings()

    # ── Startup ───────────────────────────────────────────────────────────────
    configure_logging()
    logger.info(
        "app.startup",
        env=settings.app_env,
        debug=settings.app_debug,
    )

    await init_db()
    logger.info("app.startup.db_ready")

    # Start realtime outbox publisher background task
    import asyncio
    from app.db.database import get_session_factory
    from app.realtime.outbox_publisher import outbox_publisher_loop
    outbox_task = asyncio.create_task(
        outbox_publisher_loop(get_session_factory())
    )
    logger.info("app.startup.outbox_publisher_started")

    yield  # ← app serves requests here

    # ── Shutdown ──────────────────────────────────────────────────────────────
    outbox_task.cancel()
    try:
        await outbox_task
    except asyncio.CancelledError:
        pass
    await close_db()
    logger.info("app.shutdown")


# ─────────────────────────────────────────────────────────────────────────────
# App factory
# ─────────────────────────────────────────────────────────────────────────────

def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Emergency Response Voice Agent API",
        description=(
            "Backend API for the Emergency Response Voice Agent. "
            "Provides incident management, voice session orchestration, "
            "responder coordination, and real-time event streaming."
        ),
        version="1.0.0",
        docs_url="/docs" if not settings.is_production else None,
        redoc_url="/redoc" if not settings.is_production else None,
        openapi_url="/openapi.json" if not settings.is_production else None,
        lifespan=lifespan,
    )

    # ── CORS ──────────────────────────────────────────────────────────────────
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Routers ───────────────────────────────────────────────────────────────
    app.include_router(api_v1_router)
    app.include_router(ws_voice_router)   # WebSocket: /ws/voice/{token}
    app.include_router(ws_events_router)  # WebSocket: /ws/events

    # ── Exception handlers ────────────────────────────────────────────────────
    _register_exception_handlers(app)

    return app


# ─────────────────────────────────────────────────────────────────────────────
# Exception handlers — all produce standard error envelope
# ─────────────────────────────────────────────────────────────────────────────

def _error_envelope(code: str, message: str, details: dict | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def _cors_headers(request: Request) -> dict[str, str]:
    origin = request.headers.get("origin")
    settings = get_settings()
    if origin and (origin in settings.cors_origins or "*" in settings.cors_origins):
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "*",
            "Access-Control-Allow-Headers": "*",
        }
    return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "*",
        "Access-Control-Allow-Headers": "*",
    }


def _register_exception_handlers(app: FastAPI) -> None:

    @app.exception_handler(AppHTTPException)
    async def app_http_exception_handler(
        request: Request, exc: AppHTTPException
    ) -> JSONResponse:
        logger.warning(
            "app.http_exception",
            code=exc.code,
            message=exc.message,
            path=str(request.url),
        )
        return JSONResponse(
            status_code=exc.http_status,
            content=_error_envelope(exc.code, exc.message, exc.details),
            headers=_cors_headers(request),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Pydantic v2 validation errors → 422 VALIDATION_ERROR
        errors = exc.errors()
        logger.warning(
            "app.validation_error",
            path=str(request.url),
            error_count=len(errors),
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=_error_envelope(
                "VALIDATION_ERROR",
                "Request validation failed.",
                {"errors": errors},
            ),
            headers=_cors_headers(request),
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        logger.exception(
            "app.unhandled_exception",
            path=str(request.url),
            exc_type=type(exc).__name__,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_envelope(
                "DATABASE_ERROR",
                "An unexpected server error occurred.",
            ),
            headers=_cors_headers(request),
        )


# ─────────────────────────────────────────────────────────────────────────────
# ASGI entrypoint
# ─────────────────────────────────────────────────────────────────────────────

app = create_app()
