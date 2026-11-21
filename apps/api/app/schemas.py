"""Wire models from canonical contracts, plus the common HTTP envelope."""

from typing import Any, Generic, Literal, TypeVar

from earthlab_contracts.models import Evaluation, ModelMetadata, Prediction, Scenario
from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class ResponseMeta(BaseModel):
    model_config = ConfigDict(extra="forbid")

    requestId: str
    mode: Literal["historical_context", "exploratory_what_if", "offline_example"]
    sourceIds: list[str]
    warnings: list[str]


class ApiError(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str
    details: list[dict[str, Any]] = Field(default_factory=list)


class ResponseEnvelope(BaseModel, Generic[T]):
    model_config = ConfigDict(extra="forbid")

    data: T | None
    meta: ResponseMeta
    error: ApiError | None


__all__ = [
    "ApiError",
    "Evaluation",
    "ModelMetadata",
    "Prediction",
    "ResponseEnvelope",
    "ResponseMeta",
    "Scenario",
]
