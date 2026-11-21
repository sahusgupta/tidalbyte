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
on port 5173. The API reads `GEMINI_API_KEY` for interpretation and
`ELEVENLABS_API_KEY` for transcription. With no keys it labels its built-in
commands and sample transcript. Keep provider credentials on the server.
The county endpoint currently serves the offline Houston example.

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

The [flood simulator](../simulator/README.md) has its own frontend build under
`simulator/frontend/dist` and a separate Python environment. For hosted embedding,
set `VITE_SIMULATOR_URL` to the simulator frontend's origin and route that
frontend's `/api/` to AquaGrid. Regional artifacts belong on its backend host.

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

The [voice and command service](handoffs/voice-gemini-elevenlabs.md) bounds
uploads, sets provider deadlines and caps attempts per process. For multiple
workers, account for their combined provider usage.

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
