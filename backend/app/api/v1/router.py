"""
api/v1/router.py — API v1 router: all REST endpoints registered here.
"""
from fastapi import APIRouter

from app.api.v1.health import router as health_router
from app.api.v1.voice import router as voice_router
from app.api.v1.incidents import router as incidents_router
from app.api.v1.responders import router as responders_router

api_v1_router = APIRouter(prefix="/api/v1")

api_v1_router.include_router(health_router)
api_v1_router.include_router(voice_router)
api_v1_router.include_router(incidents_router)
api_v1_router.include_router(responders_router)
