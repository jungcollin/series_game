# One Life Relay Local Workflow

This repository defines a project-local stage workflow. Do not rely on global skills or global configuration.

If the user message starts with one of these commands, follow the mapped document in this repo:

- `/make-stage ...`
  - Read `relay-tools/create-stage.md` (repo root relative)
  - Prefer `node relay-tools/scripts/create_stage.js ...`
- `/check-stage ...`
  - Read `relay-tools/check-stage.md` (repo root relative)
  - Start local server first: `python3 -m http.server 4173 &`
  - Run `node relay-tools/scripts/check_stage.js --base-url http://127.0.0.1:4173` (or `--stage <stage-slug>`)
  - Give the user browser URLs to verify visually
- `/publish-stage ...`
  - Read `relay-tools/publish-stage.md` (repo root relative)
  - Prefer `node relay-tools/scripts/publish_stage.js --pr` (or `--stage <stage-slug>`)
  - This creates branch, commits, pushes, and opens a GitHub PR in one step

Rules:
- Keep all workflow files inside this repository only.
- Do not modify `~/.codex/skills` or any global agent config for this workflow.
- Prefer the shared scripts and template under `relay-tools/`.
- For stage verification, always run the local check script before saying a stage is ready.
