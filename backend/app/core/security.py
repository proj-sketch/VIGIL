"""
core/security.py — JWT creation/verification + WebSocket ticket handling.

Two token types:
  1. Access JWT   — long-lived (hours), used for HTTP Bearer auth.
  2. WS Ticket    — short-lived (60s), one-time use for WebSocket upgrade.
                    After a successful WS upgrade, the ticket is considered
                    consumed (validated by expiry — no server-side state needed).

Roles embedded in token payload; never trust role from request body.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import jwt
from jwt import ExpiredSignatureError, InvalidTokenError

from app.core.config import get_settings
from app.core.exceptions import InvalidWSTicketException, UnauthorizedException

Role = Literal["CITIZEN", "OPERATOR", "RESPONDER", "ADMIN", "SYSTEM"]


# ─────────────────────────────────────────────────────────────────────────────
# Token creation
# ─────────────────────────────────────────────────────────────────────────────

def create_access_token(
    subject: str,
    role: Role,
    extra_claims: dict[str, Any] | None = None,
    expire_minutes: int | None = None,
) -> str:
    """Create a signed JWT for API authentication.

    Args:
        subject: The user/reporter profile UUID (becomes `sub` claim).
        role: The actor role embedded in the token.
        extra_claims: Optional additional payload claims (e.g. session_id).
        expire_minutes: Override default expiry from settings.

    Returns:
        Encoded JWT string.
    """
    settings = get_settings()
    minutes = expire_minutes or settings.jwt_access_token_expire_minutes
    now = datetime.now(UTC)

    payload: dict[str, Any] = {
        "sub": subject,
        "role": role,
        "iat": now,
        "exp": now + timedelta(minutes=minutes),
        "jti": str(uuid.uuid4()),  # unique token ID
    }
    if extra_claims:
        payload.update(extra_claims)

    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_ws_ticket(session_id: str, conversation_id: str, role: Role = "CITIZEN") -> str:
    """Create a short-lived WebSocket upgrade ticket.

    Lifetime: JWT_WS_TICKET_EXPIRE_SECONDS (default 60s).
    The ticket carries the session_id and conversation_id so the gateway
    can identify the session without a DB lookup during upgrade.

    Args:
        session_id: The voice session UUID.
        conversation_id: The conversation UUID.
        role: Typically CITIZEN; operators use their own sessions.

    Returns:
        Encoded JWT string (short-lived).
    """
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "type": "ws_ticket",
        "session_id": session_id,
        "conversation_id": conversation_id,
        "role": role,
        "iat": now,
        "exp": now + timedelta(seconds=settings.jwt_ws_ticket_expire_seconds),
        "jti": str(uuid.uuid4()),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


# ─────────────────────────────────────────────────────────────────────────────
# Token verification
# ─────────────────────────────────────────────────────────────────────────────

def verify_access_token(token: str) -> dict[str, Any]:
    """Decode and verify an access JWT.

    Raises:
        UnauthorizedException: If token is missing, expired, or invalid.

    Returns:
        Decoded payload dict with at minimum: sub, role, exp.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        if "sub" not in payload or "role" not in payload:
            raise UnauthorizedException("Token payload is malformed.")
        return payload
    except ExpiredSignatureError:
        raise UnauthorizedException("Token has expired.")
    except InvalidTokenError as exc:
        raise UnauthorizedException(f"Invalid token: {exc}")


def verify_ws_ticket(ticket: str) -> dict[str, Any]:
    """Decode and verify a WebSocket upgrade ticket.

    Raises:
        InvalidWSTicketException: If ticket is missing, expired, or invalid,
            or if it is not a ws_ticket type token.

    Returns:
        Decoded payload with: session_id, conversation_id, role.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            ticket,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        if payload.get("type") != "ws_ticket":
            raise InvalidWSTicketException("Token is not a WebSocket ticket.")
        if "session_id" not in payload or "conversation_id" not in payload:
            raise InvalidWSTicketException("WebSocket ticket payload is malformed.")
        return payload
    except ExpiredSignatureError:
        raise InvalidWSTicketException("WebSocket ticket has expired.")
    except InvalidTokenError as exc:
        raise InvalidWSTicketException(f"Invalid WebSocket ticket: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# FastAPI dependency helper
# ─────────────────────────────────────────────────────────────────────────────

def extract_bearer_token(authorization: str | None) -> str:
    """Extract the raw token from an Authorization: Bearer <token> header.

    Raises:
        UnauthorizedException: If the header is missing or malformed.
    """
    if not authorization:
        raise UnauthorizedException("Authorization header is required.")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise UnauthorizedException("Authorization header must be 'Bearer <token>'.")
    return parts[1]
