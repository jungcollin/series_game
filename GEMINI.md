# One Life Relay Local Workflow

Use this repository-local workflow instead of any global Gemini setup.

Command mapping:
- `/make-stage ...` -> `relay-tools/create-stage.md`
- `/check-stage ...` -> `relay-tools/check-stage.md`
- `/publish-stage ...` -> `relay-tools/publish-stage.md`

Execution rules:
- Keep all workflow logic inside this repository.
- Prefer the shared scripts in `relay-tools/scripts/`.
- Do not depend on global config or global skills.
- Verify a stage with `node relay-tools/scripts/check_stage.js --stage <stage-slug>` before handing it off.
