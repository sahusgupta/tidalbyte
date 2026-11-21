"""FastAPI app.

    uvicorn aquagrid.api:app --port 8000          (from backend/)
"""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, ORJSONResponse
from pydantic import BaseModel, Field

from .config import DEFAULT_REGION, REGIONS
from .engine import get_engine

app = FastAPI(title="AquaGrid AI", version="0.1.0", default_response_class=ORJSONResponse)
app.add_middleware(GZipMiddleware, minimum_size=2048, compresslevel=4)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _region(rid: str):
    if rid not in REGIONS:
        raise HTTPException(404, f"unknown region {rid}")
    if not (REGIONS[rid].out_dir / "model" / "flood_xgb.ubj").exists():
        raise HTTPException(503, f"region {rid} not built: run the pipeline and training first")
    return REGIONS[rid]


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


@app.get("/api/health")
def health():
    return {"ok": True, "default_region": DEFAULT_REGION}


@app.get("/api/regions")
def regions():
    return [dict(id=r.id, name=r.name, bbox=r.bbox, default=r.id == DEFAULT_REGION,
                 built=(r.out_dir / "model" / "flood_xgb.ubj").exists()) for r in REGIONS.values()]


@app.get("/api/regions/{rid}/meta")
def meta(rid: str):
    _region(rid)
    return get_engine(rid).public_meta()


@app.get("/api/regions/{rid}/roads")
def roads(rid: str):
    return FileResponse(_region(rid).out_dir / "static" / "roads.json", media_type="application/json")


@app.get("/api/regions/{rid}/buildings")
def buildings(rid: str):
    return FileResponse(_region(rid).out_dir / "static" / "buildings.json", media_type="application/json")


@app.post("/api/regions/{rid}/simulate")
def simulate(rid: str, req: SimRequest):
    _region(rid)
    return get_engine(rid).simulate(**req.model_dump())


@app.on_event("startup")
def warm():
    if (REGIONS[DEFAULT_REGION].out_dir / "model" / "flood_xgb.ubj").exists():
        eng = get_engine(DEFAULT_REGION)
        eng.simulate(0, 1, 0, 0.1)
