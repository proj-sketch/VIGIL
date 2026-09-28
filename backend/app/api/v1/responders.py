"""
api/v1/responders.py — Responder REST endpoints.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.db.models.enums import ResponderType
from app.domain.responders.service import ResponderService

router = APIRouter(prefix="/responders", tags=["responders"])


class CreateResponderRequest(BaseModel):
    name: str
    unit_id: str
    responder_type: str
    latitude: float | None = None
    longitude: float | None = None


class ResponderResponse(BaseModel):
    id: str
    name: str
    unit_id: str
    responder_type: str
    status: str
    latitude: float | None
    longitude: float | None
    last_location_update: str | None


def _to_response(r) -> ResponderResponse:
    return ResponderResponse(
        id=str(r.id),
        name=r.name,
        unit_id=r.unit_id,
        responder_type=r.responder_type.value,
        status=r.status.value,
        latitude=r.latitude,
        longitude=r.longitude,
        last_location_update=r.last_location_update.isoformat() if r.last_location_update else None,
    )


@router.post("", response_model=ResponderResponse, status_code=status.HTTP_201_CREATED)
async def create_responder(
    request: CreateResponderRequest,
    db: AsyncSession = Depends(get_db),
) -> ResponderResponse:
    svc = ResponderService(db)
    responder = await svc.create_responder(
        name=request.name,
        unit_id=request.unit_id,
        responder_type=ResponderType(request.responder_type),
        latitude=request.latitude,
        longitude=request.longitude,
    )
    await db.commit()
    return _to_response(responder)


@router.get("", response_model=list[ResponderResponse])
async def list_responders(
    available_only: bool = Query(False),
    responder_type: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
) -> list[ResponderResponse]:
    svc = ResponderService(db)
    rtype = ResponderType(responder_type) if responder_type else None
    if available_only:
        responders = await svc.list_available(rtype)
    else:
        from sqlalchemy import select
        from app.db.models.responders import Responder
        stmt = select(Responder)
        if rtype:
            stmt = stmt.where(Responder.responder_type == rtype)
        result = await db.execute(stmt)
        responders = list(result.scalars().all())
    return [_to_response(r) for r in responders]


@router.get("/{responder_id}", response_model=ResponderResponse)
async def get_responder(
    responder_id: str,
    db: AsyncSession = Depends(get_db),
) -> ResponderResponse:
    svc = ResponderService(db)
    return _to_response(await svc.get_responder(uuid.UUID(responder_id)))


@router.patch("/{responder_id}/location")
async def update_responder_location(
    responder_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = ResponderService(db)
    responder = await svc.update_location(
        responder_id=uuid.UUID(responder_id),
        latitude=float(body["latitude"]),
        longitude=float(body["longitude"]),
    )
    await db.commit()
    return {"id": str(responder.id), "lat": responder.latitude, "lon": responder.longitude}


@router.post("/{responder_id}/assign")
async def assign_responder(
    responder_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
) -> dict:
    svc = ResponderService(db)
    assignment = await svc.assign_responder(
        incident_id=uuid.UUID(body["incident_id"]),
        responder_id=uuid.UUID(responder_id),
        actor_id=body.get("actor_id", "api"),
    )
    await db.commit()
    return {"assignment_id": str(assignment.id), "status": assignment.status.value}
