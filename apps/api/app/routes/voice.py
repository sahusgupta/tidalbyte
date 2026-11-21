"""Reserved voice surface; no credentials or external calls in the bootstrap."""

from fastapi import APIRouter

from app.responses import reject

router = APIRouter(prefix="/api/v1/voice", tags=["unavailable integrations"])


@router.post("/transcribe", status_code=503)
def transcribe():
    reject(503, "voice_unavailable", "Speech transcription is not configured; use the manual controls.")


@router.post("/speak", status_code=503)
def speak():
    reject(503, "voice_unavailable", "Speech narration is not configured.")
