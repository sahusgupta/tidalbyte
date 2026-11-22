"""FastAPI app.

    uvicorn aquagrid.api:app --port 8000          (from backend/)
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from importlib import import_module
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, ORJSONResponse
from pydantic import BaseModel, Field
from starlette.staticfiles import StaticFiles

from .catalog import public_meta
from .config import DEFAULT_REGION, REGIONS
from .geometry import compressed_geometry

def _preload_libraries():
    try:
        import_module(".engine", package=__package__)
    except Exception:
        # Catalog and regional geometry are still available. A simulation will retry the import.
        logging.getLogger(__name__).exception("Could not load AquaGrid inference libraries")


@asynccontextmanager
async def lifespan(app: FastAPI):
    warmup = asyncio.create_task(asyncio.to_thread(_preload_libraries))
    try:
        yield
    finally:
        await warmup


app = FastAPI(title="AquaGrid AI", version="0.1.0", default_response_class=ORJSONResponse, lifespan=lifespan)
app.add_middleware(GZipMiddleware, minimum_size=2048, compresslevel=4)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
geometry_files = StaticFiles()


def _region(rid: str):
    if rid not in REGIONS:
        raise HTTPException(404, f"unknown region {rid}")
    if not (REGIONS[rid].out_dir / "model" / "flood_xgb.ubj").exists():
        raise HTTPException(503, f"region {rid} not built: run the pipeline and training first")
    return REGIONS[rid]


class StormEventRequest(BaseModel):
    kind: Literal["flood", "hurricane"]
    track: list[tuple[float, float]] = Field(min_length=1, max_length=8, description="Origin and waypoints, WGS84 lon/lat")
    radius_km: float = Field(ge=0.2, le=20, description="Distance at which direct rainfall reaches zero")
    progress: float = Field(1, ge=0, le=1, description="Fraction of the storm track already traveled")


class SimRequest(BaseModel):
    rain: float = Field(0, ge=0, le=250, description="rain intensity, mm/h")
    duration: float = Field(1, gt=0, le=48, description="storm duration, h")
    surge: float = Field(0, ge=0, le=4, description="storm surge above high tide, m")
    clog: float = Field(0.1, ge=0, le=1, description="fraction of storm-drain capacity lost")
    vehicle: str = "ambulance"
    hospital: str | None = None
    dest: str | None = None
    dest_lonlat: tuple[float, float] | None = None
    overlay: bool = True
    event: StormEventRequest | None = None


def _validate_event_bounds(req: SimRequest, region):
    if req.event:
        west, south, east, north = region.bbox
        if any(not (west <= lon <= east and south <= lat <= north) for lon, lat in req.event.track):
            raise HTTPException(422, "Storm origin and waypoints must lie inside the selected study region.")


@app.get("/api/health")
def health():
    return {"ok": True, "default_region": DEFAULT_REGION}


@app.get("/api/regions")
def regions():
    return [dict(id=r.id, name=r.name, bbox=r.bbox, default=r.id == DEFAULT_REGION,
                 built=(r.out_dir / "model" / "flood_xgb.ubj").exists()) for r in REGIONS.values()]


@app.get("/api/regions/{rid}/meta")
def meta(rid: str):
    return public_meta(_region(rid))


def _geometry(rid: str, filename: str, request: Request):
    path = _region(rid).out_dir / "static" / filename
    encodings = {item.strip() for item in request.headers.get("accept-encoding", "").lower().split(",")}
    precompressed = compressed_geometry(path) if "gzip" in encodings and "range" not in request.headers else None
    selected = precompressed or path
    response = geometry_files.file_response(selected, selected.stat(), request.scope)
    if isinstance(response, FileResponse):
        response.chunk_size = 1024 * 1024
        if precompressed:
            response.headers["Content-Type"] = "application/json"
            response.headers["Content-Encoding"] = "gzip"
    response.headers["Vary"] = "Accept-Encoding"
    response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/api/regions/{rid}/roads")
def roads(rid: str, request: Request):
    return _geometry(rid, "roads.json", request)


@app.get("/api/regions/{rid}/buildings")
def buildings(rid: str, request: Request):
    return _geometry(rid, "buildings.json", request)


@app.post("/api/regions/{rid}/simulate")
def simulate(rid: str, req: SimRequest):
    _validate_event_bounds(req, _region(rid))
    from .engine import get_engine

    return ORJSONResponse(get_engine(rid).simulate(**req.model_dump()))


class AdaptationRequest(BaseModel):
    scenario: SimRequest
    phase: Literal["mitigation", "response"]


@app.post("/api/regions/{rid}/adaptation")
def adaptation(rid: str, body: AdaptationRequest):
    """Compare up to three local road interventions using the selected event's routing graph."""
    region = _region(rid)
    req = body.scenario
    _validate_event_bounds(req, region)
    from .adaptation import evaluate
    from .catalog import VEHICLES
    from .engine import Scenario, get_engine

    engine = get_engine(rid)
    if req.vehicle not in VEHICLES or req.hospital not in [poi["id"] for poi in engine.meta["hospitals"]]:
        raise HTTPException(422, "Choose a supported vehicle and a hospital in this region.")
    scenario = Scenario.make(req.rain, req.duration, req.surge, req.clog,
                             event=req.event.model_dump() if req.event else None)
    return evaluate(engine, scenario, body.phase, req.vehicle, req.hospital)
