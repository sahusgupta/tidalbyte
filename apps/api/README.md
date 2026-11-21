# API bootstrap handoff

Run from the repository root using the root Python environment:

```sh
python -m uvicorn app.main:app --app-dir apps/api --reload --port 8000
python -m pytest apps/api/tests
```

The API locates the monorepo's generated `earthlab_contracts` package on import;
the root project configuration also supplies its path for tests. The API loads and
validates `data/fixtures/offline-evaluation.json` and
`data/fixtures/houston-counties.geojson` once in its lifespan. A missing or malformed
fixture fails startup. `/readyz` means that the **offline fixture** is ready and
explicitly reports `trainedModel: false`.

Every application response uses `{data, meta, error}` and `X-Request-ID`.
`meta.mode` is always `offline_example` in this bootstrap. `/openapi.json`, `/docs`,
`/redoc`, and CORS protocol responses retain their native formats.

`POST /api/v1/scenarios/evaluate` accepts the frozen Scenario shape, checks the
original JSON against its canonical schema, and then validates catalog support.
Only the fixed timestamp, warning type, and three fixture counties are supported.
It filters canned values to the requested counties and never runs a trained model.
Parameters, exploratory what-if mode, unknown fields, and type coercion are rejected.

Graph, Gemini, and voice endpoints return explicit `503` envelopes. The ML owner
can replace `routes/predict.py` and add `services/model.py`; the graph and AI/voice
owners can replace their respective route stubs without changing the wire contract.
No API credentials are used by this skeleton. `CORS_ORIGINS` is a comma-separated
allowlist; its default permits local Vite development only.

The unavailable provider routes document their reserved inputs from the canonical
schemas in OpenAPI. They return `503` before processing those bodies. Optional
wire fields stay absent when omitted; the required nullable `evaluation` metadata
remains explicitly `null`. API tests validate actual response envelopes and
evaluation data against the canonical schemas, in addition to Pydantic shapes.

Requirements proposed to lead: FastAPI 0.116.1, Pydantic 2.11.7, uvicorn 0.35.0,
jsonschema 4.25.1; tests use pytest 8.4.1 and httpx 0.28.1. The root lockfile owns
the exact resolved environment.

Implementation references: [FastAPI exception handlers](https://fastapi.tiangolo.com/tutorial/handling-errors/)
and [Pydantic validation](https://docs.pydantic.dev/latest/concepts/models/).
