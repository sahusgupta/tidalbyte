# Setup and deployment boundary

The lead bootstrap runs without external providers or downloaded datasets.
Node 22.16.0, pnpm 10.12.1 and Python 3.13 are the verification targets. Use
`pnpm-lock.yaml` and `requirements.lock` on every machine. The Python lock pins
all resolved dependencies; `requirements.in` records direct dependencies.

## Configuration

Vite reads `.env` at repository root via `envDir`. `VITE_API_BASE_URL` defaults to
`http://localhost:8000`; use the deployed API origin without `/api/v1`. Empty or
unavailable external services fall back to the bundled offline example.

The API reads process environment. Export `CORS_ORIGINS` as comma-separated
origins, without trailing slashes. Defaults include both localhost and 127.0.0.1
on port 5173. Provider/model variables in `.env.example` are reserved; the
bootstrap does not load a model or call Gemini, ElevenLabs, Cesium ion or Google.
Never expose server credentials through a `VITE_*` variable.

## Frontend hosting

`vercel.json` is a **configuration template**, not an existing deployment. Use
repository root as project root, the pinned Node version and the committed
install/build commands. Static output is `apps/web/dist`. Vite copies Cesium
Workers/Assets/Widgets/ThirdParty locally under `/cesium/`; these must remain
available as static files, with Cesium attribution intact. Natural Earth II
imagery ships with Cesium and requires no network tile provider.

Set `VITE_API_BASE_URL` for the intended API and rebuild. Verify `/`, the Houston
flight, imagery/worker assets and Run example with and without the API before
promoting anything. The Cesium lazy chunk is large; measure first-load performance
on the demo laptop. No deployment or provider account is created by bootstrap.

## Python hosting

Choose the team's configured Python host. Deploy the **whole repository**, since
the API imports shared generated contracts and local fixture files. In Python
3.13, install `requirements.lock`, then run:

```sh
python -m uvicorn app.main:app --app-dir apps/api --host 0.0.0.0 --port "$PORT"
```

Set `PORT` through the host, and set `CORS_ORIGINS` to the frontend origin. Use
`/healthz` for liveness and `/readyz` for fixture readiness. Ready explicitly
reports an offline example and `trainedModel:false`; it does not certify ML.

The public bootstrap has no provider calls, expensive analysis or user accounts.
Before enabling paid providers, the owning workstream must add request size
limits, rate limiting/cost caps, validated commands, upload limits and failure
tests. This is an integration prerequisite, not functionality claimed here.

## Re-resolving dependencies

Review intentional direct dependency changes in `package.json` / `requirements.in`.
Run `pnpm install` to update the JS lock. For Python, create a clean 3.13 venv,
install `requirements.in`, then write `python -m pip freeze --exclude pip` to
`requirements.lock` with UTF-8. Do not freeze an unrelated global environment.
Reinstall from both locks and run the CI checks before committing lock changes.

## Future provider responsibilities

Photorealistic Google tiles are optional display only; provider terms, key
restrictions, quotas and attribution require review before implementation. No
Google tile data can be extracted or used as ML inputs. Model integration must
provide version, provenance, supported features/ranges, event/time holdout and a
baseline comparison. Pending services return explicit 503 envelopes rather than
fabricated results. A missing backend always leaves manual local controls usable.
