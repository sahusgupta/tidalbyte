"""Serve both local ASGI applications behind the atlas' same-origin API routes."""
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from starlette.applications import Starlette
from starlette.routing import Mount

root = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(root / directory) for directory in
               ("apps/api", "packages/contracts/python", "simulator/backend")]
os.environ.setdefault("OMP_NUM_THREADS", "1")

from app.main import app as earth  # noqa: E402
from aquagrid.api import app as flood  # noqa: E402


@asynccontextmanager
async def lifespan(_app):
    async with earth.router.lifespan_context(earth):
        yield


async def dispatch(scope, receive, send):
    path = scope["path"]
    service = earth if path.startswith("/api/v1/") or path in ("/healthz", "/readyz") else flood
    await service(scope, receive, send)


app = Starlette(routes=[Mount("/", app=dispatch)], lifespan=lifespan)
