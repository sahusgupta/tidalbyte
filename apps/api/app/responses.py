"""The same envelope and request provenance are used by success and error paths."""

from typing import Any

from fastapi import HTTPException, Request

from app.config import OFFLINE_WARNING, SOURCE_ID


def envelope(
    request: Request,
    data: Any = None,
    *,
    error: dict[str, Any] | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "data": data,
        "meta": {
            "requestId": request.state.request_id,
            "mode": "offline_example",
            "sourceIds": [SOURCE_ID],
            "warnings": [OFFLINE_WARNING, *(warnings or [])],
        },
        "error": error,
    }


def reject(status: int, code: str, message: str, details: list[dict] | None = None) -> None:
    raise HTTPException(
        status_code=status,
        detail={"code": code, "message": message, "details": details or []},
    )
