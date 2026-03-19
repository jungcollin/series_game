(function stageKitBootstrap(global) {
  const DEFAULT_FIXED_DT = 1 / 60;
  const DEFAULT_MAX_DT = 1 / 20;
  const STYLE_ID = "stage-kit-base-styles";

  function createAdvanceTimeRunner({ fixedDt, update, render, serialize }) {
    return function advanceTime(ms = 16.67) {
      const steps = Math.max(1, Math.round(ms / (fixedDt * 1000)));
      for (let index = 0; index < steps; index += 1) {
        update(fixedDt);
      }
      render();
      return serialize();
    };
  }

  function normalizeControlLayout(layout) {
    if (!layout || !layout.preset) {
      return { preset: "tap_only", labels: {} };
    }

    return {
      preset: layout.preset,
      labels: layout.labels || {},
    };
  }

  function buildControlPreset(layout) {
    const normalized = normalizeControlLayout(layout);
    const labels = normalized.labels || {};
    const definitions = {
      move2: [
        { action: "left", text: "◀", ariaLabel: "왼쪽으로 이동" },
        { action: "right", text: "▶", ariaLabel: "오른쪽으로 이동" },
      ],
      move4: [
        { action: "up", text: "▲", ariaLabel: "위로 이동" },
        { action: "left", text: "◀", ariaLabel: "왼쪽으로 이동" },
        { action: "down", text: "▼", ariaLabel: "아래로 이동" },
        { action: "right", text: "▶", ariaLabel: "오른쪽으로 이동" },
      ],
      move2_action: [
        { action: "left", text: "◀", ariaLabel: "왼쪽으로 이동" },
        { action: "right", text: "▶", ariaLabel: "오른쪽으로 이동" },
        { action: "action", text: "동작", ariaLabel: "동작" },
      ],
      move4_action: [
        { action: "up", text: "▲", ariaLabel: "위로 이동" },
        { action: "left", text: "◀", ariaLabel: "왼쪽으로 이동" },
        { action: "down", text: "▼", ariaLabel: "아래로 이동" },
        { action: "right", text: "▶", ariaLabel: "오른쪽으로 이동" },
        { action: "action", text: "동작", ariaLabel: "동작" },
      ],
      tap_only: [],
    };

    const preset = definitions[normalized.preset] || definitions.tap_only;
    return preset.map((entry) => ({
      action: entry.action,
      text: labels[entry.action] || entry.text,
      ariaLabel: labels[entry.action] || entry.ariaLabel,
    }));
  }

  function injectBaseStyles(doc) {
    if (!doc) {
      return null;
    }

    const existing = doc.getElementById(STYLE_ID);
    if (existing) {
      return existing;
    }

    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        color-scheme: light;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: "Trebuchet MS", "Segoe UI", sans-serif;
        background: #0f172a;
      }

      body {
        display: grid;
        place-items: center;
      }

      a,
      canvas,
      button {
        -webkit-tap-highlight-color: rgba(148, 163, 184, 0.2);
      }

      .skip-link {
        position: absolute;
        top: 12px;
        left: 12px;
        z-index: 10;
        width: 1px;
        height: 1px;
        padding: 0;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        clip-path: inset(50%);
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.92);
        color: #f8fafc;
        font-weight: 800;
        text-decoration: none;
        white-space: nowrap;
        transition: transform 0.15s ease;
      }

      .skip-link:focus,
      .skip-link:focus-visible {
        width: auto;
        height: auto;
        padding: 12px 16px;
        overflow: visible;
        clip: auto;
        clip-path: none;
        transform: translateY(0);
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      canvas {
        display: block;
        width: 100%;
        height: 100%;
        background: #0f172a;
        touch-action: manipulation;
      }

      canvas:focus-visible {
        outline: 4px solid rgba(248, 250, 252, 0.9);
        outline-offset: -8px;
      }

      .mobile-controls {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 16px;
        z-index: 16;
        display: flex;
        justify-content: center;
        padding: 0 16px calc(16px + env(safe-area-inset-bottom, 0px));
        pointer-events: none;
      }

      .mobile-controls__row {
        pointer-events: auto;
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        justify-content: center;
        width: min(100%, 360px);
      }

      .mobile-btn {
        appearance: none;
        border: 0;
        border-radius: 20px;
        flex: 0 1 96px;
        min-width: 64px;
        min-height: 64px;
        padding: 0 16px;
        background: rgba(15, 23, 42, 0.78);
        color: #f8fafc;
        font: 800 24px "Trebuchet MS", "Segoe UI", sans-serif;
        box-shadow: 0 14px 28px rgba(15, 23, 42, 0.26);
        touch-action: none;
      }

      .mobile-btn[data-active="true"] {
        transform: scale(0.96);
        background: rgba(37, 99, 235, 0.9);
      }

      @media (hover: hover) and (pointer: fine) {
        .mobile-controls {
          display: none;
        }
      }

      @media (max-width: 420px) {
        .mobile-controls {
          bottom: 12px;
          padding: 0 12px calc(12px + env(safe-area-inset-bottom, 0px));
        }

        .mobile-controls__row {
          gap: 8px;
          width: min(100%, 320px);
        }

        .mobile-btn {
          flex-basis: 80px;
          min-width: 56px;
          min-height: 56px;
          border-radius: 18px;
          font-size: 20px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: 0.01ms !important;
          scroll-behavior: auto !important;
        }
      }
    `;
    doc.head.insertBefore(style, doc.head.firstChild || null);
    return style;
  }

  function renderCard(ctx2d, view, title, lines, accent) {
    ctx2d.fillStyle = "rgba(15, 23, 42, 0.88)";
    ctx2d.fillRect(0, 0, view.width, view.height);
    ctx2d.fillStyle = "rgba(248, 250, 252, 0.98)";
    ctx2d.fillRect(128, 92, 704, 356);
    ctx2d.strokeStyle = accent;
    ctx2d.lineWidth = 4;
    ctx2d.strokeRect(128, 92, 704, 356);
    ctx2d.fillStyle = accent;
    ctx2d.font = "700 42px Trebuchet MS";
    ctx2d.textAlign = "center";
    ctx2d.fillText(title, view.width / 2, 162);
    ctx2d.fillStyle = "#0f172a";
    ctx2d.font = "600 22px Trebuchet MS";
    lines.forEach((line, index) => {
      ctx2d.fillText(line, view.width / 2, 228 + index * 42);
    });
    ctx2d.textAlign = "left";
  }

  function createControlRoot(doc, buttons) {
    if (!doc || !buttons.length) {
      return null;
    }

    const controls = doc.createElement("div");
    controls.className = "mobile-controls";
    controls.setAttribute("aria-label", "모바일 조작 버튼");

    const row = doc.createElement("div");
    row.className = "mobile-controls__row";

    buttons.forEach((buttonDef) => {
      const button = doc.createElement("button");
      button.className = "mobile-btn";
      button.type = "button";
      button.dataset.control = buttonDef.action;
      button.dataset.active = "false";
      button.setAttribute("aria-label", buttonDef.ariaLabel);
      button.textContent = buttonDef.text;
      row.appendChild(button);
    });

    controls.appendChild(row);
    doc.body.appendChild(controls);
    return controls;
  }

  function create(config) {
    if (!global.document) {
      throw new Error("StageKit.create requires a browser environment.");
    }

    const doc = global.document;
    injectBaseStyles(doc);

    const canvas =
      typeof config.canvas === "string"
        ? doc.querySelector(config.canvas)
        : config.canvas;

    if (!canvas) {
      throw new Error("StageKit.create could not find the canvas element.");
    }

    const ctx2d = canvas.getContext("2d");
    const view = { width: canvas.width, height: canvas.height };
    const relayContext = global.RelayRuntime?.readContext(config.id) || {
      history: [],
      clearCount: 0,
      previousStageId: null,
    };
    const meta = {
      id: config.id,
      title: config.title,
      creator: config.creator,
      genre: config.genre,
      clearCondition: config.clearCondition,
    };
    const state = config.initialState();
    if (!state.mode) {
      state.mode = config.initialMode || "menu";
    }
    if (typeof state.elapsed !== "number") {
      state.elapsed = 0;
    }
    if (typeof state.lastRunTime !== "number") {
      state.lastRunTime = 0;
    }
    if (typeof state.note !== "string") {
      state.note = config.note || "";
    }

    const input = {};
    let animationFrame = 0;
    let lastTimestamp = 0;
    let hostFailedReported = false;
    let hostClearedReported = false;

    function serialize() {
      return JSON.stringify({
        mode: state.mode,
        elapsed: Math.round(state.elapsed * 10) / 10,
        result: global.relayStageResult.status,
        note: state.note,
        ...config.serialize(context),
        relay_context: {
          previous_stage_id: relayContext.previousStageId,
          clear_count_before_this_stage: relayContext.clearCount,
          visited_stage_ids: relayContext.history,
        },
      });
    }

    function inRelayHost() {
      try {
        return global.parent && global.parent !== global && global.parent.RelayHost;
      } catch (error) {
        return false;
      }
    }

    function reportReadyToHost() {
      if (!inRelayHost()) {
        return;
      }
      global.parent.RelayHost.onStageReady?.(meta);
    }

    function reportFailedToHost(reason) {
      if (!inRelayHost() || hostFailedReported) {
        return;
      }
      hostFailedReported = true;
      global.parent.RelayHost.onStageFailed?.({
        stageId: meta.id,
        stageTitle: meta.title,
        reason,
        durationSec: Number(state.lastRunTime.toFixed(1)),
      });
    }

    function reportClearedToHost() {
      if (!inRelayHost() || hostClearedReported) {
        return;
      }
      hostClearedReported = true;
      global.parent.RelayHost.onStageCleared?.({
        stageId: meta.id,
        stageTitle: meta.title,
        clearCountAfter: relayContext.clearCount + 1,
        durationSec: Number(state.lastRunTime.toFixed(1)),
      });
    }

    function start() {
      state.mode = "running";
      state.elapsed = 0;
      state.lastRunTime = 0;
      global.relayStageResult.status = "running";
      hostFailedReported = false;
      hostClearedReported = false;
      if (typeof config.onStart === "function") {
        config.onStart(context);
      }
    }

    function fail(reason = "failed") {
      state.mode = "failed";
      state.lastRunTime = state.elapsed;
      global.relayStageResult.status = "failed";
      if (typeof config.onFail === "function") {
        config.onFail(reason, context);
      }
      reportFailedToHost(reason);
    }

    function clear() {
      state.mode = "cleared";
      state.lastRunTime = state.elapsed;
      global.relayStageResult.status = "cleared";
      if (typeof config.onClear === "function") {
        config.onClear(context);
      }
      reportClearedToHost();
    }

    function setMode(mode) {
      state.mode = mode;
    }

    function setNote(note) {
      state.note = note;
    }

    function installKeyboard(map) {
      const keyMap = map || {};

      function readAction(key) {
        if (key in keyMap) {
          return keyMap[key];
        }
        const lowerKey = String(key).toLowerCase();
        return keyMap[lowerKey];
      }

      global.addEventListener("keydown", (event) => {
        const action = readAction(event.key);
        if (!action) {
          return;
        }
        input[action] = true;
        event.preventDefault();
      });

      global.addEventListener("keyup", (event) => {
        const action = readAction(event.key);
        if (!action) {
          return;
        }
        input[action] = false;
        event.preventDefault();
      });
    }

    function installTouchStart(handler) {
      canvas.addEventListener(
        "touchstart",
        (event) => {
          event.preventDefault();
          handler(context, event);
        },
        { passive: false }
      );
      canvas.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse") {
          return;
        }
        event.preventDefault();
        handler(context, event);
      });
    }

    function bindMobileControls(rootOrSelector, bindings) {
      const root =
        typeof rootOrSelector === "string"
          ? doc.querySelector(rootOrSelector)
          : rootOrSelector;

      if (!root) {
        return;
      }

      root.querySelectorAll(".mobile-btn").forEach((button) => {
        const action = bindings?.[button.dataset.control] || button.dataset.control;
        if (!action) {
          return;
        }

        const activate = (event) => {
          event.preventDefault();
          input[action] = true;
          button.dataset.active = "true";
        };

        const deactivate = () => {
          input[action] = false;
          button.dataset.active = "false";
        };

        button.addEventListener("pointerdown", activate);
        button.addEventListener("pointerup", deactivate);
        button.addEventListener("pointerleave", deactivate);
        button.addEventListener("pointercancel", deactivate);
      });
    }

    const context = {
      canvas,
      ctx2d,
      view,
      state,
      relayContext,
      input,
      meta,
      start,
      fail,
      clear,
      setMode,
      setNote,
      renderCard(title, lines, accent) {
        renderCard(ctx2d, view, title, lines, accent);
      },
      installKeyboard,
      installTouchStart,
      bindMobileControls,
    };

    const layout = normalizeControlLayout(config.controlsLayout);
    const mobileButtons = buildControlPreset(layout);
    const mobileControls = createControlRoot(doc, mobileButtons);
    if (mobileControls) {
      bindMobileControls(mobileControls);
    }

    function render() {
      config.render(context);
    }

    function update(dt) {
      config.update(dt, context);
    }

    function frame(timestamp) {
      const dt = lastTimestamp
        ? Math.min((timestamp - lastTimestamp) / 1000, config.maxDt || DEFAULT_MAX_DT)
        : config.fixedDt || DEFAULT_FIXED_DT;
      lastTimestamp = timestamp;
      update(dt);
      render();
      animationFrame = global.requestAnimationFrame(frame);
    }

    global.render_game_to_text = serialize;
    global.advanceTime = createAdvanceTimeRunner({
      fixedDt: config.fixedDt || DEFAULT_FIXED_DT,
      update,
      render,
      serialize,
    });
    global.relayStageMeta = meta;
    global.relayStageResult = { status: "running" };
    global.relayStageDebug = {
      forceClear() {
        start();
        clear();
        render();
      },
      forceFail() {
        start();
        fail("debug_force_fail");
        render();
      },
    };

    if (typeof config.onInit === "function") {
      config.onInit(context);
    }

    canvas.addEventListener("click", () => canvas.focus());
    global.addEventListener("beforeunload", () => global.cancelAnimationFrame(animationFrame));

    reportReadyToHost();
    render();
    canvas.focus();
    animationFrame = global.requestAnimationFrame(frame);

    return context;
  }

  const api = {
    create,
    createAdvanceTimeRunner,
    normalizeControlLayout,
    buildControlPreset,
    injectBaseStyles,
  };

  global.StageKit = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
