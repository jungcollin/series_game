const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyFailureSignal,
  classifyDifficulty,
  computeQuickRisk,
  normalizeMode,
  readStageSecondsFromMeta,
  resolveStageTargets,
  summarizeProfileRuns,
} = require("../scripts/analyze_playability.js");

test("normalizeMode maps loose stage mode/status values", () => {
  assert.equal(normalizeMode("clear", null), "cleared");
  assert.equal(normalizeMode("FAILED", null), "failed");
  assert.equal(normalizeMode("running", null), "running");
  assert.equal(normalizeMode("", "running"), "running");
  assert.equal(normalizeMode("", ""), "unknown");
});

test("computeQuickRisk prioritizes runtime and navigation errors", () => {
  const clean = computeQuickRisk(
    {
      navigationError: null,
      runtimeErrors: [],
      consoleErrors: [],
      finalMode: "running",
      finishedSeconds: 8,
    },
    8
  );
  const broken = computeQuickRisk(
    {
      navigationError: "timeout",
      runtimeErrors: ["ReferenceError"],
      consoleErrors: ["Uncaught"],
      finalMode: "failed",
      finishedSeconds: 2,
    },
    8
  );

  assert.equal(broken > clean, true);
});

test("summarizeProfileRuns returns rates and averages", () => {
  const summary = summarizeProfileRuns([
    {
      finalMode: "cleared",
      finishedSeconds: 12,
      runtimeErrors: [],
      consoleErrors: [],
      parseErrors: [],
      navigationError: null,
    },
    {
      finalMode: "failed",
      finishedSeconds: 5,
      runtimeErrors: [],
      consoleErrors: [],
      parseErrors: [],
      navigationError: null,
    },
    {
      finalMode: "running",
      finishedSeconds: 16,
      runtimeErrors: ["error"],
      consoleErrors: [],
      parseErrors: [],
      navigationError: null,
    },
  ], 20);

  assert.equal(summary.attempts, 3);
  assert.equal(summary.clears, 1);
  assert.equal(summary.fails, 1);
  assert.equal(summary.stuck, 1);
  assert.equal(summary.clearRate, 1 / 3);
  assert.equal(summary.avgClearSeconds, 12);
  assert.equal(summary.avgFailSeconds, 5);
  assert.equal(summary.totalErrors, 1);
  assert.equal(summary.earlyFails, 1);
  assert.equal(summary.earlyFailRate, 1 / 3);
});

test("classifyDifficulty uses novice clear rate and error state", () => {
  assert.equal(classifyDifficulty({ noviceClearRate: 0.7, totalErrors: 0 }), "appropriate");
  assert.equal(
    classifyDifficulty({ noviceClearRate: 0.4, noviceEarlyFailRate: 0.2, totalErrors: 0 }),
    "hard"
  );
  assert.equal(
    classifyDifficulty({ noviceClearRate: 0.1, noviceEarlyFailRate: 0.7, totalErrors: 0 }),
    "very-hard"
  );
  assert.equal(classifyDifficulty({ noviceClearRate: 0.8, totalErrors: 1 }), "broken");
});

test("classifyFailureSignal tags early and catastrophic failures", () => {
  const catastrophic = classifyFailureSignal(
    {
      finalMode: "failed",
      finishedSeconds: 2,
      navigationError: null,
      runtimeErrors: [],
      consoleErrors: [],
      parseErrors: [],
    },
    20
  );
  const timeout = classifyFailureSignal(
    {
      finalMode: "running",
      finishedSeconds: 20,
      navigationError: null,
      runtimeErrors: [],
      consoleErrors: [],
      parseErrors: [],
    },
    20
  );

  assert.equal(catastrophic.earlyFail, true);
  assert.equal(catastrophic.catastrophicFail, true);
  assert.equal(timeout.issue, "timed_out");
});

test("readStageSecondsFromMeta falls back to clear/fail text", () => {
  assert.equal(readStageSecondsFromMeta({ estimatedSeconds: 25 }), 25);
  assert.equal(readStageSecondsFromMeta({ clearCondition: "15초 생존" }), 15);
  assert.equal(readStageSecondsFromMeta({ failCondition: "10초 안에 도달" }), 10);
  assert.equal(readStageSecondsFromMeta({}), 20);
});

test("resolveStageTargets filters by id or dir and rejects unknown values", () => {
  const metas = [
    { id: "stage-a", dir: "stage-a" },
    { id: "stage-b", dir: "folder-b" },
  ];

  assert.deepEqual(resolveStageTargets(metas, "stage-a"), [metas[0]]);
  assert.deepEqual(resolveStageTargets(metas, "folder-b"), [metas[1]]);
  assert.throws(() => resolveStageTargets(metas, "missing-stage"), /Unknown stage id or dir/);
});
