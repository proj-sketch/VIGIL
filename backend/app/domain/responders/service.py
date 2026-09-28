"""
domain/responders/service.py — ResponderService.
"""
from __future__ import annotations

import math
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundException, ResponderUnavailableException
from app.core.logging import get_logger
from app.db.models.audit import AuditLog, EventOutbox
from app.db.models.enums import (
    ActorRole, AssignmentStatus, ResponderStatus, ResponderType, IncidentStatus,
)
from app.db.models.responders import Responder, ResponderAssignment

logger = get_logger(__name__)


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine distance in km between two lat/lon points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


class ResponderService:

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_responder(
        self,
        name: str,
        unit_id: str,
        responder_type: ResponderType,
        latitude: float | None = None,
        longitude: float | None = None,
    ) -> Responder:
        responder = Responder(
            name=name,
            unit_id=unit_id,
            responder_type=responder_type,
            status=ResponderStatus.AVAILABLE,
            latitude=latitude,
            longitude=longitude,
        )
        self.db.add(responder)
        await self.db.flush()
        logger.info("responder.created", unit_id=unit_id, type=responder_type.value)
        return responder

    async def get_responder(self, responder_id: uuid.UUID) -> Responder:
        stmt = select(Responder).where(Responder.id == responder_id)
        result = await self.db.execute(stmt)
        r = result.scalar_one_or_none()
        if not r:
            raise NotFoundException("Responder", str(responder_id))
        return r

    async def list_available(
        self,
        responder_type: ResponderType | None = None,
    ) -> list[Responder]:
        stmt = select(Responder).where(Responder.status == ResponderStatus.AVAILABLE)
        if responder_type:
            stmt = stmt.where(Responder.responder_type == responder_type)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def find_nearest_available(
        self,
        responder_type: ResponderType,
        incident_lat: float,
        incident_lon: float,
        max_results: int = 5,
    ) -> list[tuple[Responder, float]]:
        """Return available responders sorted by distance to incident, with km distance."""
        available = await self.list_available(responder_type)
        with_distance = []
        for r in available:
            if r.latitude is not None and r.longitude is not None:
                dist = _haversine_km(incident_lat, incident_lon, r.latitude, r.longitude)
                with_distance.append((r, dist))
            else:
                with_distance.append((r, 9999.0))  # Unknown location — deprioritise
        with_distance.sort(key=lambda x: x[1])
        return with_distance[:max_results]

    async def assign_responder(
        self,
        incident_id: uuid.UUID,
        responder_id: uuid.UUID,
        actor_id: str,
    ) -> ResponderAssignment:
        """Assign a responder to an incident with row-level locking."""
        # Lock the responder row
        stmt = (
            select(Responder)
            .where(Responder.id == responder_id)
            .with_for_update()
        )
        result = await self.db.execute(stmt)
        responder = result.scalar_one_or_none()
        if not responder:
            raise NotFoundException("Responder", str(responder_id))

        if responder.status != ResponderStatus.AVAILABLE:
            raise ResponderUnavailableException(str(responder_id))

        # Create assignment
        assignment = ResponderAssignment(
            incident_id=incident_id,
            responder_id=responder_id,
            status=AssignmentStatus.PENDING,
        )
        self.db.add(assignment)
        responder.status = ResponderStatus.ASSIGNED
        responder.updated_at = datetime.now(UTC)
        await self.db.flush()

        # Audit + outbox
        audit = AuditLog(
            incident_id=incident_id,
            actor_id=actor_id,
            actor_role=ActorRole.OPERATOR,
            action="responder.assigned",
            before_state={"responder_status": ResponderStatus.AVAILABLE.value},
            after_state={"responder_status": ResponderStatus.ASSIGNED.value, "assignment_id": str(assignment.id)},
            metadata_={"responder_unit_id": responder.unit_id},
        )
        self.db.add(audit)
        outbox = EventOutbox(
            channel=f"incident:{incident_id}",
            event_type="responder.assigned",
            payload={
                "incident_id": str(incident_id),
                "responder_id": str(responder_id),
                "responder_unit_id": responder.unit_id,
                "assignment_id": str(assignment.id),
            },
        )
        self.db.add(outbox)
        logger.info(
            "responder.assigned",
            incident_id=str(incident_id),
            responder_unit_id=responder.unit_id,
        )
        return assignment

    async def update_location(
        self,
        responder_id: uuid.UUID,
        latitude: float,
        longitude: float,
    ) -> Responder:
        responder = await self.get_responder(responder_id)
        responder.latitude = latitude
        responder.longitude = longitude
        responder.last_location_update = datetime.now(UTC)
        outbox = EventOutbox(
            channel=f"responder:{responder_id}",
            event_type="responder.location_updated",
            payload={"responder_id": str(responder_id), "lat": latitude, "lon": longitude},
        )
        self.db.add(outbox)
        return responder
