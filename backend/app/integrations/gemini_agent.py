"""
integrations/gemini_agent.py — Gemini-powered conversational agent.

Uses google-genai SDK (new, not deprecated google.generativeai).

Audio pipeline:
  Browser → Web Speech API (client-side STT) → text frame {"type":"user_text","text":"..."}
  Backend → Gemini Flash → text response → transcript frame → browser SpeechSynthesis

If Gemini API key is invalid/unavailable, falls back to a rule-based emergency flow.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from typing import Any, Callable, Coroutine

from google import genai
from google.genai import types as genai_types

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


def _safe(text: str) -> str:
    """Strip non-ASCII chars so Windows charmap logger never crashes."""
    return text.encode('ascii', errors='replace').decode('ascii')


async def _gemini_with_retry(call, max_retries: int = 2):
    """Run a blocking Gemini call in executor with retry on 429/503."""
    loop = asyncio.get_event_loop()
    for attempt in range(max_retries + 1):
        try:
            return await loop.run_in_executor(None, call)
        except Exception as exc:
            err_str = str(exc)
            if '429' in err_str or 'RESOURCE_EXHAUSTED' in err_str:
                if attempt < max_retries:
                    match = re.search(r'retry in (\d+)', err_str)
                    delay = min(int(match.group(1)) if match else 3, 10)
                    logger.warning("gemini_agent.rate_limited_retrying", attempt=attempt + 1, delay=delay)
                    await asyncio.sleep(delay)
                    continue
            elif '503' in err_str or 'UNAVAILABLE' in err_str:
                if attempt < max_retries:
                    await asyncio.sleep(2)
                    continue
            raise
    raise RuntimeError("Gemini retries exhausted")


# Fallback model chain — tried in order when primary model is unavailable
_MODEL_FALLBACKS = [
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-pro",
    "gemini-3.5-flash",
    "gemini-3.1-flash-lite",
]



# ─── Rule-based fallback when Gemini is unavailable ──────────────────────────

_EMERGENCY_QUESTIONS = [
    "What type of emergency is this? (fire, medical, accident, crime, flood, or other)",
    "What is the location or address of the emergency?",
    "How many people are involved? Are there any injuries?",
    "Is anyone in immediate danger right now?",
]

_TYPE_MAP = {
    'fire': 'FIRE', 'aag': 'FIRE', 'burn': 'FIRE', 'smoke': 'FIRE',
    'medical': 'MEDICAL', 'heart': 'MEDICAL', 'unconscious': 'MEDICAL',
    'injured': 'MEDICAL', 'bleeding': 'MEDICAL', 'ambulance': 'MEDICAL',
    'accident': 'ACCIDENT', 'crash': 'ACCIDENT', 'collision': 'ACCIDENT',
    'vehicle': 'ACCIDENT', 'car': 'ACCIDENT',
    'crime': 'POLICE', 'theft': 'POLICE', 'robbery': 'POLICE',
    'attack': 'POLICE', 'assault': 'POLICE', 'murder': 'POLICE',
    'flood': 'NATURAL_DISASTER', 'earthquake': 'NATURAL_DISASTER',
    'storm': 'NATURAL_DISASTER', 'disaster': 'NATURAL_DISASTER',
}


def _detect_type(text: str) -> str | None:
    low = text.lower()
    for kw, t in _TYPE_MAP.items():
        if kw in low:
            return t
    return None


def _rule_based_response(user_text: str, turn: int, history_texts: list[str]) -> tuple[str, bool]:
    """
    Returns (response_text, dispatch_now).
    Uses the turn count and detected keywords to drive a scripted conversation.
    """
    full_history = ' '.join(history_texts).lower()
    detected_type = _detect_type(full_history)

    # Turn 1: Acknowledge and ask for type
    if turn == 1:
        if detected_type:
            return (
                f"I understand — a {detected_type.lower()} emergency. "
                "What is the exact location or address?"
            ), False
        return (
            "I understand you need help. What type of emergency is this — "
            "fire, medical, accident, crime, or natural disaster?"
        ), False

    # Turn 2: Ask for location if not yet provided, or confirm dispatch
    if turn == 2:
        if detected_type:
            return (
                "Got it. What is the exact location or address of the emergency?"
            ), False
        return (
            "Please tell me the location and type of emergency so I can dispatch help."
        ), False

    # Turn 3+: Confirm dispatch
    return (
        f"Emergency services are being dispatched to your location now. "
        "Please stay on the line and move to a safe area if possible. "
        "Help is on the way."
    ), True


SYSTEM_PROMPT = """You are a calm, professional emergency dispatch AI for Rapid Help.
You ONLY respond in ENGLISH regardless of the language the caller uses.
If the caller speaks Hindi or any other language, still respond in English only.

Your job is to help in emergencies. Ask only ONE question at a time.

Gather in order:
1. Nature of emergency (fire, medical, crime, accident, flood, etc.)
2. Exact location or address
3. Number of people involved / any injuries
4. Immediate danger level
5. Caller's name (optional)

Once you have enough information (at minimum: emergency type + location), IMMEDIATELY confirm:
- Help is being dispatched
- Tell them to stay on the line
- Give immediate safety advice if relevant

IMPORTANT: Recognize ALL emergency keywords in any language:
- aag / fire / jalana = FIRE
- accident / hadsa / takkar / crash = ACCIDENT
- chor / loot / crime / maar peet = CRIME
- dil ka dora / behosh / medical / injured = MEDICAL
- baadh / flood / earthquake / tufaan = NATURAL_DISASTER

Keep ALL responses under 3 sentences. Sound calm, clear, and authoritative.
Do NOT ask multiple questions at once.
Do NOT say you cannot help. Always try to gather information and dispatch help.
NEVER respond in Hindi or any language other than English."""


class GeminiAgentBridge:
    """
    Gemini-powered voice agent bridge.
    Text-in / text-out. Audio handled client-side.
    """

    def __init__(
        self,
        conversation_id: uuid.UUID,
        role: str,
        tool_definitions: list[dict],
        on_transcript: Callable[[str, str], Coroutine],
        on_tool_call: Callable[[str, str, dict], Coroutine],
        on_session_ended: Callable[[], Coroutine],
        on_audio_to_browser: Callable[[bytes], Coroutine] | None = None,
    ) -> None:
        self.conversation_id = conversation_id
        self.role = role
        self.tool_definitions = tool_definitions
        self.on_transcript = on_transcript
        self.on_tool_call = on_tool_call
        self.on_session_ended = on_session_ended
        self._running = False
        self._client: genai.Client | None = None
        self._history: list[dict] = []
        self._user_text_count = 0
        self._incident_created = False  # Guard: only create incident once per session
        self._pending_tool_tasks: set[asyncio.Task] = set()

    async def start(self) -> None:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is not set in .env")

        self._client = genai.Client(api_key=settings.gemini_api_key)
        self._model = settings.gemini_model or "gemini-2.5-flash"
        self._running = True

        logger.info("gemini_agent.started", conversation_id=str(self.conversation_id), model=self._model)

        # Send English opening message
        opening = (
            "Emergency services — Rapid Help. What is your emergency? "
            "Please tell me what happened and where you are."
        )
        await self.on_transcript("AGENT", opening)
        # Add to history as model turn
        self._history.append({"role": "model", "parts": [{"text": opening}]})

    async def handle_user_text(self, text: str) -> None:
        """Called when the browser sends a transcribed text frame."""
        if not self._running or not self._client:
            return

        self._user_text_count += 1

        # Emit user transcript to browser + DB
        await self.on_transcript("CITIZEN", text)

        # Add user turn to history
        self._history.append({"role": "user", "parts": [{"text": text}]})

        # Get Gemini response — try configured model then fallbacks
        models_to_try = [self._model] + [m for m in _MODEL_FALLBACKS if m != self._model]
        response = None
        last_exc = None

        for model_name in models_to_try:
            try:
                response = await _gemini_with_retry(
                    lambda m=model_name: self._client.models.generate_content(
                        model=m,
                        contents=self._history,
                        config=genai_types.GenerateContentConfig(
                            system_instruction=SYSTEM_PROMPT,
                            temperature=0.3,
                            max_output_tokens=300,
                        ),
                    )
                )
                if model_name != self._model:
                    logger.info("gemini_agent.model_fallback_succeeded", model=model_name)
                break  # success
            except Exception as exc:
                err_str = str(exc)
                last_exc = exc
                if '503' in err_str or 'UNAVAILABLE' in err_str or '404' in err_str:
                    logger.warning("gemini_agent.model_unavailable_trying_next", model=model_name)
                    continue
                break  # non-availability error, don't try more models

        if response is not None:
            # Safely extract text
            agent_text = ""
            if getattr(response, "text", None):
                agent_text = response.text.strip()
            elif response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if getattr(part, "text", None):
                        agent_text += part.text
                agent_text = agent_text.strip()

            if agent_text:
                self._history.append({"role": "model", "parts": [{"text": agent_text}]})
                await self.on_transcript("AGENT", agent_text)
                logger.info(
                    "gemini_agent.response",
                    conversation_id=str(self.conversation_id),
                    turn=self._user_text_count,
                    length=len(agent_text),
                    preview=_safe(agent_text[:60]),
                )
                if self._user_text_count >= 1:
                    await self._maybe_create_incident(agent_text, text)
        else:
            # All Gemini models failed — use rule-based fallback
            err_msg = _safe(str(last_exc)[:200]) if last_exc else "unknown"
            logger.warning("gemini_agent.all_models_failed_using_rule_fallback", error=err_msg[:80])
            user_turns = [h["parts"][0]["text"] for h in self._history if h["role"] == "user"]
            fallback_text, _ = _rule_based_response(text, self._user_text_count, user_turns)
            self._history.append({"role": "model", "parts": [{"text": fallback_text}]})
            await self.on_transcript("AGENT", fallback_text)
            if self._user_text_count >= 1:
                await self._maybe_create_incident(fallback_text, text)




    async def _maybe_create_incident(self, agent_text: str, latest_user_text: str = "") -> None:
        """Trigger create_incident when agent indicates dispatch or after enough info gathered."""
        # English + Hindi trigger words
        trigger_words = [
            # English
            "dispatch", "on their way", "help is coming", "notified", "units are",
            "sending help", "help has been", "emergency services", "responders",
            # Hindi
            "madad bhej", "help bhej", "team bhej", "aa rahe hain", "pahunch",
            "police bhej", "ambulance bhej", "fire brigade", "raaste mein",
        ]
        # Also trigger if agent has asked about location (meaning it understood the emergency)
        location_asked = any(w in agent_text.lower() for w in [
            "location", "address", "where", "kahan", "jagah", "pata"
        ])
        dispatch_triggered = any(w in agent_text.lower() for w in trigger_words)

        # Create incident only ONCE per session
        if self._incident_created:
            return

        # Create incident if dispatch confirmed OR after 2 turns (agent understood emergency)
        if not dispatch_triggered and self._user_text_count < 2:
            return

        # Aggregate all user messages for description
        user_turns = [
            h["parts"][0]["text"]
            for h in self._history
            if h["role"] == "user"
        ]
        description = " | ".join(user_turns)[:500]

        # Determine incident type from keywords
        full_text = description.lower()
        incident_type = None
        if any(w in full_text for w in ["fire", "aag", "jal raha", "burn"]):
            incident_type = "FIRE"
        elif any(w in full_text for w in ["accident", "hadsa", "takkar", "crash"]):
            incident_type = "ACCIDENT"
        elif any(w in full_text for w in ["chor", "loot", "crime", "maar", "attack", "robbery"]):
            incident_type = "CRIME"
        elif any(w in full_text for w in ["medical", "dil", "behosh", "injured", "ghayal", "blood", "khoon"]):
            incident_type = "MEDICAL"
        elif any(w in full_text for w in ["baadh", "flood", "earthquake", "bhukamp"]):
            incident_type = "NATURAL_DISASTER"

        # Mark as created BEFORE launching the task to prevent race conditions
        self._incident_created = True
        tool_call_id = str(uuid.uuid4())
        task = asyncio.create_task(
            self.on_tool_call(
                tool_call_id,
                "create_incident",
                {
                    "description": description,
                    "location_text": None,
                    "incident_type": incident_type,
                    "severity": "HIGH" if dispatch_triggered else "MEDIUM",
                }
            )
        )
        self._pending_tool_tasks.add(task)
        task.add_done_callback(self._pending_tool_tasks.discard)
        logger.info(
            "gemini_agent.incident_creation_triggered",
            conversation_id=str(self.conversation_id),
            incident_type=incident_type,
            triggered_by="dispatch" if dispatch_triggered else "turn_count",
        )

    async def send_tool_result(self, tool_call_id: str, content: str) -> None:
        """Inject tool result as context into conversation history."""
        self._history.append({
            "role": "user",
            "parts": [{"text": f"[SYSTEM: Tool result for {tool_call_id}]: {content}"}]
        })
        logger.debug("gemini_agent.tool_result_injected", tool_call_id=tool_call_id)

    async def forward_audio_to_aai(self, audio_bytes: bytes) -> None:
        """No-op — audio handled client-side by Web Speech API."""
        pass

    async def run_receive_loop(self) -> None:
        """No-op — Gemini is request/response, not streaming WS."""
        pass

    async def close(self) -> None:
        self._running = False
        for task in self._pending_tool_tasks:
            task.cancel()
        logger.info("gemini_agent.closed", conversation_id=str(self.conversation_id))
