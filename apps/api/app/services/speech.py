"""Handle one bounded push-to-talk recording and transcribe it with ElevenLabs."""

import os
import re
import asyncio
from email import policy
from email.parser import BytesHeaderParser

from fastapi import Request
import httpx

from app.responses import reject
from app.services.ai import ProviderUnavailable, provider_json, read_limited_body, reserve_provider_call

MAX_AUDIO_BYTES = 4 * 1024 * 1024
_MULTIPART_OVERHEAD = 8 * 1024
_BOUNDARY_PATTERN = re.compile(r"[A-Za-z0-9'()+_,./:=?-]{1,70}", re.ASCII)
_AUDIO_TYPES = {
    "audio/webm": ("recording.webm", b"\x1a\x45\xdf\xa3"),
    "video/webm": ("recording.webm", b"\x1a\x45\xdf\xa3"),
    "audio/ogg": ("recording.ogg", b"OggS"),
    "audio/wav": ("recording.wav", b"RIFF"),
    "audio/x-wav": ("recording.wav", b"RIFF"),
    "audio/mp4": ("recording.mp4", b"ftyp"),
}
EXAMPLE_TRANSCRIPT = "Show the Houston offline example"


async def read_audio(request: Request) -> tuple[bytes, str, str]:
    content_type = request.headers.get("content-type", "")
    if "\r" in content_type or "\n" in content_type:
        reject(422, "invalid_upload", "Upload one recording using the multipart audio field.")
    content = BytesHeaderParser(policy=policy.default).parsebytes(
        b"Content-Type: " + content_type.encode("latin-1") + b"\r\n\r\n"
    )
    boundary = content.get_boundary()
    if content.get_content_type() != "multipart/form-data" or not _BOUNDARY_PATTERN.fullmatch(boundary or ""):
        reject(422, "invalid_upload", "Upload one recording using the multipart audio field.")
    body = await read_limited_body(request, MAX_AUDIO_BYTES + _MULTIPART_OVERHEAD)

    # MediaRecorder clients send one binary file part. Leave the bytes untouched by
    # MIME transfer decoding and reject additional form fields and repeated files.
    delimiter = b"--" + boundary.encode("ascii")
    if not body.startswith(delimiter + b"\r\n"):
        reject(422, "invalid_upload", "The audio multipart body is malformed.")
    header_start = len(delimiter) + 2
    header_end = body.find(b"\r\n\r\n", header_start, header_start + _MULTIPART_OVERHEAD)
    if header_end == -1:
        reject(422, "invalid_upload", "The audio multipart headers are missing or too large.")
    audio_start = header_end + 4
    closing = body.find(b"\r\n" + delimiter, audio_start)
    # A delimiter prefix can occur in the binary payload without being a delimiter.
    while closing != -1:
        suffix = closing + len(delimiter) + 2
        if body[suffix:suffix + 2] in (b"--", b"\r\n"):
            break
        closing = body.find(b"\r\n" + delimiter, suffix)
    if closing == -1 or body[suffix:] not in (b"--", b"--\r\n"):
        reject(422, "invalid_upload", "Upload exactly one audio file with no additional fields.")
    if closing == audio_start:
        reject(422, "invalid_audio", "The recording is empty.")
    if closing - audio_start > MAX_AUDIO_BYTES:
        reject(413, "payload_too_large", "Audio recordings are limited to 4 MiB.")

    part = BytesHeaderParser(policy=policy.default).parsebytes(bytes(body[header_start:audio_start]))
    if (
        part.defects
        or len(part.get_all("Content-Disposition", [])) != 1
        or len(part.get_all("Content-Type", [])) != 1
        or part.get_content_disposition() != "form-data"
        or part.get_param("name", header="content-disposition") != "audio"
        or not part.get_filename()
        or "Content-Transfer-Encoding" in part
    ):
        reject(422, "invalid_upload", "Upload a single binary file in the audio field.")
    media_type = part.get_content_type()
    if media_type not in _AUDIO_TYPES:
        reject(422, "unsupported_audio_type", "Record WebM, Ogg, WAV, or MP4 audio.")
    filename, signature = _AUDIO_TYPES[media_type]
    audio = bytes(body[audio_start:closing])
    signature_offset = 4 if media_type == "audio/mp4" else 0
    if not audio.startswith(signature, signature_offset) or (
        filename == "recording.wav" and audio[8:12] != b"WAVE"
    ):
        reject(422, "invalid_audio", "The recording does not match its audio format.")
    return audio, filename, media_type


async def transcribe_audio(audio: bytes, filename: str, media_type: str) -> tuple[str, str]:
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not api_key:
        return EXAMPLE_TRANSCRIPT, "OFFLINE EXAMPLE: Sample transcript. ElevenLabs is unconfigured."
    try:
        result = await provider_json(
            "elevenlabs",
            "https://api.elevenlabs.io/v1/speech-to-text",
            timeout=12,
            headers={"xi-api-key": api_key},
            data={"model_id": "scribe_v2", "tag_audio_events": "false", "timestamps_granularity": "none"},
            files={"file": (filename, audio, media_type)},
        )
        transcript = result.get("text") if isinstance(result, dict) else None
        if not isinstance(transcript, str) or len(transcript.strip()) > 2000:
            raise ProviderUnavailable
    except ProviderUnavailable:
        return EXAMPLE_TRANSCRIPT, "OFFLINE EXAMPLE: Sample transcript. ElevenLabs could not transcribe the recording."
    if not transcript.strip():
        return "", "ElevenLabs detected no speech. Record again or type a command."
    return transcript.strip(), "Transcript provided by ElevenLabs. Review the text before sending it for interpretation."


async def narrate_text(text: str) -> bytes:
    """Read the supplied computed summary verbatim; never generate planning content."""
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
    if not api_key or not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", voice_id):
        reject(503, "voice_unavailable", "Speech narration is not configured. The computed summary remains available as text.")
    reserve_provider_call("elevenlabs")
    try:
        async with asyncio.timeout(15), httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
            async with client.stream(
                "POST", f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                params={"output_format": "mp3_44100_128"},
                headers={"xi-api-key": api_key, "Accept": "audio/mpeg"}, json={"text": text},
            ) as response:
                response.raise_for_status()
                if response.headers.get("content-type", "").split(";")[0] != "audio/mpeg":
                    raise ProviderUnavailable
                audio = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(audio) + len(chunk) > MAX_AUDIO_BYTES:
                        raise ProviderUnavailable
                    audio.extend(chunk)
        if not (audio.startswith(b"ID3") or (len(audio) > 1 and audio[0] == 255 and audio[1] & 224 == 224)):
            raise ProviderUnavailable
        return bytes(audio)
    except (TimeoutError, httpx.HTTPError, ProviderUnavailable):
        reject(503, "voice_unavailable", "Speech narration is unavailable. Read the computed summary or try again.")
