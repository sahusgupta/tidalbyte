"""Illustrative Houston connectivity and intervention analysis."""

from earthlab_contracts.models import PlanComparison
from earthlab_contracts.validation import validate_contract
from fastapi import APIRouter, Query, Request
from jsonschema import ValidationError

from app.config import REGION_ID
from app.openapi import json_request_body
from app.responses import envelope, reject
from app.schemas import ResponseEnvelope
from app.services.network import LIMITATIONS, InvalidPlan, load_network

router = APIRouter(prefix="/api/v1", tags=["illustrative network"])
compare_body = json_request_body("NetworkCompareRequest")
compare_body["description"] = "Assumed disruptions and up to three distinct intervention assets."


def get_network():
    try:
        return load_network()
    except ModuleNotFoundError as error:
        if error.name != "networkx":
            raise
        reject(503, "network_unavailable", "The optional NetworkX graph dependency is missing.")


def network_response(request, graph, data):
    result = envelope(request, data, warnings=LIMITATIONS)
    result["meta"]["sourceIds"] = [graph.fixture["sourceId"]]
    return result


async def read_plan(request):
    try:
        plan = await request.json()
        validate_contract("NetworkCompareRequest", plan)
    except (ValueError, ValidationError):
        reject(422, "invalid_network_plan", "The request must match the v1 network comparison schema.")
    return plan


def compare_plan(graph, plan):
    try:
        return graph.compare(plan)
    except InvalidPlan as error:
        reject(422, "invalid_intervention", str(error))


@router.get("/network", response_model=ResponseEnvelope[dict])
def network(request: Request, regionId: str = Query(default=REGION_ID)):
    request.app.state.fixtures.validate_region(regionId)
    graph = get_network()
    return network_response(request, graph, graph.fixture)


@router.post(
    "/network/compare",
    response_model=ResponseEnvelope[PlanComparison],
    openapi_extra={"requestBody": compare_body},
)
async def compare_network(request: Request):
    plan = await read_plan(request)
    graph = get_network()
    baseline, proposal, _ = compare_plan(graph, plan)
    return network_response(request, graph, {
        "baseline": baseline["metrics"],
        "proposal": proposal["metrics"],
        "limitations": LIMITATIONS,
        "graphSource": graph.fixture["sourceId"],
        "mode": "hypothetical_connectivity",
    })


@router.post(
    "/network/preview",
    response_model=ResponseEnvelope[dict],
    openapi_extra={"requestBody": compare_body},
)
async def preview_network(request: Request):
    plan = await read_plan(request)
    graph = get_network()
    return network_response(request, graph, graph.preview(*compare_plan(graph, plan)))


@router.get("/network/strategy", response_model=ResponseEnvelope[dict])
def network_strategy(request: Request, regionId: str = Query(default=REGION_ID)):
    request.app.state.fixtures.validate_region(regionId)
    graph = get_network()
    return network_response(request, graph, graph.strategy())
