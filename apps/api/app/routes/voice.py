"""Push-to-talk transcription with a typed fallback."""

from fastapi import APIRouter, Request

from app.openapi import json_request_body
from app.responses import envelope, reject
from app.schemas import ResponseEnvelope
from app.services.speech import read_audio, transcribe_audio

router = APIRouter(prefix="/api/v1/voice", tags=["voice"])


@router.post(
    "/transcribe",
    response_model=ResponseEnvelope[dict[str, str]],
    responses={413: {"description": "Audio exceeds 4 MiB"}, 429: {"description": "Provider request limit reached"}},
    openapi_extra={"requestBody": {
        "required": True,
        "description": "Upload one WebM, Ogg, WAV, or MP4 recording using the audio field.",
        "content": {"multipart/form-data": {"schema": {
            "type": "object", "required": ["audio"],
            "properties": {"audio": {"type": "string", "format": "binary"}},
            "additionalProperties": False,
        }}},
    }},
)
async def transcribe(request: Request):
    audio, filename, media_type = await read_audio(request)
    transcript, warning = await transcribe_audio(audio, filename, media_type)
    return envelope(request, {"transcript": transcript}, warnings=[warning])


@router.post("/speak", status_code=503, openapi_extra={"requestBody": json_request_body("VoiceSpeakRequest")})
def speak():
    reject(503, "voice_unavailable", "Speech narration is not configured.")
