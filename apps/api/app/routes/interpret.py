"""Reserved for validated command proposals; no text is sent to an external provider."""

from fastapi import APIRouter

from app.responses import reject

router = APIRouter(prefix="/api/v1/ai", tags=["unavailable integrations"])


@router.post("/interpret", status_code=503)
def interpret():
    reject(503, "ai_unavailable", "Gemini command proposals are not configured; use the manual controls.")
