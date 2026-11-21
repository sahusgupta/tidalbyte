"""Run with `python -m uvicorn app.main:app --app-dir apps/api --reload`."""

import logging
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import FIXTURE_DIR, cors_origins
from app.responses import envelope
from app.routes import health, interpret, network, predict, scenarios, voice
from app.schemas import ResponseEnvelope
from app.services.fixtures import OfflineFixtures

logger = logging.getLogger(__name__)


def create_app(*, fixture_dir: Path = FIXTURE_DIR) -> FastAPI:
    @asynccontextmanager
    async def lifespan(application: FastAPI):
        # A missing or malformed fixture is a real startup failure, never a fake ready state.
        application.state.fixtures = OfflineFixtures(fixture_dir)
        yield
        application.state.fixtures = None

    application = FastAPI(
        title="EarthLab API",
        version="1.0.0",
        description=(
            "Bootstrap: deterministic OFFLINE EXAMPLE output only. "
            "No trained model or verified historical event is available. "
            "All application endpoints use {data, meta, error}; /openapi.json and documentation pages use native formats."
        ),
        lifespan=lifespan,
        responses={
            404: {"model": ResponseEnvelope[dict], "description": "Unknown region, event or route"},
            422: {"model": ResponseEnvelope[dict], "description": "Invalid or unsupported input"},
            503: {"model": ResponseEnvelope[dict], "description": "Workstream dependency unavailable"},
        },
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        expose_headers=["X-Request-ID"],
    )

    @application.middleware("http")
    async def request_context(request: Request, call_next):
        request.state.request_id = str(uuid4())
        response = await call_next(request)
        response.headers["X-Request-ID"] = request.state.request_id
        return response

    @application.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        error = exc.detail if isinstance(exc.detail, dict) else {
            "code": f"http_{exc.status_code}", "message": str(exc.detail), "details": []
        }
        return JSONResponse(status_code=exc.status_code, content=envelope(request, error=error))

    @application.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError):
        # Do not echo raw input, parser contexts, files, or exception internals.
        details = [{"path": list(item["loc"]), "message": item["msg"]} for item in exc.errors()]
        return JSONResponse(
            status_code=422,
            content=envelope(request, error={
                "code": "invalid_request", "message": "Request validation failed.", "details": details
            }),
        )

    @application.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        logger.error("API request failed (%s)", request.state.request_id, exc_info=exc)
        return JSONResponse(
            status_code=500,
            content=envelope(request, error={
                "code": "internal_error", "message": "The request could not be completed.", "details": []
            }),
            headers={"X-Request-ID": request.state.request_id},
        )

    for router in [health.router, scenarios.router, predict.router, network.router, interpret.router, voice.router]:
        application.include_router(router)
    return application


app = create_app()
