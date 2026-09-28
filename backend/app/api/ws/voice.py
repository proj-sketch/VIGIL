"""
api/ws/voice.py — WebSocket gateway for citizen/operator voice sessions.

Flow:
  1. Client connects: ws://.../ws/voice/{session_token}
  2. Backend validates session_token → gets conversation_id, role
  3. AgentRuntime starts (opens AssemblyAI connection)
  4. Binary frames: audio data (client → AAI)
  5. Text frames: control messages (JSON)
  6. Server pushes: audio (binary), transcripts, events (JSON text)
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from app.agent.runtime import AgentRuntime
from app.core.logging import get_logger
from app.core.security import verify_ws_ticket
from app.db.database import get_async_session
from app.db.models.conversations import VoiceSession
from app.db.models.enums import SessionStatus

logger = get_logger(__name__)
router = APIRouter()


@router.websocket("/ws/voice/{session_token}")
async def voice_ws(websocket: WebSocket, session_token: str) -> None:
    await websocket.accept()

    # 1. Cryptographically verify WS ticket
    try:
        payload = verify_ws_ticket(session_token)
        conversation_id = uuid.UUID(payload["conversation_id"])
        role = payload.get("role", "CITIZEN")
    except Exception as exc:
        logger.warning("voice_ws.invalid_ticket", error=str(exc))
        await websocket.send_text(json.dumps({"type": "error", "message": f"Invalid session token: {exc}"}))
        await websocket.close(code=4001)
        return

    # 2. Check DB if available (non-fatal if DB is down)
    try:
        async with get_async_session() as db:
            stmt = select(VoiceSession).where(VoiceSession.session_token == session_token)
            result = await db.execute(stmt)
            session = result.scalar_one_or_none()
            if session:
                if session.status != SessionStatus.ACTIVE:
                    await websocket.send_text(json.dumps({"type": "error", "message": "Session expired or ended"}))
                    await websocket.close(code=4002)
                    return
                if datetime.now(UTC) > session.expires_at.replace(tzinfo=UTC):
                    await websocket.send_text(json.dumps({"type": "error", "message": "Session expired"}))
                    await websocket.close(code=4003)
                    return
                conversation_id = session.conversation_id
                role = session.role.value
    except Exception as exc:
        logger.debug("voice_ws.db_check_skipped", error=str(exc))

    logger.info("voice_ws.connected", conversation_id=str(conversation_id), role=role)

    # Callbacks from agent runtime → browser
    async def send_audio(audio_bytes: bytes) -> None:
        try:
            await websocket.send_bytes(audio_bytes)
        except Exception:
            pass

    async def send_transcript(role_: str, text: str) -> None:
        try:
            await websocket.send_text(json.dumps({
                "type": "transcript",
                "role": role_,
                "text": text,
                "timestamp": datetime.now(UTC).isoformat(),
            }))
        except Exception:
            pass

    session_ended = asyncio.Event()

    async def on_session_ended() -> None:
        session_ended.set()
        try:
            await websocket.send_text(json.dumps({"type": "session.ended"}))
        except Exception:
            pass

    # Start agent runtime
    from app.db.database import get_async_session as _session_factory
    runtime = AgentRuntime(
        conversation_id=conversation_id,
        role=role,
        actor_id=f"session:{session_token[:12]}",
        db_session_factory=_session_factory,
        on_audio_to_browser=send_audio,
        on_transcript=send_transcript,
        on_session_ended=on_session_ended,
    )

    try:
        await websocket.send_text(json.dumps({
            "type": "session.ready",
            "conversation_id": str(conversation_id),
            "role": role,
        }))
        await runtime.start()

        # Main receive loop
        while not session_ended.is_set():
            try:
                message = await asyncio.wait_for(websocket.receive(), timeout=30.0)
            except asyncio.TimeoutError:
                # Keepalive ping
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
                continue

            if message["type"] == "websocket.disconnect":
                break

            if message.get("bytes"):
                # Audio data from browser → AssemblyAI
                await runtime.handle_audio(message["bytes"])

            elif message.get("text"):
                try:
                    control = json.loads(message["text"])
                    if control.get("type") == "end_session":
                        break
                    elif control.get("type") == "pong":
                        pass  # keepalive response
                    elif control.get("type") == "user_text":
                        # Browser Web Speech API transcript → Gemini agent
                        text = control.get("text", "").strip()
                        if text:
                            asyncio.create_task(runtime.handle_user_text(text))
                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger.info("voice_ws.disconnected", conversation_id=str(conversation_id))
    except Exception as exc:
        logger.error("voice_ws.error", error=str(exc), conversation_id=str(conversation_id))
    finally:
        await runtime.close()
        # Mark session ended in DB
        async with get_async_session() as db:
            stmt = select(VoiceSession).where(VoiceSession.session_token == session_token)
            result = await db.execute(stmt)
            s = result.scalar_one_or_none()
            if s:
                s.status = SessionStatus.ENDED
                s.ended_at = datetime.now(UTC)
                await db.commit()
        logger.info("voice_ws.closed", conversation_id=str(conversation_id))
