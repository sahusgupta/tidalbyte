"""Model metadata handoff: no trained inference is implemented by the bootstrap."""

from fastapi import APIRouter, Request

from app.responses import envelope
from app.schemas import ModelMetadata, ResponseEnvelope

router = APIRouter(prefix="/api/v1", tags=["model"])


@router.get("/models/current", response_model=ResponseEnvelope[ModelMetadata])
def current_model(request: Request):
    return envelope(request, request.app.state.fixtures.evaluation["modelMetadata"])
