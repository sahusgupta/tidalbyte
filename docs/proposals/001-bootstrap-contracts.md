# Bootstrap scope and contract freeze

Date: 2026-11-21. Status: **approved by lead/integrator for initial bootstrap**.

The initial schemas were proposed, not integrated. The lead authorizes the first
v1 freeze: preserve documented Scenario/Prediction/Command wire fields; add
bounded arrays, canonical response metadata/envelopes, explicit model metadata,
evaluation and network comparison schemas. Freeze generated TypeScript and
Pydantic shapes together. All offline outputs identify project-generated sample
data; schematic geometry is not an official county boundary.

The lead delegates only initial `apps/web/**` and `apps/api/**` skeletons and
`ml/**` placeholders to isolated bootstrap worktrees. This is preparation for
the lead-first scaffold barrier, not the start of independent feature work.
No trained ML, graph analysis, provider integrations or Google tiles are added.
The lead reviews and integrates these commits before publishing the bootstrap.

Future schema changes require a new proposal and consumer acknowledgement.
Command `args` remains a generic object at this boundary: the AI workstream must
validate allowlisted arguments and scenario versions before any command executes.
