"""
domain/incidents/service.py — IncidentService: all incident CRUD and state transitions.

Design rules:
- Every mutation is a transaction.
- State transitions use SELECT FOR UPDATE (row-level locking).
- AuditLog + EventOutbox written in the SAME transaction as the state change.
- Service never calls AI — it only receives AI-proposed actions via tool calls.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import NotFoundException, ConflictException
from app.core.logging import get_logger
from app.db.models.audit import AuditLog, EventOutbox
from app.db.models.enums import (
    ActorRole, IncidentSeverity, IncidentStatus, IncidentType,
)
from app.db.models.incidents import Incident, IncidentFact
from app.domain.incidents.state_machine import IncidentStateMachine

logger = get_logger(__name__)


def _generate_ref() -> str:
    """Generate a human-readable incident reference like INC-20240905-0042."""
    from datetime import date
    today = date.today().strftime("%Y%m%d")
    suffix = str(uuid.uuid4().int)[:4].upper()
    return f"INC-{today}-{suffix}"


class IncidentService:

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ─────────────────────────────────────────────────────────────────────────
    # Create
    # ─────────────────────────────────────────────────────────────────────────

    async def create_incident(
        self,
        description: str,
        location_text: str | None,
        reporter_conversation_id: uuid.UUID | None,
        actor_id: str,
        incident_type: IncidentType | None = None,
        incident_severity: IncidentSeverity | None = None,
    ) -> Incident:
        incident = Incident(
            reference_number=_generate_ref(),
            status=IncidentStatus.REPORTED,
            description=description,
            location_text=location_text,
            type=incident_type,
            severity=incident_severity,
            reporter_conversation_id=reporter_conversation_id,
        )
        self.db.add(incident)
        await self.db.flush()  # get incident.id before audit write

        await self._write_audit(
            incident_id=incident.id,
            actor_id=actor_id,
            actor_role=ActorRole.CITIZEN,
            action="incident.created",
            before_state=None,
            after_state={"status": IncidentStatus.REPORTED.value},
        )
        await self._write_outbox(
            channel=f"incident:{incident.id}",
            event_type="incident.created",
            payload=self._incident_payload(incident),
        )
        await self._write_outbox(
            channel="incidents:all",
            event_type="incident.created",
            payload=self._incident_payload(incident),
        )
        logger.info("incident.created", incident_id=str(incident.id), ref=incident.reference_number)
        return incident

    # ─────────────────────────────────────────────────────────────────────────
    # Read
    # ─────────────────────────────────────────────────────────────────────────

    async def get_incident(self, incident_id: uuid.UUID) -> Incident:
        stmt = (
            select(Incident)
            .where(Incident.id == incident_id)
            .options(selectinload(Incident.facts))
        )
        result = await self.db.execute(stmt)
        incident = result.scalar_one_or_none()
        if not incident:
            raise NotFoundException("Incident", str(incident_id))
        return incident

    async def get_incident_by_ref(self, reference_number: str) -> Incident:
        stmt = select(Incident).where(Incident.reference_number == reference_number)
        result = await self.db.execute(stmt)
        incident = result.scalar_one_or_none()
        if not incident:
            raise NotFoundException("Incident", reference_number)
        return incident

    async def list_incidents(
        self,
        status: IncidentStatus | None = None,
        incident_type: IncidentType | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Incident]:
        stmt = select(Incident).order_by(Incident.created_at.desc()).limit(limit).offset(offset)
        if status:
            stmt = stmt.where(Incident.status == status)
        if incident_type:
            stmt = stmt.where(Incident.type == incident_type)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # ─────────────────────────────────────────────────────────────────────────
    # State transition
    # ─────────────────────────────────────────────────────────────────────────

    async def transition_status(
        self,
        incident_id: uuid.UUID,
        target_status: IncidentStatus,
        actor_id: str,
        actor_role: ActorRole,
        reason: str | None = None,
    ) -> Incident:
        """Transition incident to a new status with locking, audit, and outbox."""
        # SELECT FOR UPDATE — prevents concurrent transitions
        stmt = (
            select(Incident)
            .where(Incident.id == incident_id)
            .with_for_update()
        )
        result = await self.db.execute(stmt)
        incident = result.scalar_one_or_none()
        if not incident:
            raise NotFoundException("Incident", str(incident_id))

        before_status = incident.status

        # Validate via state machine (raises on invalid)
        IncidentStateMachine.validate_transition(
            current_status=before_status,
            target_status=target_status,
            incident_type=incident.type,
            incident_severity=incident.severity,
        )

        # Apply
        incident.status = target_status
        incident.updated_at = datetime.now(UTC)

        # Timestamp fields
        if target_status == IncidentStatus.TRIAGED:
            incident.triaged_at = datetime.now(UTC)
        elif target_status == IncidentStatus.DISPATCHED:
            incident.dispatched_at = datetime.now(UTC)
        elif target_status in (IncidentStatus.RESOLVED, IncidentStatus.CANCELLED):
            incident.resolved_at = datetime.now(UTC)

        await self._write_audit(
            incident_id=incident.id,
            actor_id=actor_id,
            actor_role=actor_role,
            action=f"incident.status.{target_status.value.lower()}",
            before_state={"status": before_status.value},
            after_state={"status": target_status.value},
            metadata={"reason": reason},
        )
        payload = self._incident_payload(incident)
        payload["from_status"] = before_status.value
        payload["to_status"] = target_status.value
        await self._write_outbox(
            channel=f"incident:{incident.id}",
            event_type="incident.status_changed",
            payload=payload,
        )
        await self._write_outbox(
            channel="incidents:all",
            event_type="incident.status_changed",
            payload=payload,
        )
        return incident

    # ─────────────────────────────────────────────────────────────────────────
    # Update fields
    # ─────────────────────────────────────────────────────────────────────────

    async def update_incident_fields(
        self,
        incident_id: uuid.UUID,
        actor_id: str,
        actor_role: ActorRole,
        **kwargs: Any,
    ) -> Incident:
        """Update specific fields (type, severity, location, description etc.)."""
        incident = await self.get_incident(incident_id)
        before = {k: getattr(incident, k, None) for k in kwargs}

        for key, value in kwargs.items():
            if hasattr(incident, key):
                setattr(incident, key, value)
        incident.updated_at = datetime.now(UTC)

        await self._write_audit(
            incident_id=incident.id,
            actor_id=actor_id,
            actor_role=actor_role,
            action="incident.updated",
            before_state=before,
            after_state=kwargs,
        )
        await self._write_outbox(
            channel=f"incident:{incident.id}",
            event_type="incident.updated",
            payload=self._incident_payload(incident),
        )
        await self._write_outbox(
            channel="incidents:all",
            event_type="incident.updated",
            payload=self._incident_payload(incident),
        )
        return incident

    # ─────────────────────────────────────────────────────────────────────────
    # Facts
    # ─────────────────────────────────────────────────────────────────────────

    async def add_fact(
        self,
        incident_id: uuid.UUID,
        fact_type: str,
        value: dict,
        confidence: float,
        source: str,
        actor_id: str,
    ) -> IncidentFact:
        """Add a new incident fact, superseding any existing current fact of the same type."""
        # Supersede existing current fact of same type
        stmt = select(IncidentFact).where(
            IncidentFact.incident_id == incident_id,
            IncidentFact.fact_type == fact_type,
            IncidentFact.is_current == True,  # noqa: E712
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        new_fact = IncidentFact(
            incident_id=incident_id,
            fact_type=fact_type,
            value=value,
            confidence=confidence,
            source=source,
            is_current=True,
        )
        self.db.add(new_fact)
        await self.db.flush()

        if existing:
            existing.is_current = False
            existing.superseded_by_id = new_fact.id

        return new_fact

    # ─────────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────────────────

    async def _write_audit(
        self,
        incident_id: uuid.UUID,
        actor_id: str,
        actor_role: ActorRole,
        action: str,
        before_state: dict | None,
        after_state: dict | None,
        metadata: dict | None = None,
    ) -> None:
        log = AuditLog(
            incident_id=incident_id,
            actor_id=actor_id,
            actor_role=actor_role,
            action=action,
            before_state=before_state,
            after_state=after_state,
            metadata_=metadata or {},
        )
        self.db.add(log)

    def _incident_payload(self, incident: "Incident") -> dict:
        """Serialize a full incident snapshot for realtime outbox events."""
        return {
            "incident_id": str(incident.id),
            "id": str(incident.id),
            "reference_number": incident.reference_number,
            "status": incident.status.value,
            "type": incident.type.value if incident.type else None,
            "severity": incident.severity.value if incident.severity else None,
            "description": incident.description,
            "location_text": incident.location_text,
            "latitude": incident.latitude,
            "longitude": incident.longitude,
            "address_resolved": incident.address_resolved,
            "created_at": incident.created_at.isoformat() if incident.created_at else None,
            "updated_at": incident.updated_at.isoformat() if incident.updated_at else None,
            "triaged_at": incident.triaged_at.isoformat() if incident.triaged_at else None,
            "dispatched_at": incident.dispatched_at.isoformat() if incident.dispatched_at else None,
            "resolved_at": incident.resolved_at.isoformat() if incident.resolved_at else None,
        }

    async def _write_outbox(
        self,
        channel: str,
        event_type: str,
        payload: dict,
    ) -> None:
        entry = EventOutbox(channel=channel, event_type=event_type, payload=payload)
        self.db.add(entry)
