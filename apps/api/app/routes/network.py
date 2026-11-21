"""Reserved for the infrastructure workstream; no network calculations are fabricated."""

from fastapi import APIRouter, Query, Request

from app.config import REGION_ID
from app.openapi import json_request_body
from app.responses import reject

router = APIRouter(prefix="/api/v1", tags=["unavailable integrations"])


@router.get("/network", status_code=503)
def network(request: Request, regionId: str = Query(default=REGION_ID)):
    request.app.state.fixtures.validate_region(regionId)
    reject(503, "network_unavailable", "The illustrative network workstream is not implemented yet.")


@router.post("/network/compare", status_code=503, openapi_extra={"requestBody": json_request_body("NetworkCompareRequest")})
def compare_network():
    reject(503, "network_unavailable", "No connectivity model is available to compare interventions.")
