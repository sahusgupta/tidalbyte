"""Document reserved provider bodies from the frozen schemas without parsing them."""

import json
from typing import Any

from app.config import CONTRACT_DIR


def json_request_body(name: str) -> dict[str, Any]:
    """Inline the small acyclic canonical schema into a portable OpenAPI body."""
    registry = json.loads((CONTRACT_DIR / "api.schema.json").read_text(encoding="utf-8"))

    def inline(value):
        if isinstance(value, list):
            return [inline(item) for item in value]
        if not isinstance(value, dict):
            return value
        if "$ref" in value:
            reference = value["$ref"]
            if reference.startswith("#/$defs/"):
                return inline(registry["$defs"][reference.removeprefix("#/$defs/")])
            if reference in {"scenario.schema.json", "command.schema.json"}:
                return inline(json.loads((CONTRACT_DIR / reference).read_text(encoding="utf-8")))
            raise ValueError(f"Unsupported canonical schema reference: {reference}")
        return {key: inline(item) for key, item in value.items() if key not in {"$schema", "$id", "$defs"}}

    return {
        "required": True,
        "description": "Reserved v1 input shape. This bootstrap returns 503 before processing any provider request.",
        "content": {"application/json": {"schema": inline(registry["$defs"][name])}},
    }
