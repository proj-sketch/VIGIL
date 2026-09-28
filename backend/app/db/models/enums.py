"""
db/models/enums.py — All PostgreSQL-backed enums used across ORM models.

Defined here once, imported by model files to avoid circular imports.
"""
from __future__ import annotations

import enum


class IncidentStatus(str, enum.Enum):
    REPORTED = "REPORTED"
    VERIFYING = "VERIFYING"
    TRIAGED = "TRIAGED"
    DISPATCHED = "DISPATCHED"
    ON_SCENE = "ON_SCENE"
    RESOLVED = "RESOLVED"
    CANCELLED = "CANCELLED"


class IncidentType(str, enum.Enum):
    MEDICAL = "MEDICAL"
    FIRE = "FIRE"
    CRIME = "CRIME"
    ACCIDENT = "ACCIDENT"
    NATURAL_DISASTER = "NATURAL_DISASTER"
    INFRASTRUCTURE = "INFRASTRUCTURE"
    OTHER = "OTHER"


class IncidentSeverity(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ConversationStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    ENDED = "ENDED"
    ERROR = "ERROR"


class ConversationType(str, enum.Enum):
    CITIZEN = "CITIZEN"
    OPERATOR = "OPERATOR"


class ResponderType(str, enum.Enum):
    POLICE = "POLICE"
    FIRE = "FIRE"
    MEDICAL = "MEDICAL"
    RESCUE = "RESCUE"
    HAZMAT = "HAZMAT"


class ResponderStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    ASSIGNED = "ASSIGNED"
    ON_ROUTE = "ON_ROUTE"
    ON_SCENE = "ON_SCENE"
    RETURNING = "RETURNING"
    OFFLINE = "OFFLINE"


class AssignmentStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACCEPTED = "ACCEPTED"
    ON_ROUTE = "ON_ROUTE"
    ON_SCENE = "ON_SCENE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class SessionStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    EXPIRED = "EXPIRED"
    ERROR = "ERROR"


class ActorRole(str, enum.Enum):
    CITIZEN = "CITIZEN"
    OPERATOR = "OPERATOR"
    RESPONDER = "RESPONDER"
    ADMIN = "ADMIN"
    SYSTEM = "SYSTEM"


class ToolExecutionStatus(str, enum.Enum):
    SUCCESS = "SUCCESS"
    INVALID_ARGUMENTS = "INVALID_ARGUMENTS"
    UNAUTHORIZED = "UNAUTHORIZED"
    DOMAIN_RULE_VIOLATION = "DOMAIN_RULE_VIOLATION"
    EXECUTION_FAILED = "EXECUTION_FAILED"
    TIMEOUT = "TIMEOUT"
    UNKNOWN_TOOL = "UNKNOWN_TOOL"
