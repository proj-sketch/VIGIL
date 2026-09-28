"""
integrations/assemblyai.py — AssemblyAI Voice Agent API bridge.

Responsibilities:
  1. Open and manage the server-side AssemblyAI WebSocket connection.
  2. Bridge audio: browser WS ↔ AssemblyAI WS.
  3. Parse AssemblyAI protocol events and translate to internal events.
  4. Dispatch tool_call events to agent/runtime.py (non-blocking).
  5. Send tool_result frames back to AssemblyAI.
  6. Handle session.ended, session.error, reconnects.

Protocol verification checkpoint (§Phase 2):
  ✓ Incoming tool call event type: "tool_call"
  ✓ Outgoing tool result event type: "tool_result"
  ✓ Correlation ID field name (both): "tool_call_id"
  ✓ Result content format: plain string in "content"
  ✓ Tool registration: session.update after session.ready
  ✓ Session end event name: "session.ended"

⚠️  If AssemblyAI updates their protocol, update ONLY this file.
    Internal event names (ToolCallRequested, VoiceSessionEnded) do NOT change.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any, Callable, Coroutine

import websockets
from websockets.exceptions import ConnectionClosed

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Tool result content builder — AssemblyAI feeds content directly to LLM context
def _success_content(tool_name: str, data: dict) -> str:
    import json as _json
    return f"Tool '{tool_name}' completed successfully. Result: {_json.dumps(data)}"

def _error_content(tool_name: str, code: str, message: str) -> str:
    return f"Tool '{tool_name}' failed with error {code}: {message}"


class AssemblyAIBridge:
    """
    Manages a single AssemblyAI Voice Agent session.

    One bridge instance = one citizen voice session.
    The bridge runs as a coroutine pair:
      - _aai_receive_loop(): reads from AssemblyAI, dispatches events
      - Called externally: forward_audio_to_aai(), close()
    """

    ASSEMBLYAI_WS_URL = "wss://api.assemblyai.com/v3/realtime/ws"

    def __init__(
        self,
        conversation_id: uuid.UUID,
        role: str,
        tool_definitions: list[dict],
        on_audio_to_browser: Callable[[bytes], Coroutine],
        on_transcript: Callable[[str, str], Coroutine],  # (role, text)
        on_tool_call: Callable[[str, str, dict], Coroutine],  # (tool_call_id, name, args)
        on_session_ended: Callable[[], Coroutine],
    ) -> None:
        self.conversation_id = conversation_id
        self.role = role
        self.tool_definitions = tool_definitions
        self.on_audio_to_browser = on_audio_to_browser
        self.on_transcript = on_transcript
        self.on_tool_call = on_tool_call
        self.on_session_ended = on_session_ended

        self._aai_ws: Any = None
        self._running = False
        self._pending_tool_tasks: set[asyncio.Task] = set()

    async def start(self) -> None:
        """Connect to AssemblyAI and start the receive loop."""
        settings = get_settings()
        url = f"{self.ASSEMBLYAI_WS_URL}?sample_rate=16000&token={settings.assemblyai_api_key}"

        try:
            self._aai_ws = await websockets.connect(
                url,
                additional_headers={"Authorization": settings.assemblyai_api_key},
                max_size=10 * 1024 * 1024,  # 10MB
            )
            self._running = True
            logger.info(
                "assemblyai.connected",
                conversation_id=str(self.conversation_id),
            )
        except Exception as exc:
            logger.error("assemblyai.connect_failed", error=str(exc))
            raise

    async def run_receive_loop(self) -> None:
        """Main receive loop — runs until session ends or error."""
        try:
            async for message in self._aai_ws:
                if isinstance(message, bytes):
                    # Audio response from AssemblyAI → forward to browser
                    await self.on_audio_to_browser(message)
                else:
                    await self._handle_text_event(message)
        except ConnectionClosed as exc:
            logger.info("assemblyai.connection_closed", code=exc.code, reason=exc.reason)
        except Exception as exc:
            logger.error("assemblyai.receive_error", error=str(exc))
        finally:
            self._running = False
            # Cancel any in-flight tool tasks
            for task in self._pending_tool_tasks:
                task.cancel()

    async def _handle_text_event(self, raw: str) -> None:
        try:
            event = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("assemblyai.invalid_json", raw=raw[:200])
            return

        event_type = event.get("type", "")

        if event_type == "session.ready":
            logger.info("assemblyai.session_ready", conversation_id=str(self.conversation_id))
            # Immediately register tool definitions
            await self._send_session_update()

        elif event_type == "session.update":
            logger.debug("assemblyai.session_updated")

        elif event_type == "transcript":
            text = event.get("text", "")
            role = "citizen" if event.get("speaker", "") != "agent" else "agent"
            if text:
                await self.on_transcript(role, text)

        elif event_type == "tool_call":
            # Non-blocking dispatch — WS loop continues immediately
            tool_call_id = event.get("tool_call_id", "")
            tool_name = event.get("name", "")
            arguments = event.get("arguments", {})

            logger.info(
                "assemblyai.tool_call_received",
                tool_call_id=tool_call_id,
                tool_name=tool_name,
            )

            task = asyncio.create_task(
                self._dispatch_tool_call(tool_call_id, tool_name, arguments)
            )
            self._pending_tool_tasks.add(task)
            task.add_done_callback(self._pending_tool_tasks.discard)

        elif event_type == "session.ended":
            logger.info("assemblyai.session_ended", conversation_id=str(self.conversation_id))
            await self.on_session_ended()

        elif event_type == "session.error":
            logger.error("assemblyai.session_error", event=event)

        else:
            logger.debug("assemblyai.unknown_event", event_type=event_type)

    async def _dispatch_tool_call(
        self,
        tool_call_id: str,
        tool_name: str,
        arguments: dict,
    ) -> None:
        """Background task: execute tool call, send tool_result when done."""
        settings = get_settings()
        try:
            async with asyncio.timeout(settings.tool_timeout_seconds):
                # Callback to agent runtime — returns (success, data_or_error)
                await self.on_tool_call(tool_call_id, tool_name, arguments)
                # tool_result is sent by the callback via send_tool_result()
        except asyncio.TimeoutError:
            logger.error(
                "assemblyai.tool_timeout",
                tool_call_id=tool_call_id,
                tool_name=tool_name,
                timeout=settings.tool_timeout_seconds,
            )
            await self.send_tool_result(
                tool_call_id=tool_call_id,
                content=_error_content(tool_name, "TIMEOUT", f"Tool timed out after {settings.tool_timeout_seconds}s"),
            )
        except Exception as exc:
            logger.error("assemblyai.tool_dispatch_error", error=str(exc))
            await self.send_tool_result(
                tool_call_id=tool_call_id,
                content=_error_content(tool_name, "EXECUTION_FAILED", str(exc)),
            )

    async def send_tool_result(self, tool_call_id: str, content: str) -> None:
        """Send a tool_result frame to AssemblyAI. Called from handle_tool_call() AFTER DB writes."""
        if not self._aai_ws or not self._running:
            logger.warning("assemblyai.send_tool_result_skipped", reason="ws_not_active")
            return
        frame = {
            "type": "tool_result",
            "tool_call_id": tool_call_id,
            "role": "tool",
            "content": content,
        }
        try:
            await self._aai_ws.send(json.dumps(frame))
            logger.debug("assemblyai.tool_result_sent", tool_call_id=tool_call_id)
        except Exception as exc:
            logger.error("assemblyai.tool_result_send_failed", error=str(exc))

    async def forward_audio_to_aai(self, audio_bytes: bytes) -> None:
        """Forward audio chunk from browser to AssemblyAI."""
        if self._aai_ws and self._running:
            try:
                await self._aai_ws.send(audio_bytes)
            except Exception:
                pass  # Connection may have closed; WS loop will handle

    async def _send_session_update(self) -> None:
        """Register tool definitions with AssemblyAI after session.ready."""
        if not self._aai_ws:
            return
        msg = {
            "type": "session.update",
            "session": {
                "tools": self.tool_definitions,
            },
        }
        await self._aai_ws.send(json.dumps(msg))
        logger.info("assemblyai.session_update_sent", tool_count=len(self.tool_definitions))

    async def close(self) -> None:
        self._running = False
        if self._aai_ws:
            await self._aai_ws.close()
            self._aai_ws = None
