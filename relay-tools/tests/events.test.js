const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const RelayEvents = require("../../app/domain/events.js");

const sampleEvent = {
  id: "sample-event",
  kicker: "THEMED EVENT",
  title: "샘플 행사",
  description: "테스트용 행사입니다.",
  startsOn: "2026-09-09",
  endsOn: "2026-09-15",
  stageIds: ["alpha", "beta", "gamma"],
};

function eventsData(events) {
  return { version: 1, timezone: "Asia/Seoul", events };
}

test("selectActiveEvent returns the event covering the KST date key", () => {
  const data = eventsData([sampleEvent]);
  assert.equal(RelayEvents.selectActiveEvent(data, "2026-09-09").id, "sample-event");
  assert.equal(RelayEvents.selectActiveEvent(data, "2026-09-15").id, "sample-event");
});

test("selectActiveEvent returns null outside the period", () => {
  const data = eventsData([sampleEvent]);
  assert.equal(RelayEvents.selectActiveEvent(data, "2026-09-08"), null);
  assert.equal(RelayEvents.selectActiveEvent(data, "2026-09-16"), null);
  assert.equal(RelayEvents.selectActiveEvent(eventsData([]), "2026-09-10"), null);
  assert.equal(RelayEvents.selectActiveEvent(null, "2026-09-10"), null);
});

test("selectActiveEvent prefers the most recently started overlapping event", () => {
  const older = Object.assign({}, sampleEvent, { id: "older", startsOn: "2026-09-01", endsOn: "2026-09-30" });
  const newer = Object.assign({}, sampleEvent, { id: "newer", startsOn: "2026-09-10", endsOn: "2026-09-20" });
  const data = eventsData([older, newer]);
  assert.equal(RelayEvents.selectActiveEvent(data, "2026-09-12").id, "newer");
  assert.equal(RelayEvents.selectActiveEvent(data, "2026-09-05").id, "older");
});

test("resolveEventStages preserves stageIds order and drops unknown ids", () => {
  const entries = [
    { id: "gamma", title: "G" },
    { id: "alpha", title: "A" },
  ];
  const stages = RelayEvents.resolveEventStages(sampleEvent, entries);
  assert.deepEqual(stages.map((stage) => stage.id), ["alpha", "gamma"]);
  assert.equal(RelayEvents.resolveEventStages(null, entries).length, 0);
});

test("stageIdSet exposes the event stage ids", () => {
  const set = RelayEvents.stageIdSet(sampleEvent);
  assert.ok(set.has("alpha"));
  assert.ok(!set.has("delta"));
  assert.equal(RelayEvents.stageIdSet(null).size, 0);
});

test("validateEvent rejects malformed events", () => {
  assert.ok(RelayEvents.validateEvent(sampleEvent).length === 0);
  assert.ok(RelayEvents.validateEvent(null).length > 0);
  assert.ok(
    RelayEvents.validateEvent(Object.assign({}, sampleEvent, { startsOn: "2026-13-40" })).length > 0,
  );
  assert.ok(
    RelayEvents.validateEvent(
      Object.assign({}, sampleEvent, { startsOn: "2026-09-16", endsOn: "2026-09-09" }),
    ).length > 0,
  );
  assert.ok(
    RelayEvents.validateEvent(Object.assign({}, sampleEvent, { stageIds: [] })).length > 0,
  );
  assert.ok(
    RelayEvents.validateEvent(
      Object.assign({}, sampleEvent, { stageIds: ["alpha", "alpha"] }),
    ).length > 0,
  );
});

test("formatPeriod renders an inclusive Korean date range", () => {
  assert.equal(RelayEvents.formatPeriod(sampleEvent, "ko-KR"), "9월 9일 ~ 9월 15일");
  assert.equal(RelayEvents.formatPeriod(null, "ko-KR"), "");
});

test("gallery filter restricts entries to active event stage ids", () => {
  const RelayGalleryFilter = require("../../app/domain/gallery-filter.js");
  const entries = [
    { id: "alpha", title: "A" },
    { id: "delta", title: "D" },
  ];
  const filtered = RelayGalleryFilter.applyFilters(entries, {
    sort: "name",
    event: true,
    eventIds: ["alpha"],
  });
  assert.deepEqual(
    filtered.map((entry) => entry.id),
    ["alpha"],
  );
  const inactive = RelayGalleryFilter.applyFilters(entries, {
    sort: "name",
    event: false,
    eventIds: ["alpha"],
  });
  assert.equal(inactive.length, 2);
  const params = RelayGalleryFilter.writeSearchParams({ event: true });
  assert.equal(params, "?event=1");
  assert.equal(RelayGalleryFilter.readSearchParams(params).event, true);
});

test("content/events.json is valid and references catalog stages", () => {
  const root = path.join(__dirname, "..", "..");
  const data = JSON.parse(fs.readFileSync(path.join(root, "content", "events.json"), "utf8"));
  assert.deepEqual(RelayEvents.validateEventsData(data), []);
  const catalog = JSON.parse(fs.readFileSync(path.join(root, "content", "catalog.json"), "utf8"));
  const knownIds = new Set((catalog.entries || []).map((entry) => entry.id));
  for (const event of data.events) {
    for (const id of event.stageIds) {
      assert.ok(knownIds.has(id), `unknown stage id in ${event.id}: ${id}`);
    }
    const resolved = RelayEvents.resolveEventStages(event, catalog.entries);
    assert.equal(resolved.length, event.stageIds.length);
  }
});
