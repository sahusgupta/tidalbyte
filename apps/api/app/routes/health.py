from fastapi import APIRouter, Request

from app.responses import envelope
from app.schemas import ResponseEnvelope

router = APIRouter(tags=["health"])


@router.get("/healthz", response_model=ResponseEnvelope[dict], response_model_exclude_unset=True)
def health(request: Request):
    return envelope(request, {"status": "ok", "service": "earthlab-api"})


@router.get("/readyz", response_model=ResponseEnvelope[dict], response_model_exclude_unset=True)
def ready(request: Request):
    return envelope(
        request,
        {"status": "ready", "offlineFixture": True, "trainedModel": False},
    )
