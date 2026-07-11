const test = require("node:test");
const assert = require("node:assert/strict");
const DailyRelay = require("../../daily-relay.js");

const registry = DailyRelay.CURATED_STAGE_IDS.map((id) => ({ id }));

test("daily route is stable and contains five unique curated stages", () => {
  const first = DailyRelay.buildRoute(registry, "2026-07-12", 5);
  const second = DailyRelay.buildRoute(registry, "2026-07-12", 5);
  assert.deepEqual(first, second);
  assert.equal(first.length, 5);
  assert.equal(new Set(first.map((stage) => stage.id)).size, 5);
  assert.ok(first.every((stage) => DailyRelay.CURATED_STAGE_IDS.includes(stage.id)));
});

test("KST date key uses calendar date in Seoul", () => {
  assert.equal(DailyRelay.getKstDateKey(new Date("2026-07-11T16:00:00Z")), "2026-07-12");
});
