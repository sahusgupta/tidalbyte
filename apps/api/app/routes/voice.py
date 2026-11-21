"""Push-to-talk transcription with a typed fallback."""

import json

from fastapi import APIRouter, Request, Response
from earthlab_contracts.validation import validate_contract
from jsonschema import ValidationError as ContractError

from app.openapi import json_request_body
from app.responses import envelope, reject
from app.schemas import ResponseEnvelope
from app.services.speech import narrate_text, read_audio, transcribe_audio
from app.services.ai import read_limited_body

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


@router.post(
    "/speak", response_class=Response,
    responses={200: {"description": "ElevenLabs narration of the supplied computed summary", "content": {"audio/mpeg": {"schema": {"type": "string", "format": "binary"}}}},
               413: {"description": "Request exceeds 16 KiB"}, 422: {"description": "Invalid summary"},
               429: {"description": "Provider request limit reached"}, 503: {"description": "Narration unavailable"}},
    openapi_extra={"requestBody": json_request_body("VoiceSpeakRequest")},
)
async def speak(request: Request):
    body = await read_limited_body(request, 16 * 1024)
    try:
        raw = json.loads(body)
        validate_contract("VoiceSpeakRequest", raw)
        text = raw["text"].strip()
        if not text:
            raise ValueError
    except (ValueError, ContractError, RecursionError):
        reject(422, "invalid_request", "Supply a computed summary of 1–2,000 characters.")
    audio = await narrate_text(text)
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store", "X-Speech-Provider": "ElevenLabs"})
