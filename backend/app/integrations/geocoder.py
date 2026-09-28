"""
integrations/geocoder.py — Nominatim geocoding with LRU cache and rate limiting.

Nominatim ToS compliance:
  - Max 1 request/second (enforced via asyncio.Lock + minimum interval)
  - Mandatory User-Agent header (set from config)
  - Results cached by location_text (LRU, configurable TTL + max_size)

This module is intentionally not hot-path: geocoding is a background enrichment
step that runs AFTER incident creation, not before.
"""
from __future__ import annotations

import asyncio
import time
from typing import NamedTuple

import httpx

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class GeocodingResult(NamedTuple):
    latitude: float
    longitude: float
    display_name: str


# Shared HTTP client (one per process)
_http_client: httpx.AsyncClient | None = None
_cache: dict[str, tuple[GeocodingResult | None, float]] = {}  # {key: (result, expires_at)}
_lock = asyncio.Lock()
_last_request_time: float = 0.0
_MIN_REQUEST_INTERVAL = 1.05  # seconds (1/s + small buffer)


def _get_client() -> httpx.AsyncClient:
    global _http_client
    if _http_client is None or _http_client.is_closed:
        settings = get_settings()
        _http_client = httpx.AsyncClient(
            headers={"User-Agent": settings.nominatim_user_agent},
            timeout=settings.nominatim_timeout_seconds,
        )
    return _http_client


async def geocode(location_text: str) -> GeocodingResult | None:
    """
    Geocode a plain-text location string to (lat, lon, display_name).

    Results are cached. Returns None if geocoding fails or no result found.
    Nominatim rate limit: 1 req/s (enforced globally across all concurrent callers).
    """
    global _last_request_time

    settings = get_settings()
    cache_key = location_text.lower().strip()

    # Check cache
    if cache_key in _cache:
        result, expires_at = _cache[cache_key]
        if time.monotonic() < expires_at:
            logger.debug("geocoder.cache_hit", location=location_text)
            return result

    # Evict if cache exceeds max size
    if len(_cache) >= settings.nominatim_cache_max_size:
        oldest_key = next(iter(_cache))
        del _cache[oldest_key]

    async with _lock:
        # Re-check cache after acquiring lock
        if cache_key in _cache:
            result, expires_at = _cache[cache_key]
            if time.monotonic() < expires_at:
                return result

        # Rate limit: ensure minimum interval since last request
        elapsed = time.monotonic() - _last_request_time
        if elapsed < _MIN_REQUEST_INTERVAL:
            await asyncio.sleep(_MIN_REQUEST_INTERVAL - elapsed)

        try:
            client = _get_client()
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": location_text,
                    "format": "json",
                    "limit": 1,
                    "addressdetails": 1,
                },
            )
            _last_request_time = time.monotonic()

            response.raise_for_status()
            data = response.json()

            if not data:
                logger.info("geocoder.no_result", location=location_text)
                _cache[cache_key] = (None, time.monotonic() + settings.nominatim_cache_ttl_seconds)
                return None

            hit = data[0]
            result = GeocodingResult(
                latitude=float(hit["lat"]),
                longitude=float(hit["lon"]),
                display_name=hit.get("display_name", location_text),
            )
            _cache[cache_key] = (result, time.monotonic() + settings.nominatim_cache_ttl_seconds)
            logger.info(
                "geocoder.resolved",
                location=location_text,
                lat=result.latitude,
                lon=result.longitude,
            )
            return result

        except httpx.TimeoutException:
            logger.warning("geocoder.timeout", location=location_text)
            return None
        except Exception as exc:
            logger.error("geocoder.error", location=location_text, error=str(exc))
            return None


async def close_client() -> None:
    global _http_client
    if _http_client and not _http_client.is_closed:
        await _http_client.aclose()
