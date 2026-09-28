"""
agent/runtime.py — Agent runtime: coordinates Gemini agent bridge + tool execution + observability.

Lifecycle per session:
  1. Instantiated with conversation_id and role.
  2. start() initialises the Gemini bridge.
  3. handle_user_text() forwards browser STT text to Gemini.
  4. handle_tool_call() dispatches tool execution (non-blocking).
  5. close() tears down cleanly.

Audio model:
  Browser captures audio → Web Speech API (client-side STT) → text frame {"type":"user_text","text":"..."}
  Gemini response text → transcript frame → browser SpeechSynthesis (client-side TTS)
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.agent.tools import ROLE_TOOL_DEFS, execute_tool
from app.core.logging import get_logger
from app.db.models.audit import AgentRun, ToolCall
from app.db.models.enums import ActorRole, ToolExecutionStatus
from app.integrations.gemini_agent import GeminiAgentBridge

logger = get_logger(__name__)


class AgentRuntime:
    """
    Orchestrates one voice session end-to-end.

    Thread/task model:
      - All methods are async coroutines.
      - tool_call handling: asyncio.create_task (non-blocking from WS loop).
      - tool_result delivery: synchronous within the background task
        (DB commit first, then notify bridge).
    """

    def __init__(
        self,
        conversation_id: uuid.UUID,
        role: str,  # "CITIZEN" | "OPERATOR"
        actor_id: str,
        db_session_factory: Any,
        on_audio_to_browser: Any,
        on_transcript: Any,
        on_session_ended: Any,
    ) -> None:
        self.conversation_id = conversation_id
        self.role = role
        self.actor_id = actor_id
        self.db_session_factory = db_session_factory
        self.on_audio_to_browser = on_audio_to_browser
        self.on_transcript = on_transcript
        self.on_session_ended = on_session_ended

        self.bridge: GeminiAgentBridge | None = None
        self._start_time = datetime.now(UTC)

    async def start(self) -> None:
        tool_defs = ROLE_TOOL_DEFS.get(self.role, [])
        self.bridge = GeminiAgentBridge(
            conversation_id=self.conversation_id,
            role=self.role,
            tool_definitions=tool_defs,
            on_audio_to_browser=self.on_audio_to_browser,
            on_transcript=self._handle_transcript,
            on_tool_call=self._handle_tool_call,
            on_session_ended=self.on_session_ended,
        )
        await self.bridge.start()
        # No background receive loop needed (Gemini is request/response)

    async def handle_audio(self, audio_bytes: bytes) -> None:
        """No-op — audio is processed client-side by Web Speech API."""
        pass

    async def handle_user_text(self, text: str) -> None:
        """Called when browser sends {'type': 'user_text', 'text': '...'} frame."""
        if self.bridge:
            await self.bridge.handle_user_text(text)

    async def _handle_transcript(self, role: str, text: str) -> None:
        """Called by bridge when a transcript chunk arrives. Persist + forward."""
        from app.domain.conversations.service import ConversationService
        try:
            async with self.db_session_factory() as db:
                conv_svc = ConversationService(db)
                await conv_svc.add_transcript(self.conversation_id, role, text)
                await db.commit()
        except Exception as exc:
            logger.debug("runtime.persist_transcript_skipped", error=str(exc))
        await self.on_transcript(role, text)

    async def _handle_tool_call(
        self,
        tool_call_id: str,
        tool_name: str,
        arguments: dict,
    ) -> None:
        """Execute tool, persist observability, send tool_result.

        This runs in a background asyncio.Task.
        tool_result is sent AFTER DB commit.
        """
        start_ms = datetime.now(UTC)

        success, result_data, content = await execute_tool(
            tool_name=tool_name,
            arguments=arguments,
            conversation_id=self.conversation_id,
            actor_id=self.actor_id,
            actor_role=self.role,
            db_session_factory=self.db_session_factory,
        )

        elapsed_ms = int((datetime.now(UTC) - start_ms).total_seconds() * 1000)

        # Persist tool_call record
        await self._persist_tool_call(
            tool_call_id=tool_call_id,
            tool_name=tool_name,
            arguments=arguments,
            result=result_data,
            execution_status=ToolExecutionStatus.SUCCESS if success else ToolExecutionStatus.EXECUTION_FAILED,
            latency_ms=elapsed_ms,
        )

        # Notify bridge of tool result
        if self.bridge:
            await self.bridge.send_tool_result(tool_call_id=tool_call_id, content=content)

    async def _persist_tool_call(
        self,
        tool_call_id: str,
        tool_name: str,
        arguments: dict,
        result: dict | None,
        execution_status: ToolExecutionStatus,
        latency_ms: int,
    ) -> None:
        try:
            async with self.db_session_factory() as db:
                run = AgentRun(
                    conversation_id=self.conversation_id,
                    tools_called=[tool_name],
                )
                db.add(run)
                await db.flush()

                call = ToolCall(
                    agent_run_id=run.id,
                    tool_name=tool_name,
                    arguments=arguments,
                    result=result,
                    execution_status=execution_status,
                    latency_ms=latency_ms,
                )
                db.add(call)
                await db.commit()
        except Exception as exc:
            logger.debug("runtime.persist_tool_call_skipped", error=str(exc))

    async def close(self) -> None:
        if self.bridge:
            await self.bridge.close()
