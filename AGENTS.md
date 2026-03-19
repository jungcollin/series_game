# One Life Relay Local Workflow

This repository defines a project-local stage workflow. Do not rely on global skills or global configuration.

If the user message starts with one of these commands, follow the mapped document in this repo:

- `/make-stage ...`
  - Read `relay-tools/create-stage.md` (repo root relative)
  - Prefer `node relay-tools/scripts/create_stage.js ...`
  - Do not run the scaffold until `creator`, `genre`, `controls`, `clear-condition`, and `fail-condition` are fixed
- `/check-stage ...`
  - Read `relay-tools/check-stage.md` (repo root relative)
  - Start local server first: `python3 -m http.server 4173 &`
  - Run `node relay-tools/scripts/check_stage.js --stage <stage-slug> --base-url http://127.0.0.1:4173`
  - Give the user browser URLs to verify visually
- `/publish-stage ...`
  - Read `relay-tools/publish-stage.md` (repo root relative)
  - Prefer `node relay-tools/scripts/publish_stage.js --stage <stage-slug> --pr`
  - This creates branch if needed, commits, pushes, and either updates the open PR for that branch or creates a new PR

Rules:
- Keep all workflow files inside this repository only.
- Do not modify `~/.codex/skills` or any global agent config for this workflow.
- Prefer the shared scripts and template under `relay-tools/`.
- Always prefer explicit stage slugs over git-change inference in handoff prompts.
- For stage verification, always run the local check script before saying a stage is ready.
