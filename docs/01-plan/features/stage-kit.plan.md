# Stage Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thin shared `Stage Kit` that removes repeated relay stage boilerplate, update the stage template to use it, and migrate one representative stage without breaking the existing check workflow.

**Architecture:** Introduce `community-stages/stage-kit.js` as a small runtime helper layered on top of `relay-runtime.js`. The kit owns the exported relay contract, fixed-step loop, host callbacks, input helpers, mobile control presets, and default overlay rendering, while each stage continues to own its state, rules, and drawing logic. Rollout is incremental: template first, then migrate one simple stage to verify the API against real usage.

**Tech Stack:** Plain HTML/CSS/JavaScript, existing relay runtime, Node test runner, Playwright-based `check_stage.js`

---

## File Map

- Create: `community-stages/stage-kit.js`
  - Shared runtime helper for host bridge, loop, input, exported globals, mobile presets, and default overlay cards.
- Modify: `relay-tools/templates/stage-template.html`
  - Replace the inlined boilerplate runtime with a minimal shell that calls `StageKit.create(...)`.
- Modify: `community-stages/jump-hurdle/index.html`
  - Migrate one simple stage to the kit while preserving gameplay behavior and stage contract.
- Modify: `relay-tools/tests/check_stage.test.js`
  - Add unit coverage for small pure helpers exported by `stage-kit.js`.

## Task 1: Add failing tests for the kit helpers

**Files:**
- Create: none
- Modify: `relay-tools/tests/check_stage.test.js`
- Test: `relay-tools/tests/check_stage.test.js`

- [ ] **Step 1: Add failing tests for the pure helper surface**

Add tests for helper functions that `stage-kit.js` will export for Node tests, such as:

```js
test("createAdvanceTimeRunner steps fixed dt and calls render once", () => {
  const calls = [];
  const runner = createAdvanceTimeRunner({
    fixedDt: 1 / 60,
    update(dt) {
      calls.push(["update", dt]);
    },
    render() {
      calls.push(["render"]);
    },
    serialize() {
      return "snapshot";
    },
  });

  assert.equal(runner(16.67), "snapshot");
  assert.equal(calls.filter(([kind]) => kind === "update").length, 1);
  assert.deepEqual(calls.at(-1), ["render"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test relay-tools/tests/check_stage.test.js`
Expected: FAIL because the new helper exports do not exist yet.

## Task 2: Implement `community-stages/stage-kit.js`

**Files:**
- Create: `community-stages/stage-kit.js`
- Test: `relay-tools/tests/check_stage.test.js`

- [ ] **Step 1: Create the kit file with a small public surface**

Implement:

- `window.StageKit.create(config)`
- pure helper exports for tests via `module.exports`
- base stylesheet injection once per document
- default `renderCard(...)`
- control preset DOM builder

- [ ] **Step 2: Implement relay bridge and loop plumbing**

Inside `StageKit.create`, wire:

- `window.relayStageMeta`
- `window.relayStageResult`
- `window.render_game_to_text`
- `window.advanceTime`
- `window.relayStageDebug`
- ready / failed / cleared host callbacks
- fixed-step `requestAnimationFrame` loop

- [ ] **Step 3: Implement input helpers**

Implement explicit helpers on the context object:

- `installKeyboard(map)`
- `installTouchStart(handler)`
- `bindMobileControls(rootOrSelector, bindings)`

Keep `ctx.input` as a plain mutable action map.

- [ ] **Step 4: Implement mobile control presets**

Add preset builder support for:

- `move2`
- `move4`
- `move2_action`
- `move4_action`
- `tap_only`

Allow aria-label and visible label overrides from `controlsLayout`.

- [ ] **Step 5: Export testable pure helpers**

Export small pure helpers such as:

- `createAdvanceTimeRunner`
- `buildControlPreset`
- `normalizeControlLayout`

Only export helpers that are easy to unit test without a DOM browser.

- [ ] **Step 6: Run tests to verify the new helper tests pass**

Run: `node --test relay-tools/tests/check_stage.test.js`
Expected: PASS

## Task 3: Update the stage template to use the kit

**Files:**
- Modify: `relay-tools/templates/stage-template.html`
- Test: manual file inspection only

- [ ] **Step 1: Replace the repeated runtime scaffold with a kit-based shell**

Update the template so it:

- keeps the required skip link, sr-only instructions, and canvas
- loads `../relay-runtime.js`
- loads `../stage-kit.js`
- calls `window.StageKit.create(...)`
- leaves only stage-specific placeholders and hooks in the template

- [ ] **Step 2: Keep template defaults intentionally generic**

Ensure the template still passes repository rules:

- touch/mobile copy remains present
- default mobile-safe shell remains available through the kit
- stage authors only fill in game-specific logic

## Task 4: Migrate one representative stage

**Files:**
- Modify: `community-stages/jump-hurdle/index.html`
- Test: `relay-tools/scripts/check_stage.js`

- [ ] **Step 1: Move `jump-hurdle` onto the kit**

Refactor `jump-hurdle` to:

- create its state via `initialState`
- use `onStart` for reset
- use `ctx.start()`, `ctx.fail()`, `ctx.clear()`
- expose serialized state through `serialize`
- keep its current gameplay and text unchanged where possible

- [ ] **Step 2: Preserve stage-specific visuals and gameplay**

Do not generalize:

- obstacle spawning
- collision rules
- HUD specifics
- render style

Only remove the duplicated infrastructure.

## Task 5: Verify end-to-end

**Files:**
- Modify: none
- Test: automated checks

- [ ] **Step 1: Start the local server**

Run: `python3 -m http.server 4173`
Expected: local server available at `http://127.0.0.1:4173`

- [ ] **Step 2: Run the migrated stage check**

Run: `node relay-tools/scripts/check_stage.js --stage jump-hurdle --base-url http://127.0.0.1:4173`
Expected: PASS, thumbnail regenerated, mobile screenshots generated, no contract regressions

- [ ] **Step 3: Run host flow validation because shared stage infrastructure changed**

Run: `node relay-tools/scripts/check_host_flow.js --base-url http://127.0.0.1:4173 --mobile`
Expected: PASS for host launcher / gallery / play flow on mobile

- [ ] **Step 4: Inspect git diff for unintended stage-wide churn**

Run: `git diff -- community-stages/stage-kit.js relay-tools/templates/stage-template.html community-stages/jump-hurdle/index.html relay-tools/tests/check_stage.test.js`
Expected: only the planned files change

## Notes

- Existing modified files already present in the worktree must not be reverted.
- Keep `stage-kit.js` deliberately small; if a helper feels game-specific, leave it inside the stage file.
- Do not migrate additional stages until the first migrated stage passes the check workflow.
