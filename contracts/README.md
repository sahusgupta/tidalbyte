# Wire contracts v1.0.0

`*.schema.json` are canonical JSON Schema 2020-12. The v1 initial freeze is
approved in `docs/proposals/001-bootstrap-contracts.md`. `api.schema.json` is a
registry of wire shapes; it references the standalone Scenario and CommandProposal
schemas. `envelope.schema.json` defines success/error metadata. `openapi.json`
documents the actual API skeleton, including deliberately unavailable services.

After installing Node and Python dependencies:

```sh
pnpm contracts:generate
pnpm openapi:generate
pnpm contracts:check
pnpm openapi:check
```

Generation is deterministic and committed. TypeScript exports live in
`packages/contracts/src/generated.ts`; Pydantic v2 models in
`packages/contracts/python/earthlab_contracts/models.py`. Generation also mirrors
the canonical GeoJSON into the TS package for keyless browser fallback. Never
edit generated files. CI checks drift and validates fixtures against schemas and
generated Pydantic models. The API checks the original request JSON against the
canonical schema before evaluating any coerced Pydantic values; formats and
unique array constraints remain enforced at runtime.

All application endpoints return `{data, meta, error}`; failure has `data:null`.
`/docs`, `/redoc`, `/openapi.json` are standard framework documentation responses.
HTTP 422 means malformed/unsupported input; 404 unknown geography/event; 503
unavailable dependency; 429 reserved for future provider rate limits.

The initial catalog has only an **offline example**, not a documented historical
event. Model metrics are null, feature controls are unavailable, and predictions
are arbitrary fixture indices. Read `data/fixtures/README.md` before using them.

Network compare request is frozen as `{regionId, disabledNodeIds,
disabledEdgeIds, interventions}`. The graph owner must also enforce a maximum of
three distinct intervention assets across edge and node lists; schema list
bounds alone do not establish that domain invariant. `inspect` must not silently
protect an asset. Implementation remains a 503 stub.

`InterpretRequest.scenarioSummary` is a complete current Scenario. Command `args`
requires action-specific semantic validation by the AI owner; valid shape alone
does not authorize execution. Provider implementations and command arguments
must be reviewed against the allowlist before enabling execution.

Consumers acknowledge this first freeze through the bootstrap handoffs. Future
wire changes require a proposal, lead approval, version bump and acknowledgement
by affected workstreams before integration.
