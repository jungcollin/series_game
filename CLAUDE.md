# One Life Relay Local Workflow

Use this repository-local workflow instead of any global Claude setting.

Command mapping:
- `/게임만들기 ...` -> `relay-tools/create-stage.md`
- `/만든게임확인 ...` -> `relay-tools/check-stage.md`
- `/게임올려보기 ...` -> `relay-tools/publish-stage.md`

Execution rules:
- Keep all changes inside this repository.
- Use the scripts in `relay-tools/scripts/` when possible.
- Do not rely on global prompts or global skills.
- Before declaring success, run `node relay-tools/scripts/check_stage.js --stage <stage-slug>`.
