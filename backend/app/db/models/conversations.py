"""
db/models/conversations.py — Conversation, Transcript, ReporterProfile, VoiceSession models.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.db.models.enums import ConversationStatus, ConversationType, SessionStatus, ActorRole


def _now() -> datetime:
    return datetime.now(UTC)


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    incident_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("incidents.id", use_alter=True),
        nullable=True,
        index=True,
    )
    conversation_type: Mapped[ConversationType] = mapped_column(
        SAEnum(ConversationType, name="conversation_type", create_type=True),
        nullable=False,
        default=ConversationType.CITIZEN,
    )
    status: Mapped[ConversationStatus] = mapped_column(
        SAEnum(ConversationStatus, name="conversation_status", create_type=True),
        nullable=False,
        default=ConversationStatus.ACTIVE,
    )
    agent_state: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    # How many clarification turns have been asked
    clarification_turns: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now, nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    transcripts: Mapped[list["Transcript"]] = relationship(
        "Transcript", back_populates="conversation", cascade="all, delete-orphan"
    )
    voice_sessions: Mapped[list["VoiceSession"]] = relationship(
        "VoiceSession", back_populates="conversation", cascade="all, delete-orphan"
    )
    reporter_profile: Mapped["ReporterProfile | None"] = relationship(
        "ReporterProfile", back_populates="conversation", uselist=False
    )

    def __repr__(self) -> str:
        return f"<Conversation {self.id} type={self.conversation_type} status={self.status}>"


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(
        String(32), nullable=False
    )  # "citizen" | "agent" | "operator"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    conversation: Mapped["Conversation"] = relationship(
        "Conversation", back_populates="transcripts"
    )


class ReporterProfile(Base):
    """Anonymised caller identity — linked to a conversation, not a user account."""

    __tablename__ = "reporter_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    phone_number: Mapped[str | None] = mapped_column(String(32), nullable=True)
    device_fingerprint: Mapped[str | None] = mapped_column(String(256), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )

    conversation: Mapped["Conversation"] = relationship(
        "Conversation", back_populates="reporter_profile"
    )


class VoiceSession(Base):
    """Tracks a single AssemblyAI voice session for a conversation."""

    __tablename__ = "voice_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_token: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)
    assemblyai_session_id: Mapped[str | None] = mapped_column(String(256), nullable=True)
    role: Mapped[ActorRole] = mapped_column(
        SAEnum(ActorRole, name="actor_role", create_type=True),
        nullable=False,
        default=ActorRole.CITIZEN,
    )
    status: Mapped[SessionStatus] = mapped_column(
        SAEnum(SessionStatus, name="session_status", create_type=True),
        nullable=False,
        default=SessionStatus.ACTIVE,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    conversation: Mapped["Conversation"] = relationship(
        "Conversation", back_populates="voice_sessions"
    )
