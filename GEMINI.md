# One Life Relay Local Workflow

Use this repository-local workflow instead of any global Gemini setup.

Command mapping:
- `/게임만들기 ...` -> `relay-tools/create-stage.md`
- `/만든게임확인 ...` -> `relay-tools/check-stage.md`
- `/게임올려보기 ...` -> `relay-tools/publish-stage.md`

Execution rules:
- Keep all workflow logic inside this repository.
- Prefer the shared scripts in `relay-tools/scripts/`.
- Do not depend on global config or global skills.
- Verify a stage with `node relay-tools/scripts/check_stage.js --stage <stage-slug>` before handing it off.
