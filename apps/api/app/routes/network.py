"""Illustrative Houston connectivity, interventions and resource allocation."""

import json

from earthlab_contracts.models import (
    AllocationEvaluation,
    AllocationRequest,
    AllocationResult,
    PlanComparison,
)
from earthlab_contracts.validation import validate_contract
from fastapi import APIRouter, Query, Request
from jsonschema import ValidationError

from app.config import REGION_ID
from app.openapi import json_request_body
from app.responses import envelope, reject
from app.schemas import ResponseEnvelope
from app.services.network import LIMITATIONS, InvalidPlan, load_network
from app.services.storm_planning import StormPlanRequest, StormPortfolioGame
from app.services.allocation import (
    ASSUMPTION_SET,
    LIMITATIONS as ALLOCATION_LIMITATIONS,
    AllocationEngine,
    AllocationUnavailable,
    InvalidAllocation,
    demo_request,
)

router = APIRouter(prefix="/api/v1", tags=["illustrative network"])
compare_body = json_request_body("NetworkCompareRequest")
compare_body["description"] = (
    "Assumed disruptions and up to three distinct intervention assets."
)


def get_network():
    try:
        return load_network()
    except ModuleNotFoundError as error:
        if error.name != "networkx":
            raise
        reject(
            503,
            "network_unavailable",
            "The optional NetworkX graph dependency is missing.",
        )


def network_response(request, graph, data):
    result = envelope(request, data, warnings=LIMITATIONS)
    result["meta"]["sourceIds"] = [graph.fixture["sourceId"]]
    return result


async def read_plan(request):
    try:
        plan = await request.json()
        validate_contract("NetworkCompareRequest", plan)
    except (ValueError, ValidationError):
        reject(
            422,
            "invalid_network_plan",
            "The request must match the v1 network comparison schema.",
        )
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
    return network_response(
        request,
        graph,
        {
            "baseline": baseline["metrics"],
            "proposal": proposal["metrics"],
            "limitations": LIMITATIONS,
            "graphSource": graph.fixture["sourceId"],
            "mode": "hypothetical_connectivity",
        },
    )


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


def allocation_response(request, graph, data, *, mode="exploratory_what_if"):
    result = envelope(request, data, warnings=[ALLOCATION_LIMITATIONS[0]])
    result["meta"]["sourceIds"] = [graph.fixture["sourceId"], ASSUMPTION_SET]
    result["meta"]["mode"] = mode
    if mode == "exploratory_what_if":
        result["meta"]["warnings"] = [ALLOCATION_LIMITATIONS[0]]
    return result


def invalid_json_number(value):
    raise ValueError(f"Non-JSON numeric constant: {value}")


async def read_allocation(request):
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > 32 * 1024:
            reject(
                413,
                "allocation_too_large",
                "Allocation requests are limited to 32 KiB.",
            )
        body.extend(chunk)
    try:
        raw = json.loads(body, parse_constant=invalid_json_number)
        validate_contract("AllocationRequest", raw)
    except (ValueError, ValidationError, RecursionError):
        reject(
            422,
            "invalid_allocation_request",
            "Supply a supported v1 Houston allocation scenario with bounded resources and preferences.",
        )
    return raw


def allocation_engine(graph, raw):
    try:
        return AllocationEngine(graph, raw)
    except InvalidAllocation as error:
        reject(422, "invalid_allocation_scenario", str(error))
    except AllocationUnavailable as error:
        reject(503, "allocation_unavailable", str(error))


allocation_body = json_request_body("AllocationRequest")
allocation_body["description"] = (
    "Revision 1 of the illustrative Houston allocation scenario. Footprint exposure alone never blocks a road."
)


@router.get(
    "/allocation/demo",
    response_model=ResponseEnvelope[AllocationRequest],
    response_model_exclude_unset=True,
)
def allocation_demo(request: Request):
    graph = get_network()
    return allocation_response(request, graph, demo_request(), mode="offline_example")


@router.post(
    "/allocation/scenarios/evaluate",
    response_model=ResponseEnvelope[AllocationEvaluation],
    response_model_exclude_unset=True,
    openapi_extra={"requestBody": allocation_body},
    responses={
        413: {"model": ResponseEnvelope[dict], "description": "Request exceeds 32 KiB"}
    },
)
async def evaluate_allocation(request: Request):
    raw = await read_allocation(request)
    graph = get_network()
    return allocation_response(
        request, graph, allocation_engine(graph, raw).evaluation()
    )


@router.post(
    "/allocation/plans/compare",
    response_model=ResponseEnvelope[AllocationResult],
    response_model_exclude_unset=True,
    openapi_extra={"requestBody": allocation_body},
    responses={
        413: {"model": ResponseEnvelope[dict], "description": "Request exceeds 32 KiB"}
    },
)
async def compare_allocation(request: Request):
    raw = await read_allocation(request)
    graph = get_network()
    return allocation_response(request, graph, allocation_engine(graph, raw).solve())


@router.post("/allocation/storm/compare", response_model=ResponseEnvelope[dict])
def compare_storm(request: Request, inputs: StormPlanRequest):
    """Solve a bounded planning game from paired AquaGrid network-routing measurements."""
    result = envelope(request, StormPortfolioGame(inputs).compare())
    result["meta"].update(
        mode="exploratory_what_if",
        sourceIds=["project:aquagrid-storm-routing", "project:houston-road-adaptation-v1"],
        warnings=["Roadway treatments, costs, available crews and agency reporting precision are illustrative."],
    )
    return result
