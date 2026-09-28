"""
api/v1/incidents.py — Incident REST CRUD endpoints.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.exceptions import NotFoundException
from app.db.models.enums import ActorRole, IncidentSeverity, IncidentStatus, IncidentType
from app.domain.incidents.service import IncidentService

router = APIRouter(prefix="/incidents", tags=["incidents"])


class CreateIncidentRequest(BaseModel):
    description: str = Field(..., min_length=5)
    location_text: str | None = None
    incident_type: str | None = None
    severity: str | None = None


class IncidentResponse(BaseModel):
    id: str
    reference_number: str
    status: str
    type: str | None
    severity: str | None
    description: str | None
    location_text: str | None
    address_resolved: str | None
    latitude: float | None
    longitude: float | None
    created_at: str
    updated_at: str
    triaged_at: str | None
    dispatched_at: str | None
    resolved_at: str | None


def _to_response(incident) -> IncidentResponse:
    return IncidentResponse(
        id=str(incident.id),
        reference_number=incident.reference_number,
        status=incident.status.value,
        type=incident.type.value if incident.type else None,
        severity=incident.severity.value if incident.severity else None,
        description=incident.description,
        location_text=incident.location_text,
        address_resolved=incident.address_resolved,
        latitude=incident.latitude,
        longitude=incident.longitude,
        created_at=incident.created_at.isoformat(),
        updated_at=incident.updated_at.isoformat(),
        triaged_at=incident.triaged_at.isoformat() if incident.triaged_at else None,
        dispatched_at=incident.dispatched_at.isoformat() if incident.dispatched_at else None,
        resolved_at=incident.resolved_at.isoformat() if incident.resolved_at else None,
    )


@router.post("", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
async def create_incident(
    request: CreateIncidentRequest,
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    svc = IncidentService(db)
    inc_type = IncidentType(request.incident_type) if request.incident_type else None
    severity = IncidentSeverity(request.severity) if request.severity else None
    incident = await svc.create_incident(
        description=request.description,
        location_text=request.location_text,
        reporter_conversation_id=None,
        actor_id="api:direct",
        incident_type=inc_type,
        incident_severity=severity,
    )
    await db.commit()
    return _to_response(incident)


@router.get("", response_model=list[IncidentResponse])
async def list_incidents(
    status: str | None = Query(None),
    incident_type: str | None = Query(None, alias="type"),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
) -> list[IncidentResponse]:
    svc = IncidentService(db)
    status_enum = IncidentStatus(status) if status else None
    type_enum = IncidentType(incident_type) if incident_type else None
    incidents = await svc.list_incidents(status=status_enum, incident_type=type_enum, limit=limit, offset=offset)
    return [_to_response(i) for i in incidents]


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
) -> IncidentResponse:
    svc = IncidentService(db)
    incident = await svc.get_incident(uuid.UUID(incident_id))
    return _to_response(incident)


@router.patch("/{incident_id}/status")
async def update_incident_status(
    incident_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = IncidentService(db)
    target_status = IncidentStatus(body["status"])
    incident = await svc.transition_status(
        incident_id=uuid.UUID(incident_id),
        target_status=target_status,
        actor_id=body.get("actor_id", "api"),
        actor_role=ActorRole.OPERATOR,
        reason=body.get("reason"),
    )
    await db.commit()
    return {"id": str(incident.id), "status": incident.status.value}


@router.get("/{incident_id}/facts")
async def get_incident_facts(
    incident_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    svc = IncidentService(db)
    incident = await svc.get_incident(uuid.UUID(incident_id))
    return [
        {
            "id": str(f.id),
            "fact_type": f.fact_type,
            "value": f.value,
            "confidence": f.confidence,
            "source": f.source,
            "is_current": f.is_current,
            "created_at": f.created_at.isoformat(),
        }
        for f in incident.facts
    ]
