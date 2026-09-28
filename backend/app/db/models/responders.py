"""
db/models/responders.py — Responder and ResponderAssignment ORM models.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.db.models.enums import AssignmentStatus, ResponderStatus, ResponderType


def _now() -> datetime:
    return datetime.now(UTC)


class Responder(Base):
    __tablename__ = "responders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    unit_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    responder_type: Mapped[ResponderType] = mapped_column(
        SAEnum(ResponderType, name="responder_type", create_type=True),
        nullable=False,
    )
    status: Mapped[ResponderStatus] = mapped_column(
        SAEnum(ResponderStatus, name="responder_status", create_type=True),
        nullable=False,
        default=ResponderStatus.AVAILABLE,
        index=True,
    )
    # Location as lat/lon floats (MVP without PostGIS extension)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_location_update: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )

    assignments: Mapped[list["ResponderAssignment"]] = relationship(
        "ResponderAssignment", back_populates="responder"
    )

    def __repr__(self) -> str:
        return f"<Responder {self.unit_id} type={self.responder_type} status={self.status}>"


class ResponderAssignment(Base):
    __tablename__ = "responder_assignments"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    incident_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("incidents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    responder_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("responders.id"),
        nullable=False,
        index=True,
    )
    status: Mapped[AssignmentStatus] = mapped_column(
        SAEnum(AssignmentStatus, name="assignment_status", create_type=True),
        nullable=False,
        default=AssignmentStatus.PENDING,
    )
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    incident: Mapped["Incident"] = relationship(  # type: ignore[name-defined]
        "Incident", back_populates="assignments"
    )
    responder: Mapped["Responder"] = relationship(
        "Responder", back_populates="assignments"
    )


# Forward reference resolution
from app.db.models.incidents import Incident  # noqa: E402, F401
