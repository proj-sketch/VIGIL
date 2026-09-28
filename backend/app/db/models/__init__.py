"""
db/models/__init__.py — Registers all ORM models with Base.metadata.

Alembic autogenerate imports this to discover all tables.
Import order matters: base models before those with foreign keys to them.
"""
from app.db.models.enums import (  # noqa: F401
    ActorRole, AssignmentStatus, ConversationStatus, ConversationType,
    IncidentSeverity, IncidentStatus, IncidentType,
    ResponderStatus, ResponderType, SessionStatus, ToolExecutionStatus,
)
from app.db.models.conversations import (  # noqa: F401
    Conversation, ReporterProfile, Transcript, VoiceSession,
)
from app.db.models.incidents import Incident, IncidentFact  # noqa: F401
from app.db.models.responders import Responder, ResponderAssignment  # noqa: F401
from app.db.models.audit import (  # noqa: F401
    AgentRun, AuditLog, EventOutbox, IdempotencyRecord, ToolCall,
)
