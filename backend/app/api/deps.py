"""
api/deps.py — Reusable FastAPI dependency functions.

All dependencies that require authentication extract and verify the JWT here.
The decoded payload's `role` field is the authoritative actor role —
never trust role from request body.
"""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import UnauthorizedException
from app.core.security import extract_bearer_token, verify_access_token
from app.db.database import get_db


# ─────────────────────────────────────────────────────────────────────────────
# DB session
# ─────────────────────────────────────────────────────────────────────────────

DBSession = Annotated[AsyncSession, Depends(get_db)]


# ─────────────────────────────────────────────────────────────────────────────
# Auth dependencies
# ─────────────────────────────────────────────────────────────────────────────

async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    """Dependency: verify Bearer JWT and return decoded payload.

    Raises:
        UnauthorizedException: if header is missing or token is invalid.
    """
    token = extract_bearer_token(authorization)
    return verify_access_token(token)


async def require_operator(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict[str, Any]:
    """Dependency: require OPERATOR or ADMIN role."""
    if current_user.get("role") not in {"OPERATOR", "ADMIN"}:
        raise UnauthorizedException("Operator or Admin role required.")
    return current_user


async def require_admin(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict[str, Any]:
    """Dependency: require ADMIN role."""
    if current_user.get("role") != "ADMIN":
        raise UnauthorizedException("Admin role required.")
    return current_user


async def require_any_authenticated(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> dict[str, Any]:
    """Dependency: any authenticated role (CITIZEN, OPERATOR, RESPONDER, ADMIN)."""
    return current_user


# Annotated type aliases for cleaner endpoint signatures
CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
OperatorUser = Annotated[dict[str, Any], Depends(require_operator)]
AdminUser = Annotated[dict[str, Any], Depends(require_admin)]
AnyAuthUser = Annotated[dict[str, Any], Depends(require_any_authenticated)]
