"""
core/exceptions.py — All custom application exceptions.

Design rules:
  - Every exception carries a machine-readable `code` (matches §24.2 error catalog).
  - HTTP exceptions inherit from AppHTTPException which FastAPI handlers convert
    to the standard error envelope: { "error": { "code": ..., "message": ..., "details": ... } }
  - Domain exceptions (non-HTTP) are raised by the domain layer and caught by
    tool executors, which translate them into ToolError objects.
"""
from __future__ import annotations

from typing import Any


# ─────────────────────────────────────────────────────────────────────────────
# Base
# ─────────────────────────────────────────────────────────────────────────────

class AppError(Exception):
    """Base for all application errors."""
    code: str = "APP_ERROR"
    http_status: int = 500

    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}


class AppHTTPException(AppError):
    """Errors that map directly to an HTTP response."""


# ─────────────────────────────────────────────────────────────────────────────
# Auth / access
# ─────────────────────────────────────────────────────────────────────────────

class UnauthorizedException(AppHTTPException):
    code = "UNAUTHORIZED"
    http_status = 401

    def __init__(self, message: str = "Authentication required.") -> None:
        super().__init__(message)


class ForbiddenException(AppHTTPException):
    code = "FORBIDDEN"
    http_status = 403

    def __init__(self, message: str = "Insufficient permissions.") -> None:
        super().__init__(message)


class InvalidWSTicketException(AppHTTPException):
    code = "INVALID_WS_TICKET"
    http_status = 403

    def __init__(self, message: str = "WebSocket ticket is invalid or expired.") -> None:
        super().__init__(message)


# ─────────────────────────────────────────────────────────────────────────────
# Resource
# ─────────────────────────────────────────────────────────────────────────────

class NotFoundException(AppHTTPException):
    code = "NOT_FOUND"
    http_status = 404

    def __init__(self, resource: str, resource_id: str | None = None) -> None:
        msg = f"{resource} not found."
        details = {"resource": resource}
        if resource_id:
            details["id"] = resource_id
        super().__init__(msg, details)


class ConflictException(AppHTTPException):
    code = "CONFLICT"
    http_status = 409

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message, details)


class DuplicateRequestException(AppHTTPException):
    """Idempotency key already in flight."""
    code = "DUPLICATE_REQUEST"
    http_status = 409

    def __init__(self) -> None:
        super().__init__("A request with this idempotency key is already in progress.")


# ─────────────────────────────────────────────────────────────────────────────
# Validation
# ─────────────────────────────────────────────────────────────────────────────

class ValidationException(AppHTTPException):
    code = "VALIDATION_ERROR"
    http_status = 422

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message, details)


# ─────────────────────────────────────────────────────────────────────────────
# Domain / state machine
# ─────────────────────────────────────────────────────────────────────────────

class InvalidStateTransitionException(AppHTTPException):
    code = "INVALID_STATE_TRANSITION"
    http_status = 422

    def __init__(
        self,
        current_status: str,
        attempted_status: str,
        allowed_targets: list[str],
    ) -> None:
        super().__init__(
            f"Cannot transition from {current_status} to {attempted_status}.",
            {
                "current_status": current_status,
                "attempted_status": attempted_status,
                "allowed_targets": allowed_targets,
            },
        )


class StatePreconditionException(AppError):
    """A required pre-condition for a state transition is not met.
    Raised by the domain layer; caught by tool executor → ToolError."""
    code = "DOMAIN_RULE_VIOLATION"

    def __init__(self, message: str, details: dict | None = None) -> None:
        super().__init__(message, details)


class ResponderUnavailableException(AppHTTPException):
    code = "RESPONDER_UNAVAILABLE"
    http_status = 409

    def __init__(self, responder_id: str) -> None:
        super().__init__(
            f"Responder {responder_id} is not available for assignment.",
            {"responder_id": responder_id},
        )


# ─────────────────────────────────────────────────────────────────────────────
# External integrations
# ─────────────────────────────────────────────────────────────────────────────

class AssemblyAIUnavailableException(AppHTTPException):
    code = "ASSEMBLYAI_UNAVAILABLE"
    http_status = 503

    def __init__(self, message: str = "AssemblyAI service is unavailable.") -> None:
        super().__init__(message)


class AnalysisTimeoutException(AppHTTPException):
    code = "ANALYSIS_TIMEOUT"
    http_status = 503

    def __init__(self) -> None:
        super().__init__("Structured analysis provider timed out.")


class GeocodingFailedException(AppError):
    """Geocoding failure is NOT an HTTP error — incident creation continues."""
    code = "GEOCODING_FAILED"

    def __init__(self, query: str, reason: str) -> None:
        super().__init__(
            f"Could not geocode '{query}': {reason}",
            {"query": query, "reason": reason},
        )


class NotificationFailedException(AppError):
    code = "NOTIFICATION_FAILED"

    def __init__(self, reason: str) -> None:
        super().__init__(f"Notification delivery failed: {reason}")


# ─────────────────────────────────────────────────────────────────────────────
# Tool execution (raised inside handle_tool_call)
# ─────────────────────────────────────────────────────────────────────────────

class UnknownToolException(AppError):
    """Tool name not in the role's registry. Security event."""
    code = "UNKNOWN_TOOL"

    def __init__(self, tool_name: str) -> None:
        super().__init__(
            f"Tool '{tool_name}' is not registered for this session role.",
            {"tool_name": tool_name},
        )


class ToolTimeoutException(AppError):
    """Tool execution exceeded TOOL_TIMEOUT_SECONDS."""
    code = "TIMEOUT"

    def __init__(self, tool_name: str, timeout_seconds: float) -> None:
        super().__init__(
            f"Tool '{tool_name}' timed out after {timeout_seconds}s.",
            {"tool_name": tool_name, "timeout_seconds": timeout_seconds},
        )


# ─────────────────────────────────────────────────────────────────────────────
# Database
# ─────────────────────────────────────────────────────────────────────────────

class DatabaseException(AppHTTPException):
    code = "DATABASE_ERROR"
    http_status = 500

    def __init__(self, message: str = "An unexpected database error occurred.") -> None:
        super().__init__(message)


class RateLimitedException(AppHTTPException):
    code = "RATE_LIMITED"
    http_status = 429

    def __init__(self) -> None:
        super().__init__("Too many requests. Please slow down.")
