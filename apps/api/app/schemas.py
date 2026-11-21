"""Wire models from canonical contracts, plus the common HTTP envelope."""

from typing import Generic, TypeVar

from earthlab_contracts.models import ApiError, Evaluation, ModelMetadata, Prediction, ResponseMeta, Scenario
from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


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
