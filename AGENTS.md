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
  - This now captures mobile `menu / running / failed` screenshots and rejects horizontal overflow on mobile
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
- If changing `index.html`, `styles.css`, `game.js`, `community-stages/gallery.*`, or `community-stages/play.html`, also run `node relay-tools/scripts/check_host_flow.js --base-url http://127.0.0.1:4173 --mobile` before handoff.

## Frontend UI Rules

Apply these rules to `index.html`, `styles.css`, `game.js`, and everything under `community-stages/` when changing UI. Source inspiration: `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/AGENTS.md`

- Prefer native semantics first: use real `button`, `a`, `label`, form controls, headings, and lists before ARIA workarounds.
- Keyboard access is required. Interactive controls must be reachable, operable, and visibly focused with `:focus-visible`; do not remove outlines without an equally visible replacement.
- Do not use clickable `div` elements for navigation. Navigation targets must use links so middle-click/Cmd-click/back-forward work correctly.
- Touch targets must stay generous. Aim for at least 24px hit areas, and 44px on mobile for primary controls.
- Mobile inputs should avoid accidental zoom. Keep text input font sizes at 16px or above.
- Status must not rely on color alone. Pair icon/color states with text, labels, or other redundant cues.
- Icon-only buttons must have accurate `aria-label` values. Decorative elements should be `aria-hidden` when appropriate.
- Forms should allow paste, preserve input value/focus during rendering, and show inline validation near the relevant field.
- Keep feedback stable. Prefer optimistic UI when safe, but rollback cleanly or explain failure when network writes fail.
- Use the single-character ellipsis `…` for loading labels and follow-up actions, not three periods.
- Respect `prefers-reduced-motion`. Animation should clarify state changes, use `transform`/`opacity`, and avoid `transition: all`.
- Avoid layout jank. Skeletons and loading states should roughly match final layout, and image or media containers should reserve space to prevent CLS.
- UI must handle empty, dense, error, and very long-content states without breaking layout.
- Long text in cards and flex rows must be constrained deliberately with truncation, wrapping, or `min-w-0` as needed.
- Check responsive behavior on mobile and desktop whenever changing gallery, launcher, or play screens.
- Mobile review must include overlay/modal/error states, not just the default loaded screen.
- Locale-aware formatting is required for dates, times, and numbers shown to users.
- For larger lists, avoid unnecessary re-renders and consider virtualization once the list size is meaningfully large.
