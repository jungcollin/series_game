# One Life Relay — Design QA

## Source visual

- Selected reference: `/Users/collin/.codex/generated_images/019f517f-05d3-7050-b4e1-65e5e4c4b49b/exec-ff113382-eb55-47dd-bc3e-1cbb1007cf10.png`
- Original user reference: `/var/folders/j6/hqlqbh8d5y13055gr92l__r40000gn/T/codex-clipboard-3be8cec9-0c49-4cd6-85b5-f468a1df006f.png`
- Visual anchors: pure black field, floating capsule navigation, oversized chromatic title, razor-thin frame lines, restrained monochrome UI, detached ad rail.

## Implementation evidence

- Desktop viewport: `output/design-qa/home-desktop-viewport.png`
- Mobile home: `output/relay-tools/main-host-mobile-home.png`
- Mobile prompt: `output/relay-tools/main-host-mobile-prompt.png`
- Mobile leaderboard: `output/relay-tools/main-host-mobile-leaderboard.png`
- Mobile game-over: `output/relay-tools/main-host-mobile-game-over.png`
- All-clear: `output/relay-tools/main-host-flow-all-clear.png`
- Restored title settled state: `output/design-qa/home-title-restored.png`
- Restored title entrance state: `output/design-qa/title-entrance-restored.png`

## Viewports and states

- Desktop: 1440 × 1024, initial daily route, Galaxy Boss ready state.
- Mobile: 390 × 844, initial home, prompt modal, leaderboard modal, and game-over overlay.
- Title focus: 1440 × 1024 page, captured during the entrance scramble and after settling.
- Functional route: five curated stages, all-clear at 5 / 5, restart at 0 / 5.

## Full comparison

- The implementation preserves the selected reference's dominant hierarchy: navigation → chromatic wordmark → one-life badges → large bordered live-game region.
- The mock's illustrative hero was intentionally replaced by the real stage iframe so the core experience is playable rather than decorative.
- Supporting route cards use the stages' real thumbnail assets. The advertising area remains visually detached from controls and gameplay.

## Focused comparison

- Title: matching oversized condensed geometry, black negative space, pink/red/violet/cyan spectrum, and continuous background-position motion. Reduced-motion users receive a static chromatic frame.
- Title motion follow-up: the original scramble entrance and periodic cyan/magenta slice glitches are restored; the settled title remains readable and keeps the approved chromatic field. Reduced-motion users skip both motion layers.
- Game region: matching thin-line frame, left briefing rail, compact HUD, and 5-stage progress. Live stage content is allowed to retain each creator's visual identity.
- Mobile: the wordmark remains the first visual anchor, navigation fits without horizontal overflow, route cards collapse to a two-column grid, and overlays stay fully reachable.

## Iteration history

1. Replaced the previous glitch/scramble hero with a readable animated chromatic wordmark and live relay composition.
2. Replaced the 130-stage random marathon with a deterministic KST daily route of five curated stages.
3. Fixed mobile route-card horizontal overflow and ranking form width.
4. Fixed game-over overlay clipping by bringing the result into view and stacking its form controls.
5. Removed automatic iframe focus that skipped the mobile hero on first load; explicit start still moves focus into gameplay.
6. Re-ran the full 5-stage host flow, restart, modal, game-over, desktop, and 390px responsive checks.
7. Restored the original title's scramble entrance and cyan/magenta slice-glitch layers after user comparison feedback, while retaining the approved large chromatic wordmark.
8. Guarded the interaction observer target after public-browser verification exposed an initialization edge case; the final public pass reports no console errors.

## Result

- Automated tests: 26 / 26 passed.
- Host flow: passed; five unique curated stages, all-clear 5 / 5, restart 0 / 5.
- Mobile: passed at 390px; document width 390px with no horizontal overflow.
- P0 issues: 0
- P1 issues: 0
- P2 issues: 0

final result: passed
