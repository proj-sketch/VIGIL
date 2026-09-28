"""
agent/tools.py — All agent tool implementations + per-role registries.

Design:
  - CITIZEN_TOOL_REGISTRY: tools available to citizen conversations
  - OPERATOR_TOOL_REGISTRY: full set for operators
  - Each tool: Pydantic schema for args validation, async execute() function
  - ALL mutations go through domain services (never raw SQL)
  - Audit + outbox written in the same transaction as state change (via service)
"""
from __future__ import annotations

import uuid
from typing import Any

from pydantic import BaseModel, Field

from app.core.logging import get_logger

logger = get_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Tool argument schemas (Pydantic v2)
# ─────────────────────────────────────────────────────────────────────────────

class CreateIncidentArgs(BaseModel):
    description: str = Field(..., min_length=5, max_length=2000)
    location_text: str | None = Field(None, max_length=500)
    # Optional — agent may or may not supply these
    incident_type: str | None = Field(None)
    severity: str | None = Field(None)
    # Auto-generated if not provided so agent never needs to know about it
    idempotency_key: str = Field(default_factory=lambda: str(uuid.uuid4()))


class UpdateIncidentTypeArgs(BaseModel):
    incident_id: str
    incident_type: str  # IncidentType enum value
    severity: str  # IncidentSeverity enum value
    idempotency_key: str


class UpdateIncidentLocationArgs(BaseModel):
    incident_id: str
    location_text: str = Field(..., min_length=2)


class AddIncidentFactArgs(BaseModel):
    incident_id: str
    fact_type: str = Field(..., min_length=2)
    value: dict
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)


class TransitionIncidentArgs(BaseModel):
    incident_id: str
    target_status: str  # IncidentStatus enum value
    reason: str | None = None


class AssignResponderArgs(BaseModel):
    incident_id: str
    responder_id: str
    idempotency_key: str


class FindRespondersArgs(BaseModel):
    incident_id: str
    responder_type: str | None = None  # ResponderType enum value


class ConfirmEmergencyArgs(BaseModel):
    incident_id: str
    confirmation_message: str | None = None


class NotifyCallerArgs(BaseModel):
    conversation_id: str
    message: str = Field(..., min_length=5)


class GetIncidentStatusArgs(BaseModel):
    incident_id: str


# ─────────────────────────────────────────────────────────────────────────────
# AssemblyAI tool definition format (JSON Schema)
# ─────────────────────────────────────────────────────────────────────────────

def _tool_def(name: str, description: str, parameters: dict) -> dict:
    return {
        "name": name,
        "description": description,
        "parameters": {
            "type": "object",
            **parameters,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Tool definitions for AssemblyAI session.update
# ─────────────────────────────────────────────────────────────────────────────

CITIZEN_TOOL_DEFS = [
    _tool_def(
        "create_incident",
        "Create a new emergency incident report based on what the citizen has described.",
        {
            "properties": {
                "description": {"type": "string", "description": "Full description of the emergency"},
                "location_text": {"type": "string", "description": "Location as described by the citizen"},
                "idempotency_key": {"type": "string", "description": "Unique key to prevent duplicate creation"},
            },
            "required": ["description", "idempotency_key"],
        },
    ),
    _tool_def(
        "update_incident_type",
        "Update the incident classification type and severity once determined.",
        {
            "properties": {
                "incident_id": {"type": "string"},
                "incident_type": {"type": "string", "enum": ["MEDICAL", "FIRE", "CRIME", "ACCIDENT", "NATURAL_DISASTER", "INFRASTRUCTURE", "OTHER"]},
                "severity": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
                "idempotency_key": {"type": "string"},
            },
            "required": ["incident_id", "incident_type", "severity", "idempotency_key"],
        },
    ),
    _tool_def(
        "update_incident_location",
        "Update the incident location based on citizen clarification.",
        {
            "properties": {
                "incident_id": {"type": "string"},
                "location_text": {"type": "string"},
            },
            "required": ["incident_id", "location_text"],
        },
    ),
    _tool_def(
        "add_incident_fact",
        "Record a verified fact about the incident (number of casualties, hazards, etc.).",
        {
            "properties": {
                "incident_id": {"type": "string"},
                "fact_type": {"type": "string"},
                "value": {"type": "object"},
                "confidence": {"type": "number"},
            },
            "required": ["incident_id", "fact_type", "value"],
        },
    ),
    _tool_def(
        "get_incident_status",
        "Retrieve current status of an incident to inform the citizen.",
        {
            "properties": {"incident_id": {"type": "string"}},
            "required": ["incident_id"],
        },
    ),
    _tool_def(
        "confirm_emergency",
        "Confirm that the emergency has been received and help is on the way.",
        {
            "properties": {
                "incident_id": {"type": "string"},
                "confirmation_message": {"type": "string"},
            },
            "required": ["incident_id"],
        },
    ),
]

OPERATOR_TOOL_DEFS = CITIZEN_TOOL_DEFS + [
    _tool_def(
        "transition_incident_status",
        "Transition an incident to a new status in the workflow.",
        {
            "properties": {
                "incident_id": {"type": "string"},
                "target_status": {"type": "string", "enum": ["VERIFYING", "TRIAGED", "DISPATCHED", "ON_SCENE", "RESOLVED", "CANCELLED"]},
                "reason": {"type": "string"},
            },
            "required": ["incident_id", "target_status"],
        },
    ),
    _tool_def(
        "find_available_responders",
        "Find available responders near an incident location.",
        {
            "properties": {
                "incident_id": {"type": "string"},
                "responder_type": {"type": "string", "enum": ["POLICE", "FIRE", "MEDICAL", "RESCUE", "HAZMAT"]},
            },
            "required": ["incident_id"],
        },
    ),
    _tool_def(
        "assign_responder",
        "Assign a specific responder to an incident.",
        {
            "properties": {
                "incident_id": {"type": "string"},
                "responder_id": {"type": "string"},
                "idempotency_key": {"type": "string"},
            },
            "required": ["incident_id", "responder_id", "idempotency_key"],
        },
    ),
]

ROLE_TOOL_DEFS = {
    "CITIZEN": CITIZEN_TOOL_DEFS,
    "OPERATOR": OPERATOR_TOOL_DEFS,
}

CITIZEN_TOOL_NAMES = {d["name"] for d in CITIZEN_TOOL_DEFS}
OPERATOR_TOOL_NAMES = {d["name"] for d in OPERATOR_TOOL_DEFS}
ROLE_TOOL_NAMES = {
    "CITIZEN": CITIZEN_TOOL_NAMES,
    "OPERATOR": OPERATOR_TOOL_NAMES,
}


# ─────────────────────────────────────────────────────────────────────────────
# Tool executor
# ─────────────────────────────────────────────────────────────────────────────

async def execute_tool(
    tool_name: str,
    arguments: dict,
    conversation_id: uuid.UUID,
    actor_id: str,
    actor_role: str,
    db_session_factory: Any,
) -> tuple[bool, dict, str]:
    """
    Execute a tool call and return (success, result_data, content_for_assemblyai).

    The content_for_assemblyai string is sent directly to AssemblyAI as tool_result.content.
    result_data is stored in tool_calls table.
    """
    from app.domain.incidents.service import IncidentService
    from app.domain.responders.service import ResponderService
    from app.db.models.enums import IncidentType, IncidentSeverity, IncidentStatus, ResponderType, ActorRole

    # Validate role authorization
    allowed = ROLE_TOOL_NAMES.get(actor_role, set())
    if tool_name not in allowed:
        return False, {"code": "UNAUTHORIZED"}, f"Tool '{tool_name}' is not available for role {actor_role}."

    async with db_session_factory() as db:
        try:
            incident_svc = IncidentService(db)
            responder_svc = ResponderService(db)

            if tool_name == "create_incident":
                args = CreateIncidentArgs(**arguments)
                # Resolve optional incident_type and severity from agent classification
                inc_type = None
                inc_severity = None
                if args.incident_type:
                    try:
                        inc_type = IncidentType(args.incident_type)
                    except ValueError:
                        pass
                if args.severity:
                    try:
                        inc_severity = IncidentSeverity(args.severity)
                    except ValueError:
                        pass
                incident = await incident_svc.create_incident(
                    description=args.description,
                    location_text=args.location_text,
                    reporter_conversation_id=conversation_id,
                    actor_id=actor_id,
                    incident_type=inc_type,
                    incident_severity=inc_severity,
                )
                await db.commit()
                data = {"incident_id": str(incident.id), "reference_number": incident.reference_number}
                return True, data, f"Emergency incident {incident.reference_number} has been created and logged. Help is being coordinated."

            elif tool_name == "update_incident_type":
                args = UpdateIncidentTypeArgs(**arguments)
                inc_type = IncidentType(args.incident_type)
                severity = IncidentSeverity(args.severity)
                incident = await incident_svc.update_incident_fields(
                    incident_id=uuid.UUID(args.incident_id),
                    actor_id=actor_id,
                    actor_role=ActorRole(actor_role),
                    type=inc_type,
                    severity=severity,
                )
                await db.commit()
                data = {"incident_id": args.incident_id, "type": args.incident_type, "severity": args.severity}
                return True, data, f"Incident classified as {args.incident_type} with {args.severity} severity."

            elif tool_name == "update_incident_location":
                args = UpdateIncidentLocationArgs(**arguments)
                incident = await incident_svc.update_incident_fields(
                    incident_id=uuid.UUID(args.incident_id),
                    actor_id=actor_id,
                    actor_role=ActorRole(actor_role),
                    location_text=args.location_text,
                )
                await db.commit()
                return True, {"location_text": args.location_text}, f"Incident location updated to: {args.location_text}"

            elif tool_name == "add_incident_fact":
                args = AddIncidentFactArgs(**arguments)
                fact = await incident_svc.add_fact(
                    incident_id=uuid.UUID(args.incident_id),
                    fact_type=args.fact_type,
                    value=args.value,
                    confidence=args.confidence,
                    source="agent",
                    actor_id=actor_id,
                )
                await db.commit()
                return True, {"fact_id": str(fact.id)}, f"Recorded: {args.fact_type} = {args.value}"

            elif tool_name == "get_incident_status":
                args = GetIncidentStatusArgs(**arguments)
                incident = await incident_svc.get_incident(uuid.UUID(args.incident_id))
                data = {
                    "incident_id": str(incident.id),
                    "reference_number": incident.reference_number,
                    "status": incident.status.value,
                    "type": incident.type.value if incident.type else None,
                    "severity": incident.severity.value if incident.severity else None,
                }
                return True, data, f"Incident {incident.reference_number} is currently {incident.status.value}."

            elif tool_name == "confirm_emergency":
                args = ConfirmEmergencyArgs(**arguments)
                incident = await incident_svc.get_incident(uuid.UUID(args.incident_id))
                msg = args.confirmation_message or f"Your emergency report {incident.reference_number} has been received. Emergency services are being coordinated."
                return True, {"confirmed": True, "reference_number": incident.reference_number}, msg

            elif tool_name == "transition_incident_status":
                args = TransitionIncidentArgs(**arguments)
                target = IncidentStatus(args.target_status)
                incident = await incident_svc.transition_status(
                    incident_id=uuid.UUID(args.incident_id),
                    target_status=target,
                    actor_id=actor_id,
                    actor_role=ActorRole(actor_role),
                    reason=args.reason,
                )
                await db.commit()
                return True, {"new_status": target.value}, f"Incident transitioned to {target.value}."

            elif tool_name == "find_available_responders":
                args = FindRespondersArgs(**arguments)
                resp_type = ResponderType(args.responder_type) if args.responder_type else None
                incident = await incident_svc.get_incident(uuid.UUID(args.incident_id))
                if incident.latitude and incident.longitude:
                    pairs = await responder_svc.find_nearest_available(
                        responder_type=resp_type or ResponderType.MEDICAL,
                        incident_lat=incident.latitude,
                        incident_lon=incident.longitude,
                    )
                    result_list = [
                        {"id": str(r.id), "unit_id": r.unit_id, "name": r.name, "distance_km": round(d, 2)}
                        for r, d in pairs
                    ]
                else:
                    all_r = await responder_svc.list_available(resp_type)
                    result_list = [{"id": str(r.id), "unit_id": r.unit_id, "name": r.name} for r in all_r[:5]]
                return True, {"responders": result_list}, f"Found {len(result_list)} available responders."

            elif tool_name == "assign_responder":
                args = AssignResponderArgs(**arguments)
                assignment = await responder_svc.assign_responder(
                    incident_id=uuid.UUID(args.incident_id),
                    responder_id=uuid.UUID(args.responder_id),
                    actor_id=actor_id,
                )
                await db.commit()
                return True, {"assignment_id": str(assignment.id)}, "Responder has been dispatched to the incident location."

            else:
                return False, {"code": "UNKNOWN_TOOL"}, f"Unknown tool: {tool_name}"

        except Exception as exc:
            await db.rollback()
            logger.error("tool.execution_failed", tool=tool_name, error=str(exc))
            return False, {"code": "EXECUTION_FAILED", "detail": str(exc)}, f"Tool '{tool_name}' encountered an error: {str(exc)}"
