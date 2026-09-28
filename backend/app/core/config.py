"""
core/config.py — Typed environment configuration via pydantic-settings.

All application configuration is sourced from environment variables.
No hardcoded values except safe defaults for optional settings.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AnyUrl, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ───────────────────────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = "development"
    app_debug: bool = False
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    # ── Database (Supabase) ───────────────────────────────────────────────────
    database_url: str = Field(
        ...,
        description="Async PostgreSQL URL (postgresql+asyncpg://...)",
    )

    # ── JWT ───────────────────────────────────────────────────────────────────
    jwt_secret_key: str = Field(..., min_length=32)
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 480       # 8 hours
    jwt_session_token_expire_minutes: int = 240      # 4 hours (citizen)
    jwt_ws_ticket_expire_seconds: int = 60           # one-time WS upgrade

    # ── AssemblyAI ────────────────────────────────────────────────────────────
    assemblyai_api_key: str = Field(..., min_length=10)

    # ── Gemini ────────────────────────────────────────────────────────────────
    gemini_api_key: str = Field(default="", description="Google Gemini API key")
    gemini_model: str = "gemini-1.5-flash"

    # ── Geocoding (Nominatim) ─────────────────────────────────────────────────
    nominatim_user_agent: str = "EmergencyResponseVoiceAgent/1.0"
    nominatim_timeout_seconds: float = 5.0
    nominatim_cache_ttl_seconds: int = 3600
    nominatim_cache_max_size: int = 500

    # ── Agent ─────────────────────────────────────────────────────────────────
    tool_timeout_seconds: float = 10.0
    structured_analysis_timeout_seconds: float = 8.0
    classification_confidence_threshold: float = 0.60
    max_clarification_turns: int = 6

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Store as JSON array in .env to avoid pydantic-settings JSON-parse issues:
    # CORS_ORIGINS=["http://localhost:3000","http://localhost:5173"]
    cors_origins: list[str] = Field(
        default=["http://localhost:3000", "http://localhost:5173"],
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, list):
            return v
        # Try JSON array first, fall back to comma-separated
        stripped = v.strip()
        if stripped.startswith("["):
            import json
            return json.loads(stripped)
        return [origin.strip() for origin in stripped.split(",") if origin.strip()]

    # ── Rate Limiting ─────────────────────────────────────────────────────────
    rate_limit_voice_sessions: str = "5/minute"
    rate_limit_incidents: str = "10/minute"
    rate_limit_location: str = "30/minute"
    rate_limit_auth: str = "10/minute"
    rate_limit_default: str = "120/minute"

    # ── Session reconnect ─────────────────────────────────────────────────────
    voice_session_reconnect_window_seconds: int = 30

    # ── Derived ───────────────────────────────────────────────────────────────
    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the singleton Settings instance (cached after first call)."""
    return Settings()
