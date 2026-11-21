"""Interpret typed or transcribed text as a validated command proposal."""

import json

from earthlab_contracts.models import Interpretation, InterpretRequest
from earthlab_contracts.validation import validate_contract
from fastapi import APIRouter, Request
from jsonschema import ValidationError as ContractError

from app.openapi import json_request_body
from app.responses import envelope, reject
from app.schemas import ResponseEnvelope
from app.services.ai import interpret_text, read_limited_body

router = APIRouter(prefix="/api/v1/ai", tags=["command interpretation"])
_BODY = json_request_body("InterpretRequest")
_BODY["description"] = "Text and the complete active Scenario. The server returns a proposal or clarification."


@router.post(
    "/interpret",
    response_model=ResponseEnvelope[Interpretation],
    response_model_exclude_unset=True,
    responses={413: {"description": "Request exceeds 32 KiB"}, 429: {"description": "Provider request limit reached"}},
    openapi_extra={"requestBody": _BODY},
)
async def interpret(request: Request):
    body = await read_limited_body(request, 32 * 1024)
    try:
        raw = json.loads(body)
        validate_contract("InterpretRequest", raw)
        command = InterpretRequest.model_validate(raw)
    except (ValueError, ContractError, RecursionError):
        reject(422, "invalid_request", "Supply text and a current scenario matching the v1 contract.")
    text = command.text.strip()
    if not text:
        reject(422, "invalid_text", "Enter a command or review the transcript and try again.")
    fixtures = request.app.state.fixtures
    fixtures.evaluate(command.scenarioSummary, raw["scenarioSummary"])
    result, warning = await interpret_text(text, command.scenarioSummary, fixtures.preset["presetEventId"])
    return envelope(request, result.model_dump(mode="json", exclude_unset=True), warnings=[warning])
