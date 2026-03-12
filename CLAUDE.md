# One Life Relay Local Workflow

Use this repository-local workflow instead of any global Claude setting.

Command mapping:
- `/make-stage ...` -> `relay-tools/create-stage.md`
- `/check-stage ...` -> `relay-tools/check-stage.md`
- `/publish-stage ...` -> `relay-tools/publish-stage.md`

Execution rules:
- Keep all changes inside this repository.
- Use the scripts in `relay-tools/scripts/` when possible.
- Do not rely on global prompts or global skills.
- Before declaring success, run `node relay-tools/scripts/check_stage.js --stage <stage-slug>`.
