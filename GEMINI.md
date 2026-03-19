# One Life Relay Local Workflow

Use this repository-local workflow instead of any global Gemini setup.

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
  - Fork workflow is auto-detected (upstream remote = fork, no upstream = direct)

Rules:
- Keep all workflow logic inside this repository.
- Prefer the shared scripts in `relay-tools/scripts/`.
- Do not depend on global config or global skills.
- Verify a stage with `node relay-tools/scripts/check_stage.js` before handing it off.
