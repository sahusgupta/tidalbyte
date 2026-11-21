from fastapi import APIRouter, Query, Request

from app.config import REGION_ID, SOURCE_ID
from app.responses import envelope
from app.schemas import Evaluation, ResponseEnvelope, Scenario

router = APIRouter(prefix="/api/v1", tags=["offline example"])


@router.get("/catalog/regions", response_model=ResponseEnvelope[list[dict]], response_model_exclude_unset=True)
def regions(request: Request):
    return envelope(
        request,
        [{
            "id": REGION_ID,
            "name": "Houston Gulf Coast",
            "dataMode": "offline_example",
            "sourceIds": [SOURCE_ID],
            "attribution": "EarthLab project-generated schematic polygons; not official county boundaries.",
        }],
    )


@router.get("/catalog/events", response_model=ResponseEnvelope[list[dict]], response_model_exclude_unset=True)
def events(request: Request, regionId: str = Query(default=REGION_ID)):
    fixtures = request.app.state.fixtures
    fixtures.validate_region(regionId)
    preset = fixtures.preset
    return envelope(
        request,
        [{
            "id": preset["presetEventId"],
            "regionId": REGION_ID,
            "name": "Offline warning example",
            "eventTimeUtc": preset["selection"]["eventTimeUtc"],
            "warningTypes": preset["selection"]["warningTypes"],
            "dataMode": "offline_example",
            "sourceIds": [SOURCE_ID],
            "description": "A project-generated preset, not a verified historical weather event.",
        }],
    )


@router.get("/geo/counties", response_model=ResponseEnvelope[dict], response_model_exclude_unset=True)
def counties(request: Request, regionId: str = Query(default=REGION_ID)):
    fixtures = request.app.state.fixtures
    fixtures.validate_region(regionId)
    return envelope(
        request,
        fixtures.counties,
        warnings=["Schematic demonstration polygons; these are not official county boundaries."],
    )


@router.post("/scenarios/evaluate", response_model=ResponseEnvelope[Evaluation], response_model_exclude_unset=True)
async def evaluate(scenario: Scenario, request: Request):
    result = request.app.state.fixtures.evaluate(scenario, await request.json())
    return envelope(request, result)
