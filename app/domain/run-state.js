(function relayRunStateFactory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelayRunState = api;
})(typeof window !== "undefined" ? window : null, function createRelayRunState() {
  "use strict";

  function cloneStage(stage) {
    if (!stage) return null;
    return {
      id: stage.id,
      title: stage.title,
      path: stage.path,
      creator: stage.creator,
      genre: stage.genre,
      clearCondition: stage.clearCondition,
    };
  }

  function emptyRun(dailyRoute) {
    return {
      dailyRoute: (dailyRoute || []).map(cloneStage),
      runId: "",
      status: "idle",
      clearCount: 0,
      history: [],
      unavailableStageIds: [],
      currentStage: null,
      runDurationSec: 0,
      outcome: null,
      failedStageTitle: "",
    };
  }

  function pickNextStage(state) {
    var route = state.dailyRoute || [];
    for (var i = 0; i < route.length; i += 1) {
      var entry = route[i];
      if (!state.history.includes(entry.id) && !state.unavailableStageIds.includes(entry.id)) {
        return cloneStage(entry);
      }
    }
    return null;
  }

  function addDuration(state, durationSec) {
    var value = Number(durationSec);
    if (!Number.isFinite(value) || value <= 0) return state.runDurationSec;
    return Number((state.runDurationSec + value).toFixed(1));
  }

  function markUnavailable(state, stageId) {
    if (!stageId || state.history.includes(stageId) || state.unavailableStageIds.includes(stageId)) {
      return state.unavailableStageIds;
    }
    return state.unavailableStageIds.concat([stageId]);
  }

  function finishIncomplete(state) {
    return Object.assign({}, state, {
      currentStage: null,
      status: "incomplete",
      outcome: "incomplete",
    });
  }

  function finishAllClear(state) {
    return Object.assign({}, state, {
      currentStage: null,
      status: "complete",
      outcome: "all-clear",
    });
  }

  function continueRun(state) {
    var next = pickNextStage(state);
    if (next) {
      return Object.assign({}, state, {
        currentStage: next,
        status: "loading",
        outcome: null,
        failedStageTitle: "",
      });
    }
    if (state.history.length === state.dailyRoute.length && state.dailyRoute.length > 0) {
      return finishAllClear(state);
    }
    return finishIncomplete(state);
  }

  function beginRun(state, runId) {
    var next = emptyRun(state.dailyRoute);
    next.runId = runId;
    return continueRun(next);
  }

  function reduce(state, event) {
    event = event || {};
    var type = event.type;
    var stageId = event.stageId;

    if (type === "begin-run") {
      return beginRun(state, event.runId || "");
    }

    if (type === "stage-ready") {
      if (state.status !== "loading" || !state.currentStage || stageId !== state.currentStage.id) {
        return state;
      }
      return Object.assign({}, state, {
        status: "playing",
        currentStage: Object.assign({}, state.currentStage, event.meta || {}),
      });
    }

    if (type === "stage-cleared") {
      if (state.status !== "playing" || !state.currentStage || stageId !== state.currentStage.id) {
        return state;
      }
      var history = state.history.includes(stageId) ? state.history : state.history.concat([stageId]);
      return Object.assign({}, state, {
        history: history,
        clearCount: history.length,
        runDurationSec: addDuration(state, event.durationSec),
        status: "await-advance",
      });
    }

    if (type === "stage-failed") {
      if (state.status !== "playing" || !state.currentStage || stageId !== state.currentStage.id) {
        return state;
      }
      return Object.assign({}, state, {
        runDurationSec: addDuration(state, event.durationSec),
        status: "gameover",
        outcome: "failed",
        failedStageTitle: event.stageTitle || state.currentStage.title || "",
      });
    }

    if (type === "load-failed") {
      if (state.status !== "loading" || !state.currentStage || stageId !== state.currentStage.id) {
        return state;
      }
      return Object.assign({}, state, {
        status: "load-error",
        unavailableStageIds: markUnavailable(state, stageId),
      });
    }

    if (type === "continue") {
      if (state.status !== "await-advance" && state.status !== "load-error") {
        return state;
      }
      return continueRun(state);
    }

    return state;
  }

  function isCurrentStageMessage(state, message, expectedToken) {
    if (!message || message.channel !== "one-life-relay-stage") return false;
    if (!expectedToken || message.token !== expectedToken) return false;
    if (!message.payload || typeof message.payload !== "object") return false;
    var payloadStageId = message.type === "ready" ? message.payload.id : message.payload.stageId;
    return Boolean(state.currentStage && payloadStageId === state.currentStage.id);
  }

  function isTypingTarget(target) {
    if (!target || typeof target !== "object") return false;
    var tag = String(target.tagName || "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function isInteractiveTarget(target) {
    var node = target;
    var hops = 0;
    while (node && hops < 12) {
      if (isTypingTarget(node)) return true;
      var tag = String(node.tagName || "").toUpperCase();
      if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY" || tag === "LABEL") return true;
      var role = "";
      if (typeof node.getAttribute === "function") {
        role = String(node.getAttribute("role") || "");
      } else if (node.role) {
        role = String(node.role);
      }
      if (role === "button" || role === "link") return true;
      node = node.parentElement || node.parentNode || null;
      hops += 1;
    }
    return false;
  }

  function shouldAcceptOverlayShortcut(options) {
    options = options || {};
    if (options.overlayHidden) return false;
    if (options.modalOpen) return false;
    if (isInteractiveTarget(options.target)) return false;
    return true;
  }

  return {
    emptyRun: emptyRun,
    pickNextStage: pickNextStage,
    beginRun: beginRun,
    reduce: reduce,
    isCurrentStageMessage: isCurrentStageMessage,
    isTypingTarget: isTypingTarget,
    isInteractiveTarget: isInteractiveTarget,
    shouldAcceptOverlayShortcut: shouldAcceptOverlayShortcut,
  };
});
