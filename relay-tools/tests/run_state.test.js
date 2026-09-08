const test = require("node:test");
const assert = require("node:assert/strict");
const RelayRunState = require("../../app/domain/run-state.js");

const route = [
  { id: "a", title: "A" },
  { id: "b", title: "B" },
  { id: "c", title: "C" },
  { id: "d", title: "D" },
  { id: "e", title: "E" },
];

function playThrough(state, stageId) {
  state = RelayRunState.reduce(state, { type: "stage-ready", stageId });
  state = RelayRunState.reduce(state, { type: "stage-cleared", stageId, durationSec: 1.2 });
  return RelayRunState.reduce(state, { type: "continue" });
}

test("begin-run loads the first remaining stage", () => {
  const started = RelayRunState.reduce(RelayRunState.emptyRun(route), { type: "begin-run", runId: "run-1" });
  assert.equal(started.runId, "run-1");
  assert.equal(started.status, "loading");
  assert.equal(started.currentStage.id, "a");
  assert.equal(started.clearCount, 0);
});

test("cleared and failed events apply only once from playing", () => {
  let state = RelayRunState.reduce(RelayRunState.emptyRun(route), { type: "begin-run", runId: "run-1" });
  state = RelayRunState.reduce(state, { type: "stage-ready", stageId: "a" });
  const cleared = RelayRunState.reduce(state, { type: "stage-cleared", stageId: "a", durationSec: 2 });
  const clearedAgain = RelayRunState.reduce(cleared, { type: "stage-cleared", stageId: "a", durationSec: 9 });
  assert.equal(cleared.status, "await-advance");
  assert.equal(cleared.clearCount, 1);
  assert.equal(cleared.runDurationSec, 2);
  assert.equal(clearedAgain.runDurationSec, 2);
  assert.deepEqual(clearedAgain.history, ["a"]);

  let failed = RelayRunState.reduce(state, { type: "stage-failed", stageId: "a", durationSec: 3, stageTitle: "A" });
  const failedAgain = RelayRunState.reduce(failed, { type: "stage-failed", stageId: "a", durationSec: 8, stageTitle: "A" });
  const clearAfterFail = RelayRunState.reduce(failed, { type: "stage-cleared", stageId: "a", durationSec: 8 });
  assert.equal(failed.status, "gameover");
  assert.equal(failed.outcome, "failed");
  assert.equal(failedAgain.runDurationSec, 3);
  assert.equal(clearAfterFail.status, "gameover");
});

test("old stage ids and ready/fail during the wrong status are ignored", () => {
  let state = RelayRunState.reduce(RelayRunState.emptyRun(route), { type: "begin-run", runId: "run-1" });
  const ignoredReady = RelayRunState.reduce(state, { type: "stage-ready", stageId: "b" });
  assert.equal(ignoredReady.status, "loading");
  state = RelayRunState.reduce(state, { type: "stage-ready", stageId: "a" });
  const ignoredClear = RelayRunState.reduce(state, { type: "stage-cleared", stageId: "b", durationSec: 4 });
  assert.equal(ignoredClear.status, "playing");
  assert.equal(ignoredClear.clearCount, 0);
});

test("load failures never count as all-clear", () => {
  let state = RelayRunState.reduce(RelayRunState.emptyRun(route), { type: "begin-run", runId: "run-1" });
  for (let i = 0; i < route.length; i += 1) {
    assert.equal(state.status, "loading");
    state = RelayRunState.reduce(state, { type: "load-failed", stageId: state.currentStage.id });
    assert.equal(state.status, "load-error");
    state = RelayRunState.reduce(state, { type: "continue" });
  }
  assert.equal(state.status, "incomplete");
  assert.equal(state.outcome, "incomplete");
  assert.equal(state.clearCount, 0);
  assert.notEqual(state.status, "complete");
});

test("four clears plus one load failure is incomplete, not all-clear", () => {
  let state = RelayRunState.reduce(RelayRunState.emptyRun(route), { type: "begin-run", runId: "run-1" });
  state = playThrough(state, "a");
  state = playThrough(state, "b");
  state = playThrough(state, "c");
  state = playThrough(state, "d");
  state = RelayRunState.reduce(state, { type: "load-failed", stageId: "e" });
  state = RelayRunState.reduce(state, { type: "continue" });
  assert.equal(state.clearCount, 4);
  assert.equal(state.status, "incomplete");
  assert.equal(state.outcome, "incomplete");
});

test("five clears is all-clear", () => {
  let state = RelayRunState.reduce(RelayRunState.emptyRun(route), { type: "begin-run", runId: "run-1" });
  for (const stage of route) {
    state = playThrough(state, stage.id);
  }
  assert.equal(state.status, "complete");
  assert.equal(state.outcome, "all-clear");
  assert.equal(state.clearCount, 5);
});

test("isCurrentStageMessage rejects other tokens and stage ids", () => {
  let state = RelayRunState.reduce(RelayRunState.emptyRun(route), { type: "begin-run", runId: "run-1" });
  const token = "token-a";
  assert.equal(
    RelayRunState.isCurrentStageMessage(state, {
      channel: "one-life-relay-stage",
      type: "ready",
      token,
      payload: { id: "a" },
    }, token),
    true,
  );
  assert.equal(
    RelayRunState.isCurrentStageMessage(state, {
      channel: "one-life-relay-stage",
      type: "cleared",
      token: "other",
      payload: { stageId: "a" },
    }, token),
    false,
  );
  assert.equal(
    RelayRunState.isCurrentStageMessage(state, {
      channel: "one-life-relay-stage",
      type: "failed",
      token,
      payload: { stageId: "b" },
    }, token),
    false,
  );
});

test("overlay Enter is ignored while typing, in a modal, or on another control", () => {
  assert.equal(RelayRunState.shouldAcceptOverlayShortcut({ overlayHidden: true }), false);
  assert.equal(RelayRunState.shouldAcceptOverlayShortcut({
    overlayHidden: false,
    modalOpen: true,
    target: { tagName: "DIV" },
  }), false);
  assert.equal(RelayRunState.shouldAcceptOverlayShortcut({
    overlayHidden: false,
    modalOpen: false,
    target: { tagName: "INPUT" },
  }), false);
  assert.equal(RelayRunState.shouldAcceptOverlayShortcut({
    overlayHidden: false,
    modalOpen: false,
    target: { tagName: "TEXTAREA" },
  }), false);
  assert.equal(RelayRunState.shouldAcceptOverlayShortcut({
    overlayHidden: false,
    modalOpen: false,
    target: { tagName: "DIV", isContentEditable: true },
  }), false);
  assert.equal(RelayRunState.shouldAcceptOverlayShortcut({
    overlayHidden: false,
    modalOpen: false,
    target: { tagName: "BUTTON" },
  }), false);
  assert.equal(RelayRunState.shouldAcceptOverlayShortcut({
    overlayHidden: false,
    modalOpen: false,
    target: { tagName: "A" },
  }), false);
  assert.equal(RelayRunState.shouldAcceptOverlayShortcut({
    overlayHidden: false,
    modalOpen: false,
    target: { tagName: "SPAN", parentElement: { tagName: "BUTTON" } },
  }), false);
  assert.equal(RelayRunState.shouldAcceptOverlayShortcut({
    overlayHidden: false,
    modalOpen: false,
    target: { tagName: "DIV" },
  }), true);
});
