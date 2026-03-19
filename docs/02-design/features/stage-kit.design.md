# Stage Kit Design

## Context

New relay stages currently re-implement the same infrastructure in each `community-stages/<slug>/index.html`:

- host bridge callbacks (`RelayHost.onStageReady`, `onStageCleared`, `onStageFailed`)
- exported globals (`render_game_to_text`, `advanceTime`, `relayStageMeta`, `relayStageResult`, `relayStageDebug`)
- fixed-timestep animation loop
- mobile touch start and mobile button binding
- menu / fail / clear overlay cards
- repeated mobile control CSS

This makes new stage creation slower than it needs to be. Most time is spent rebuilding and debugging scaffolding rather than implementing the game rules.

## Goals

- Reduce repeated stage boilerplate for new stages.
- Keep each stage free to own its rules, rendering, and tone.
- Preserve current check-script contracts.
- Allow incremental adoption without migrating every existing stage at once.

## Non-Goals

- Do not build a full game engine.
- Do not force a shared rendering style.
- Do not move collision, spawning, AI, or scene logic into the kit.
- Do not require rewriting all existing stages up front.

## Proposed File

- `community-stages/stage-kit.js`

This file acts as a thin runtime helper on top of the existing `relay-runtime.js`.

## Design Principles

1. The kit owns infrastructure, not gameplay.
2. Stage files should mostly define state, update rules, rendering, and serialization.
3. The public surface should stay small enough that authors can learn it once and reuse it everywhere.
4. Stages must still be debuggable as plain files without hidden framework magic.

## Public API

### `StageKit.create(config)`

Creates a stage controller, binds the exported globals, starts the render loop, and returns a small control object.

Example:

```js
const stage = window.StageKit.create({
  id: "lightning-dodge",
  title: "Lightning Dodge",
  creator: "JungCollin",
  genre: "Arcade survival",
  clearCondition: "35초 동안 번개를 피하기",
  failCondition: "낙뢰에 맞으면 실패",
  controls: "좌우 이동, 모바일 화면 버튼",
  canvas: "#game",
  initialMode: "menu",
  controlsLayout: {
    preset: "move2",
    labels: {
      left: "왼쪽으로 이동",
      right: "오른쪽으로 이동",
    },
  },
  initialState() {
    return {
      mode: "menu",
      elapsed: 0,
      lastRunTime: 0,
      player: createPlayer(),
      hazards: [],
    };
  },
  onInit(ctx) {
    ctx.installKeyboard({
      ArrowLeft: "left",
      a: "left",
      ArrowRight: "right",
      d: "right",
    });
    ctx.installTouchStart(handlePrimaryAction);
  },
  onStart(ctx) {
    resetRun(ctx.state);
  },
  update(dt, ctx) {
    if (ctx.state.mode !== "running") {
      return;
    }
    ctx.state.elapsed += dt;
    updateGame(dt, ctx);
  },
  render(ctx) {
    renderGame(ctx);
  },
  serialize(ctx) {
    return {
      mode: ctx.state.mode,
      elapsed: Number(ctx.state.elapsed.toFixed(1)),
      hazard_count: ctx.state.hazards.length,
    };
  },
});
```

### Required config fields

- `id`
- `title`
- `creator`
- `genre`
- `clearCondition`
- `failCondition`
- `controls`
- `canvas`
- `initialState`
- `update`
- `render`
- `serialize`

### Optional config fields

- `initialMode`
  - default: `"menu"`
- `fixedDt`
  - default: `1 / 60`
- `maxDt`
  - default: `1 / 20`
- `controlsLayout`
  - renders mobile control buttons if provided
- `note`
  - default note string for `render_game_to_text`
- `onInit(ctx)`
  - one-time setup for inputs and DOM hooks
- `onStart(ctx)`
  - reset stage-specific run state
- `onFail(reason, ctx)`
  - hook after fail transition
- `onClear(ctx)`
  - hook after clear transition
- `renderMenu(ctx)`
  - override default menu card
- `renderFailed(ctx)`
  - override default failed card
- `renderCleared(ctx)`
  - override default cleared card

## Runtime Context

The kit passes a stable `ctx` object to hooks:

```js
{
  canvas,
  ctx2d,
  view: { width, height },
  state,
  relayContext,
  input,
  meta,
  start,
  fail,
  clear,
  setMode,
  setNote,
  renderCard,
  installKeyboard,
  installTouchStart,
  bindMobileControls,
}
```

### `ctx.input`

Plain mutable input state keyed by semantic action names:

```js
{
  left: false,
  right: false,
  up: false,
  down: false,
  action: false,
}
```

Stages may use any action keys they want. The kit does not enforce a fixed schema.

## Kit-Owned Responsibilities

### 1. Relay host bridge

The kit should own:

- `window.relayStageMeta`
- `window.relayStageResult`
- `window.render_game_to_text`
- `window.advanceTime`
- `window.relayStageDebug`
- ready / cleared / failed host reporting

This removes the most repeated contract code from stage files.

### 2. State transitions

The kit should provide:

- `ctx.start()`
- `ctx.fail(reason = "failed")`
- `ctx.clear()`

Transition behavior:

- updates `state.mode`
- records `state.lastRunTime`
- updates `window.relayStageResult.status`
- emits host callbacks once

### 3. Loop and deterministic stepping

The kit should centralize:

- fixed-timestep loop
- `requestAnimationFrame`
- `advanceTime(ms)` for tests and check scripts

This avoids per-stage drift in timing and exported behavior.

### 4. Input binding helpers

The kit should expose helpers instead of a fixed input model:

- `ctx.installKeyboard(map)`
- `ctx.installTouchStart(handler)`
- `ctx.bindMobileControls(rootOrSelector, bindings)`

This keeps the kit small while still removing the repetitive DOM event boilerplate.

### 5. Mobile control presets

The kit should generate mobile controls for common cases:

- `move2`
  - left / right
- `move4`
  - up / left / down / right
- `move2_action`
  - left / right + action
- `move4_action`
  - up / left / down / right + action
- `tap_only`
  - no extra buttons, touch-to-start or touch-to-act only

Each preset should allow text and aria-label overrides.

### 6. Default card rendering

The kit should provide a shared helper:

- `ctx.renderCard(title, lines, accent, options?)`

The default menu / failed / cleared screens can be built from this helper, but stages can override them if they need a custom presentation.

## HTML Template Changes

The stage template should change from “full runtime inlined in every stage” to “minimal shell + stage-specific logic”.

### Current template shape

- repeated CSS for canvas, skip link, mobile controls
- repeated host bridge logic
- repeated loop setup
- repeated debug exports

### Proposed template shape

```html
<a class="skip-link" href="#game">게임 캔버스로 건너뛰기</a>
<p id="stage-instructions" class="sr-only">
  __TITLE__. 캔버스를 터치하거나 Enter로 시작하세요. 기본 조작은 __CONTROLS__ 입니다.
</p>
<canvas id="game" width="960" height="540" aria-label="__TITLE__" aria-describedby="stage-instructions" tabindex="0"></canvas>

<script src="../relay-runtime.js"></script>
<script src="../stage-kit.js"></script>
<script>
  const stage = window.StageKit.create({
    id: "__STAGE_ID__",
    title: "__TITLE__",
    creator: "__CREATOR__",
    genre: "__GENRE__",
    clearCondition: "__CLEAR_CONDITION__",
    failCondition: "__FAIL_CONDITION__",
    controls: "__CONTROLS__",
    canvas: "#game",
    note: "__DESCRIPTION__",
    controlsLayout: { preset: "move2" },
    initialState() {
      return {
        mode: "menu",
        elapsed: 0,
        lastRunTime: 0,
      };
    },
    onInit(ctx) {
      ctx.installKeyboard({
        ArrowLeft: "left",
        ArrowRight: "right",
      });
      ctx.installTouchStart(() => {
        if (ctx.state.mode === "menu") {
          ctx.start();
        }
      });
    },
    onStart(ctx) {
      resetRun(ctx.state);
    },
    update(dt, ctx) {
      updateGame(dt, ctx);
    },
    render(ctx) {
      renderGame(ctx);
    },
    serialize(ctx) {
      return {
        mode: ctx.state.mode,
        elapsed: Number(ctx.state.elapsed.toFixed(1)),
      };
    },
  });
<\/script>
```

This keeps the template focused on stage-specific behavior.

## CSS Strategy

`stage-kit.js` should inject a shared base stylesheet once.

That stylesheet should cover:

- `html`, `body`, canvas shell defaults
- skip link
- screen-reader-only utility
- default mobile control layout
- reduced-motion handling

Stages can still add their own `<style>` blocks for visuals.

This removes the biggest repeated CSS block while preserving visual freedom.

## Migration Strategy

### Phase 1

- add `community-stages/stage-kit.js`
- update `relay-tools/templates/stage-template.html`
- keep existing stages untouched

### Phase 2

- migrate one representative simple stage
  - good candidate: `jump-hurdle` or `lightning-dodge`
- validate with `/check-stage`

### Phase 3

- migrate new stages by default
- selectively migrate older stages only when touched again

## Risks

### Risk: kit becomes an engine

Mitigation:

- keep API small
- reject abstractions for collisions, entities, cameras, particles, and progression unless repeated across several stages

### Risk: custom stages fight the shared UI

Mitigation:

- shared card rendering is optional
- stages can override menu / failed / cleared rendering
- controls preset can be disabled

### Risk: hidden magic makes debugging harder

Mitigation:

- expose a plain `ctx`
- keep stage state in stage-owned data structures
- keep all lifecycle hooks explicit

## Validation Plan

After implementation:

1. Create one new sample stage using the template.
2. Migrate one existing stage to the kit.
3. Run:
   - `node relay-tools/scripts/check_stage.js --stage <slug> --base-url http://127.0.0.1:4173`
4. If host-facing files change, also run:
   - `node relay-tools/scripts/check_host_flow.js --base-url http://127.0.0.1:4173 --mobile`

## Recommendation

Implement the thin `Stage Kit` first and keep it deliberately boring:

- bridge contract
- loop
- input helpers
- mobile control presets
- default card renderer

That is the smallest change with the highest payoff for authoring speed.
