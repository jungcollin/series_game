const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_STAGES,
  normalizeDifficulty,
  parseArgs,
  parseSnapshot,
} = require("../scripts/check_difficulty_curve");

test("premium difficulty gate targets ten distinct stages", () => {
  assert.equal(DEFAULT_STAGES.length, 10);
  assert.equal(new Set(DEFAULT_STAGES).size, 10);
});

test("normalizeDifficulty accepts scalar and structured curves", () => {
  assert.equal(normalizeDifficulty(0.5), 0.5);
  assert.equal(normalizeDifficulty({ difficulty: 0.75 }), 0.75);
  assert.equal(normalizeDifficulty({ progress: 1 }), 1);
  assert.equal(Number.isNaN(normalizeDifficulty({ value: 0.2 })), true);
});

test("parseSnapshot accepts JSON strings and objects", () => {
  assert.deepEqual(parseSnapshot('{"mode":"running"}'), { mode: "running" });
  assert.deepEqual(parseSnapshot({ mode: "menu" }), { mode: "menu" });
  assert.equal(parseSnapshot("not-json"), null);
});

test("parseArgs reads stage and base URL options", () => {
  assert.deepEqual(
    parseArgs([
      "node",
      "script",
      "--stages",
      "alpha,beta",
      "--base-url",
      "http://127.0.0.1:4173",
    ]),
    {
      stages: "alpha,beta",
      "base-url": "http://127.0.0.1:4173",
    }
  );
});
