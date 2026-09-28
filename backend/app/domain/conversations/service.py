"""
domain/conversations/service.py — ConversationService.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.exceptions import NotFoundException
from app.core.logging import get_logger
from app.core.security import create_ws_ticket
from app.db.models.audit import EventOutbox
from app.db.models.conversations import Conversation, ReporterProfile, Transcript, VoiceSession
from app.db.models.enums import ActorRole, ConversationStatus, ConversationType, SessionStatus

logger = get_logger(__name__)


class ConversationService:

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_conversation(
        self,
        conversation_type: ConversationType = ConversationType.CITIZEN,
        incident_id: uuid.UUID | None = None,
    ) -> Conversation:
        conv = Conversation(
            conversation_type=conversation_type,
            incident_id=incident_id,
            status=ConversationStatus.ACTIVE,
            agent_state={},
        )
        self.db.add(conv)
        await self.db.flush()
        logger.info("conversation.created", conversation_id=str(conv.id))
        return conv

    async def get_conversation(self, conversation_id: uuid.UUID) -> Conversation:
        stmt = (
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .options(selectinload(Conversation.transcripts))
        )
        result = await self.db.execute(stmt)
        conv = result.scalar_one_or_none()
        if not conv:
            raise NotFoundException("Conversation", str(conversation_id))
        return conv

    async def create_voice_session(
        self,
        conversation_id: uuid.UUID,
        role: ActorRole = ActorRole.CITIZEN,
    ) -> VoiceSession:
        settings = get_settings()
        ticket = create_ws_ticket(
            session_id=str(uuid.uuid4()),  # placeholder until session created
            conversation_id=str(conversation_id),
            role=role.value,
        )
        expires_at = datetime.now(UTC) + timedelta(hours=4)
        session = VoiceSession(
            conversation_id=conversation_id,
            session_token=ticket,
            role=role,
            status=SessionStatus.ACTIVE,
            expires_at=expires_at,
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def get_voice_session(self, session_token: str) -> VoiceSession | None:
        stmt = select(VoiceSession).where(VoiceSession.session_token == session_token)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()

    async def add_transcript(
        self,
        conversation_id: uuid.UUID,
        role: str,
        content: str,
    ) -> Transcript:
        t = Transcript(conversation_id=conversation_id, role=role, content=content)
        self.db.add(t)
        return t

    async def update_agent_state(
        self,
        conversation_id: uuid.UUID,
        state_patch: dict,
    ) -> None:
        conv = await self.get_conversation(conversation_id)
        conv.agent_state = {**conv.agent_state, **state_patch}
        conv.updated_at = datetime.now(UTC)

    async def end_conversation(self, conversation_id: uuid.UUID) -> None:
        conv = await self.get_conversation(conversation_id)
        conv.status = ConversationStatus.ENDED
        conv.ended_at = datetime.now(UTC)
        # Publish realtime event
        entry = EventOutbox(
            channel=f"conversation:{conversation_id}",
            event_type="conversation.ended",
            payload={"conversation_id": str(conversation_id)},
        )
        self.db.add(entry)
