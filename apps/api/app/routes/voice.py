"""Reserved voice surface; no credentials or external calls in the bootstrap."""

from fastapi import APIRouter

from app.openapi import json_request_body
from app.responses import reject

router = APIRouter(prefix="/api/v1/voice", tags=["unavailable integrations"])


@router.post(
    "/transcribe",
    status_code=503,
    openapi_extra={"requestBody": {
        "required": True,
        "description": "Reserved audio upload. The bootstrap returns 503 without reading or sending audio.",
        "content": {"multipart/form-data": {"schema": {
            "type": "object", "required": ["audio"],
            "properties": {"audio": {"type": "string", "format": "binary"}},
            "additionalProperties": False,
        }}},
    }},
)
def transcribe():
    reject(503, "voice_unavailable", "Speech transcription is not configured; use the manual controls.")


@router.post("/speak", status_code=503, openapi_extra={"requestBody": json_request_body("VoiceSpeakRequest")})
def speak():
    reject(503, "voice_unavailable", "Speech narration is not configured.")
