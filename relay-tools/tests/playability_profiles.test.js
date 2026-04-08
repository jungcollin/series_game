const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAgentProfile,
  extractSecondsFromText,
  inferGameArchetype,
  listAgentProfiles,
  recommendedRunSeconds,
} = require("../scripts/playability_profiles.js");

test("extractSecondsFromText parses Korean second labels", () => {
  assert.equal(extractSecondsFromText("35초 동안 버티기"), 35);
  assert.equal(extractSecondsFromText("약 12.5초 생존"), 12.5);
  assert.equal(extractSecondsFromText("시간 제한 없음"), null);
});

test("inferGameArchetype maps genres and copy to expected buckets", () => {
  assert.equal(
    inferGameArchetype({ genre: "Arcade shooter", controls: "Space 발사" }),
    "shooter"
  );
  assert.equal(
    inferGameArchetype({ genre: "3D Runner", description: "차선 변경" }),
    "runner"
  );
  assert.equal(
    inferGameArchetype({ title: "Gravity Fold", description: "중력 기울이기 퍼즐" }),
    "puzzle"
  );
});

test("recommendedRunSeconds prefers estimatedSeconds and applies bounds", () => {
  assert.equal(recommendedRunSeconds({ estimatedSeconds: 20 }), 29);
  assert.equal(
    recommendedRunSeconds({ clearCondition: "10초 버티기" }, { minSeconds: 5, maxSeconds: 12 }),
    12
  );
});

test("buildAgentProfile returns observer with disabled actions", () => {
  const profile = buildAgentProfile({ genre: "Dodger", clearCondition: "20초 생존" }, "observer");
  assert.equal(profile.moveEveryTicks, 0);
  assert.equal(profile.tapEveryTicks, 0);
  assert.equal(profile.runSeconds > 0, true);
});

test("buildAgentProfile scales cadence for active profiles", () => {
  const novice = buildAgentProfile({ genre: "Runner", clearCondition: "20초 생존" }, "novice");
  const challenger = buildAgentProfile(
    { genre: "Runner", clearCondition: "20초 생존" },
    "challenger"
  );

  assert.equal(novice.archetype, "runner");
  assert.equal(Array.isArray(novice.horizontalKeys), true);
  assert.equal(novice.moveEveryTicks > 0, true);
  assert.equal(novice.moveHoldTicks > 0, true);
  assert.equal(challenger.moveEveryTicks <= novice.moveEveryTicks, true);
});

test("buildAgentProfile exposes touch-friendly controls for puzzle/flight archetypes", () => {
  const puzzle = buildAgentProfile({ genre: "Puzzle", clearCondition: "20초 생존" }, "novice");
  const flight = buildAgentProfile({ title: "Fly Bird", clearCondition: "10초 버티기" }, "novice");

  assert.equal(puzzle.preferTouch, true);
  assert.equal(puzzle.swipeEveryTicks > 0, true);
  assert.equal(flight.preferTouch, true);
});

test("listAgentProfiles exposes expected defaults", () => {
  assert.deepEqual(listAgentProfiles(), ["observer", "novice", "challenger"]);
});
