"""
db/models/incidents.py — Incident and IncidentFact ORM models.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.db.models.enums import IncidentSeverity, IncidentStatus, IncidentType

if TYPE_CHECKING:
    from app.db.models.conversations import Conversation
    from app.db.models.responders import ResponderAssignment


def _now() -> datetime:
    return datetime.now(UTC)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    reference_number: Mapped[str] = mapped_column(
        String(32), unique=True, nullable=False, index=True
    )
    status: Mapped[IncidentStatus] = mapped_column(
        SAEnum(IncidentStatus, name="incident_status", create_type=True),
        nullable=False,
        default=IncidentStatus.REPORTED,
        index=True,
    )
    type: Mapped[IncidentType | None] = mapped_column(
        SAEnum(IncidentType, name="incident_type", create_type=True),
        nullable=True,  # nullable until TRIAGED
    )
    severity: Mapped[IncidentSeverity | None] = mapped_column(
        SAEnum(IncidentSeverity, name="incident_severity", create_type=True),
        nullable=True,  # nullable until TRIAGED
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Coordinates stored as lat/lon floats (PostGIS not required for MVP)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    address_resolved: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Foreign keys
    reporter_conversation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", use_alter=True),
        nullable=True,
    )
    assigned_operator_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )
    triaged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Extra metadata
    duplicate_of_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("incidents.id"), nullable=True
    )
    duplicate_score: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Relationships
    facts: Mapped[list["IncidentFact"]] = relationship(
        "IncidentFact", back_populates="incident", cascade="all, delete-orphan",
        foreign_keys="IncidentFact.incident_id"
    )
    assignments: Mapped[list["ResponderAssignment"]] = relationship(
        "ResponderAssignment", back_populates="incident"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(  # type: ignore[name-defined]
        "AuditLog", back_populates="incident"
    )

    def __repr__(self) -> str:
        return f"<Incident {self.reference_number} status={self.status}>"


class IncidentFact(Base):
    __tablename__ = "incident_facts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("incidents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    fact_type: Mapped[str] = mapped_column(String(128), nullable=False)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    source: Mapped[str] = mapped_column(
        String(64), nullable=False, default="agent"
    )  # agent | operator | system
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    superseded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("incident_facts.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    # Relationships
    incident: Mapped["Incident"] = relationship(
        "Incident", back_populates="facts", foreign_keys=[incident_id]
    )


# Circular import resolved by importing here
from app.db.models.audit import AuditLog  # noqa: E402, F401
