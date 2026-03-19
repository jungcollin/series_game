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
  - This now captures mobile `menu / running / failed` screenshots and rejects horizontal overflow on mobile
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
- For `/make-stage`, keep the template's minimal accessibility shell (`skip-link`, hidden instructions, focusable canvas, reduced-motion support`) unless an equivalent repo-local replacement is provided.
- Those defaults are only a baseline; visual style, HUD, layout, and game structure stay flexible.
- Verify a stage with `node relay-tools/scripts/check_stage.js` before handing it off.
- If changing `index.html`, `styles.css`, `game.js`, `community-stages/gallery.*`, or `community-stages/play.html`, also run `node relay-tools/scripts/check_host_flow.js --base-url http://127.0.0.1:4173 --mobile`.
