# One Life Relay Local Workflow

This repository defines a project-local stage workflow. Do not rely on global skills or global configuration.

If the user message starts with one of these commands, follow the mapped document in this repo:

- `/게임만들기 ...`
  - Read [relay-tools/create-stage.md](/Users/collin/Project/etc/series_game/relay-tools/create-stage.md)
  - Prefer `node relay-tools/scripts/create_stage.js ...`
- `/만든게임확인 ...`
  - Read [relay-tools/check-stage.md](/Users/collin/Project/etc/series_game/relay-tools/check-stage.md)
  - Run `node relay-tools/scripts/check_stage.js --stage <stage-slug>`
- `/게임올려보기 ...`
  - Read [relay-tools/publish-stage.md](/Users/collin/Project/etc/series_game/relay-tools/publish-stage.md)
  - Prefer `node relay-tools/scripts/publish_stage.js --stage <stage-slug>`

Rules:
- Keep all workflow files inside this repository only.
- Do not modify `~/.codex/skills` or any global agent config for this workflow.
- Prefer the shared scripts and template under `relay-tools/`.
- For stage verification, always run the local check script before saying a stage is ready.
