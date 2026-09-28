"""
api/v1/health.py — Health check endpoints.

GET /api/v1/health/live   — liveness: is the process running? (no dep checks)
GET /api/v1/health/ready  — readiness: are critical deps ready? (checks DB)
GET /api/v1/health/services — per-dependency detail (ADMIN only)

These endpoints are never rate-limited and never require authentication
(except /services which requires ADMIN).
"""
from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import AdminUser, DBSession
from app.core.config import get_settings
from app.core.logging import get_logger

router = APIRouter(prefix="/health", tags=["health"])
logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# GET /health/live
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/live", summary="Liveness probe")
async def liveness() -> dict[str, str]:
    """Returns 200 if the FastAPI process is running.

    No dependency checks. Used by Docker health checks and any process monitor
    to detect a crashed process. Must always respond in < 100ms.
    """
    return {"status": "ok"}


# ─────────────────────────────────────────────────────────────────────────────
# GET /health/ready
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/ready", summary="Readiness probe")
async def readiness(db: DBSession) -> dict[str, Any]:
    """Returns 200 only if critical dependencies are ready.

    Critical: PostgreSQL (Supabase) connection.
    Optional (degraded but not failing): AssemblyAI, geocoder.

    Returns 503 with details if critical deps are unavailable.
    """
    from fastapi import HTTPException

    checks: dict[str, Any] = {}
    all_critical_ok = True

    # ── PostgreSQL check ──────────────────────────────────────────────────────
    pg_start = time.monotonic()
    try:
        await db.execute(text("SELECT 1"))
        checks["postgresql"] = {
            "status": "healthy",
            "latency_ms": round((time.monotonic() - pg_start) * 1000),
        }
    except Exception as exc:
        all_critical_ok = False
        checks["postgresql"] = {
            "status": "unhealthy",
            "error": str(exc),
            "latency_ms": round((time.monotonic() - pg_start) * 1000),
        }
        logger.error("health.ready.postgresql_failed", error=str(exc))

    if not all_critical_ok:
        raise HTTPException(
            status_code=503,
            detail={"status": "not_ready", "checks": checks},
        )

    return {"status": "ready", "checks": checks}


# ─────────────────────────────────────────────────────────────────────────────
# GET /health/services  (ADMIN only)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/services", summary="Per-service health detail (ADMIN only)")
async def service_health(
    _: AdminUser,
    db: DBSession,
) -> dict[str, Any]:
    """Returns per-dependency health status with latency.

    Checks: PostgreSQL, AssemblyAI (TCP reachability only — no session creation),
    Gemini analysis provider (not checked at health level — too slow),
    Nominatim geocoder (simple HTTP GET).

    Requires ADMIN role.
    """
    import httpx

    settings = get_settings()
    services: dict[str, Any] = {}

    # ── PostgreSQL ────────────────────────────────────────────────────────────
    t = time.monotonic()
    try:
        await db.execute(text("SELECT version()"))
        services["postgresql"] = {"status": "healthy", "latency_ms": _ms(t)}
    except Exception as exc:
        services["postgresql"] = {"status": "unhealthy", "error": str(exc), "latency_ms": _ms(t)}

    # ── PostGIS ───────────────────────────────────────────────────────────────
    t = time.monotonic()
    try:
        result = await db.execute(text("SELECT PostGIS_Version()"))
        version = result.scalar()
        services["postgis"] = {"status": "healthy", "version": version, "latency_ms": _ms(t)}
    except Exception as exc:
        services["postgis"] = {"status": "unavailable", "note": str(exc), "latency_ms": _ms(t)}

    # ── pgvector ──────────────────────────────────────────────────────────────
    t = time.monotonic()
    try:
        await db.execute(text("SELECT '[1,2,3]'::vector"))
        services["pgvector"] = {"status": "healthy", "latency_ms": _ms(t)}
    except Exception as exc:
        services["pgvector"] = {"status": "unavailable", "note": str(exc), "latency_ms": _ms(t)}

    # ── Nominatim geocoder (lightweight HTTP ping) ────────────────────────────
    t = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(
                "https://nominatim.openstreetmap.org/status.php",
                headers={"User-Agent": settings.nominatim_user_agent},
                params={"format": "json"},
            )
        if resp.status_code == 200:
            services["geocoder"] = {
                "status": "healthy",
                "provider": "nominatim",
                "latency_ms": _ms(t),
            }
        else:
            services["geocoder"] = {
                "status": "degraded",
                "http_status": resp.status_code,
                "latency_ms": _ms(t),
            }
    except Exception as exc:
        services["geocoder"] = {"status": "unavailable", "error": str(exc), "latency_ms": _ms(t)}

    # ── AssemblyAI (DNS reachability check only) ──────────────────────────────
    t = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get("https://api.assemblyai.com/v2/realtime/token")
        # 401 means reachable (auth required); anything else may indicate issues
        reachable = resp.status_code in (200, 401, 403)
        services["assemblyai"] = {
            "status": "healthy" if reachable else "degraded",
            "latency_ms": _ms(t),
        }
    except Exception as exc:
        services["assemblyai"] = {"status": "unavailable", "error": str(exc), "latency_ms": _ms(t)}

    # ── Notification provider ─────────────────────────────────────────────────
    services["notification_provider"] = {
        "status": "healthy",
        "type": "mock",
        "is_simulated": True,
    }

    # ── Analysis provider ─────────────────────────────────────────────────────
    services["analysis_provider"] = {
        "status": "configured" if settings.gemini_api_key else "not_configured",
        "provider": "gemini",
        "model": settings.gemini_model,
        "note": "not health-checked (latency too high for probe)",
    }

    return services


def _ms(start: float) -> int:
    return round((time.monotonic() - start) * 1000)
