"""
api/v1/voice.py — Voice session management REST endpoints.

Endpoints:
  POST /voice/sessions       — Create a new voice session (citizen or operator)
  DELETE /voice/sessions/{id} — End a voice session
  GET /voice/sessions/{id}   — Get session status
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.logging import get_logger
from app.core.security import create_ws_ticket
from app.db.models.enums import ActorRole, ConversationType
from app.domain.conversations.service import ConversationService

logger = get_logger(__name__)
router = APIRouter(prefix="/voice", tags=["voice"])


class CreateSessionRequest(BaseModel):
    role: str = "CITIZEN"  # "CITIZEN" | "OPERATOR"
    incident_id: str | None = None


class SessionResponse(BaseModel):
    session_id: str
    conversation_id: str
    session_token: str
    ws_url: str
    role: str
    expires_at: str


@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_voice_session(
    request: CreateSessionRequest,
    db: AsyncSession = Depends(get_db),
) -> SessionResponse:
    """Create a new voice session.

    Returns a session_token (JWT) that the client uses to authenticate
    the WebSocket connection at /ws/voice/{session_token}.
    """
    role = ActorRole.CITIZEN if request.role.upper() == "CITIZEN" else ActorRole.OPERATOR
    conv_type = ConversationType.CITIZEN if role == ActorRole.CITIZEN else ConversationType.OPERATOR
    incident_id = uuid.UUID(request.incident_id) if request.incident_id else None

    try:
        conv_svc = ConversationService(db)
        # Create or reuse conversation
        conversation = await conv_svc.create_conversation(
            conversation_type=conv_type,
            incident_id=incident_id,
        )
        voice_session = await conv_svc.create_voice_session(
            conversation_id=conversation.id,
            role=role,
        )
        await db.commit()
        sess_id = str(voice_session.id)
        conv_id = str(conversation.id)
        token = voice_session.session_token
        expires_at_str = voice_session.expires_at.isoformat()
    except Exception as exc:
        logger.warning("voice_session.db_fallback", error=str(exc))
        try:
            await db.rollback()
        except Exception:
            pass
        conv_uuid = uuid.uuid4()
        sess_uuid = uuid.uuid4()
        conv_id = str(conv_uuid)
        sess_id = str(sess_uuid)
        token = create_ws_ticket(
            session_id=sess_id,
            conversation_id=conv_id,
            role=role.value,
        )
        expires_at_str = (datetime.now(UTC) + timedelta(hours=4)).isoformat()

    ws_url = f"/ws/voice/{token}"
    logger.info(
        "voice_session.created",
        session_id=sess_id,
        conversation_id=conv_id,
        role=role.value,
    )
    return SessionResponse(
        session_id=sess_id,
        conversation_id=conv_id,
        session_token=token,
        ws_url=ws_url,
        role=role.value,
        expires_at=expires_at_str,
    )


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    from sqlalchemy import select
    from app.db.models.conversations import VoiceSession
    stmt = select(VoiceSession).where(VoiceSession.id == uuid.UUID(session_id))
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "session_id": str(session.id),
        "status": session.status.value,
        "role": session.role.value,
        "expires_at": session.expires_at.isoformat(),
    }
