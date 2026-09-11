const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ApiClient = require("../../app/infrastructure/api-client.js");
const LocalStore = require("../../app/infrastructure/local-storage.js");
const Analytics = require("../../app/infrastructure/analytics.js");
const ResultPolicy = require("../../app/domain/result-policy.js");
const GalleryFilter = require("../../app/domain/gallery-filter.js");
const ChallengeRank = require("../../app/domain/challenge-rank.js");
const DailyV2 = require("../../app/domain/daily-v2.js");
const SdkV2 = require("../../community-stages/sdk/v2/relay-sdk.js");
const {
  buildCatalog,
  checkCatalogSync,
  generationFor,
} = require("../scripts/build_catalog.js");
const { packageStage } = require("../scripts/package_stage.js");
const { reviewPool, summarize } = require("../scripts/review_pool.js");

const repoRoot = path.resolve(__dirname, "../..");

test("API client times out writes and does not retry them", async () => {
  let calls = 0;
  const fetchImpl = () => {
    calls += 1;
    return new Promise(() => {});
  };
  await assert.rejects(
    () =>
      ApiClient.request("https://example.test/v1/reports", {
        method: "POST",
        body: "{}",
        fetch: fetchImpl,
        timeoutMs: 20,
        retry: true,
      }),
    /시간/,
  );
  assert.equal(calls, 1);
});

test("API client retries idempotent GET timeouts once", async () => {
  let calls = 0;
  const fetchImpl = () => {
    calls += 1;
    return new Promise(() => {});
  };
  await assert.rejects(
    () =>
      ApiClient.request("https://example.test/v1/votes", {
        method: "GET",
        fetch: fetchImpl,
        timeoutMs: 20,
        retry: true,
      }),
    /시간/,
  );
  assert.equal(calls, 2);
});

test("local favorites and recent plays survive broken JSON", () => {
  const storage = {
    data: {
      "olr-favorites-v1": "{not-json",
      "olr-recent-plays-v1": "{also-bad",
    },
    getItem(key) {
      return this.data[key] || null;
    },
    setItem(key, value) {
      this.data[key] = value;
    },
    removeItem(key) {
      delete this.data[key];
    },
  };
  assert.deepEqual(LocalStore.readFavorites(storage), []);
  const toggled = LocalStore.toggleFavorite("galaxy-boss", storage);
  assert.equal(toggled.active, true);
  LocalStore.recordRecent("galaxy-boss", 1, storage);
  assert.equal(LocalStore.readRecent(storage)[0].id, "galaxy-boss");
  assert.deepEqual(
    LocalStore.dropMissing(["missing", "galaxy-boss"], ["galaxy-boss"]),
    ["galaxy-boss"],
  );
});

test("result policy keeps practice and writes-off out of official submits", () => {
  const today = ResultPolicy.buildChallengeId("2026-09-08", 1);
  assert.equal(
    ResultPolicy.classifyRun({
      mode: "practice",
      challengeId: today,
      todayChallengeId: today,
      outcome: "all-clear",
      rankedWritesEnabled: true,
    }).canSubmitOfficial,
    false,
  );
  assert.equal(
    ResultPolicy.classifyRun({
      challengeId: today,
      todayChallengeId: today,
      outcome: "failed",
      rankedWritesEnabled: false,
    }).saveState,
    "writes-off",
  );
  assert.equal(
    ResultPolicy.classifyRun({
      challengeId: "daily-2026-01-01-r1",
      todayChallengeId: today,
      outcome: "all-clear",
      rankedWritesEnabled: true,
    }).saveState,
    "archive",
  );
  assert.equal(
    ResultPolicy.classifyRun({
      challengeId: "daily-2026-09-08-r1",
      todayChallengeId: "daily-2026-09-08-r2",
      outcome: "all-clear",
      rankedWritesEnabled: true,
    }).saveState,
    "archive",
  );
});

test("gallery filters preserve query state and newest uses publishedAt", () => {
  const entries = [
    {
      id: "a",
      title: "Alpha",
      genre: "Arcade",
      publishedAt: "2026-01-02T00:00:00Z",
      review: { mechanic: "dodge" },
    },
    {
      id: "b",
      title: "Beta",
      genre: "Puzzle",
      publishedAt: "2026-02-02T00:00:00Z",
      review: { mechanic: "memory" },
    },
  ];
  const newest = GalleryFilter.applyFilters(entries, { sort: "newest" });
  assert.equal(newest[0].id, "b");
  const query = GalleryFilter.applyFilters(entries, { q: "beta" });
  assert.equal(query.length, 1);
  assert.equal(
    GalleryFilter.writeSearchParams({ q: "beta", sort: "newest", fav: true }),
    "?q=beta&sort=newest&fav=1",
  );
});

test("catalog generations split v1 legacy from v2 and gallery can filter by generation", () => {
  assert.equal(generationFor("2026-07-12T20:33:19+09:00"), "v1");
  assert.equal(generationFor("2026-09-08T23:59:59+09:00"), "v1");
  assert.equal(generationFor("2026-09-09T16:32:55+09:00"), "v2");
  assert.equal(generationFor("2026-09-10T00:00:00+09:00"), "v2");
  assert.equal(generationFor(null), "v2");
  assert.equal(generationFor("not-a-date"), "v2");
  const catalog = buildCatalog(repoRoot);
  assert.ok(catalog.entries.length > 0);
  const v2Ids = new Set(
    catalog.entries
      .filter((entry) => entry.generation === "v2")
      .map((entry) => entry.id),
  );
  const priorV2 = [
    "moonlight-greenhouse",
    "neon-rail",
    "orbit-ringer",
    "tailwind-guide",
    "tempo-conductor",
    "tilt-marble",
    "vacuum-tube-post",
  ];
  for (const id of priorV2) {
    assert.ok(v2Ids.has(id), `prior v2 stage missing: ${id}`);
  }
  const qualityPack = JSON.parse(
    fs.readFileSync(
      path.join(repoRoot, "community-stages", "v2-fifty-catalog.json"),
      "utf8",
    ),
  );
  const qualityIds = [
    ...qualityPack.existing,
    ...qualityPack.stages.map((stage) => stage.slug),
  ];
  for (const id of qualityIds) {
    assert.ok(v2Ids.has(id), `v2 quality pack stage missing: ${id}`);
  }
  const v1Ids = new Set(
    catalog.entries
      .filter((entry) => entry.generation === "v1")
      .map((entry) => entry.id),
  );
  assert.ok(v1Ids.has("slither-worm"), "legacy stages stay v1");
  assert.equal(qualityIds.length, 50);
  const entries = [
    { id: "legacy", title: "Legacy", generation: "v1" },
    { id: "fresh", title: "Fresh", generation: "v2" },
  ];
  assert.deepEqual(
    GalleryFilter.applyFilters(entries, { gen: "v1" }).map((e) => e.id),
    ["legacy"],
  );
  assert.deepEqual(
    GalleryFilter.applyFilters(entries, { gen: "v2" }).map((e) => e.id),
    ["fresh"],
  );
  assert.equal(GalleryFilter.writeSearchParams({ gen: "v1" }), "?gen=v1");
  assert.equal(GalleryFilter.readSearchParams("?gen=v1").gen, "v1");
});

test("daily pool switches to v2-only once the v2 pool reaches the threshold", () => {
  const make = (generation, count, tag) =>
    Array.from({ length: count }, (_, i) => ({
      id: `${tag}-${i}`,
      generation,
      review: {
        officialEligible: true,
        status: "preliminary-eligible",
        mechanic: `m-${tag}-${i}`,
      },
    }));
  const v1 = make("v1", 6, "old");
  const rules = {
    slotCount: 2,
    minMechanicsPerDay: 2,
    v2OnlyWhenPoolAtLeast: 3,
  };
  const below = DailyV2.eligiblePool(v1.concat(make("v2", 2, "new")), rules);
  assert.equal(below.length, 8, "임계값 미만이면 혼합 풀 유지");
  const atThreshold = DailyV2.eligiblePool(
    v1.concat(make("v2", 3, "new")),
    rules,
  );
  assert.equal(atThreshold.length, 3);
  assert.ok(
    atThreshold.every((entry) => entry.generation === "v2"),
    "임계값 도달 시 v2만",
  );
  const noGate = DailyV2.eligiblePool(v1, {
    slotCount: 2,
    minMechanicsPerDay: 2,
  });
  assert.equal(noGate.length, 6, "임계값 미설정이면 게이트 꺼짐");
  const poorMechanics = DailyV2.eligiblePool(
    v1.concat(
      make("v2", 3, "new").map((entry) => ({
        ...entry,
        review: { ...entry.review, mechanic: "same" },
      })),
    ),
    rules,
  );
  assert.equal(
    poorMechanics.length,
    9,
    "v2 메커닉 다양성이 부족하면 혼합 풀 유지",
  );
});

test("challenge ranks never reward a faster fail over a later fail with more clears", () => {
  const rows = ChallengeRank.withRanks([
    {
      subject: "a",
      finished_all_clear: false,
      clear_count: 0,
      duration_sec: 1,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      subject: "b",
      finished_all_clear: false,
      clear_count: 2,
      duration_sec: 40,
      created_at: "2026-01-01T00:00:01Z",
    },
    {
      subject: "c",
      finished_all_clear: true,
      clear_count: 5,
      duration_sec: 90,
      created_at: "2026-01-01T00:00:02Z",
    },
  ]);
  assert.equal(rows[0].subject, "c");
  assert.equal(rows[1].subject, "b");
  assert.equal(rows[2].subject, "a");
});

test("daily v2 28-day simulation stays inside the eligible pool", () => {
  const catalog = buildCatalog(repoRoot);
  const rules = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "content", "daily-rules.json"), "utf8"),
  );
  const challenges = DailyV2.simulateRange(
    catalog.entries,
    "2026-09-01",
    28,
    rules,
  );
  assert.equal(challenges.length, 28);
  const mechanics = new Set();
  for (const challenge of challenges) {
    assert.equal(challenge.stages.length, 5);
    assert.equal(new Set(challenge.stages.map((stage) => stage.id)).size, 5);
    challenge.stages.forEach((stage) => mechanics.add(stage.mechanic));
    const ids = new Set(challenge.stages.map((stage) => stage.id));
    assert.equal(ids.has("echo-twins"), false);
  }
  assert.ok(mechanics.size >= 6);
  const today = DailyV2.buildChallenge(catalog.entries, "2026-09-08", rules);
  const again = DailyV2.buildChallenge(catalog.entries, "2026-09-08", rules);
  assert.deepEqual(today, again);
  const history = DailyV2.historyBefore(catalog.entries, "2026-09-08", rules);
  assert.equal(Object.keys(history).length, rules.cooldownDays);
  assert.equal(history["2026-09-07"].length, 5);
  const previous = DailyV2.buildChallenge(catalog.entries, "2026-09-01", rules);
  const withHistory = DailyV2.buildChallenge(
    catalog.entries,
    "2026-09-02",
    rules,
    {
      "2026-09-01": previous.stages.map((stage) => stage.id),
    },
  );
  const withoutHistory = DailyV2.buildChallenge(
    catalog.entries,
    "2026-09-02",
    rules,
  );
  assert.notDeepEqual(
    withHistory.stages.map((stage) => stage.id),
    withoutHistory.stages.map((stage) => stage.id),
  );
  const overlap = withHistory.stages.filter((stage) =>
    previous.stages.some((item) => item.id === stage.id),
  );
  assert.equal(overlap.length, 0);
  const simulated = DailyV2.simulateRange(
    catalog.entries,
    "2026-09-01",
    10,
    rules,
  );
  for (let index = 1; index < simulated.length; index += 1) {
    const previousIds = new Set(
      simulated[index - 1].stages.map((stage) => stage.id),
    );
    const repeats = simulated[index].stages.filter((stage) =>
      previousIds.has(stage.id),
    );
    assert.equal(
      repeats.length,
      0,
      "consecutive days must not reuse yesterday's stages",
    );
  }
  const r1 = DailyV2.buildChallenge(
    catalog.entries,
    "2026-09-08",
    Object.assign({}, rules, { revision: 1 }),
  );
  const r2 = DailyV2.buildChallenge(
    catalog.entries,
    "2026-09-08",
    Object.assign({}, rules, { revision: 2 }),
  );
  assert.equal(r1.id, "daily-2026-09-08-r1");
  assert.equal(r2.id, "daily-2026-09-08-r2");
});

test("catalog hash is stable and author approvals are rejected", () => {
  const first = buildCatalog(repoRoot);
  const second = buildCatalog(repoRoot);
  assert.equal(first.hash, second.hash);
  const sync = checkCatalogSync(repoRoot);
  assert.equal(sync.ok, true, "content/catalog.json must be generated");
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "relay-catalog-"));
  fs.mkdirSync(path.join(fixture, "community-stages", "bad-stage"), {
    recursive: true,
  });
  fs.mkdirSync(path.join(fixture, "content"), { recursive: true });
  fs.writeFileSync(
    path.join(fixture, "community-stages", "bad-stage", "index.html"),
    "<html></html>",
  );
  fs.writeFileSync(
    path.join(fixture, "community-stages", "bad-stage", "meta.json"),
    JSON.stringify({
      id: "bad-stage",
      title: "Bad",
      description: "nope",
      genre: "Test",
      clearCondition: "x",
      failCondition: "y",
      controls: "z",
      creator: "Tester",
      dailyEligible: true,
    }),
  );
  fs.writeFileSync(
    path.join(fixture, "content", "reviews.json"),
    JSON.stringify({ stages: {} }),
  );
  assert.throws(() => buildCatalog(fixture), /dailyEligible/);
});

test("review pool has 20 preliminary verdicts and at least 12 official-eligible", () => {
  const entries = reviewPool(repoRoot);
  const summary = summarize(entries);
  assert.equal(summary.reviewed, 20);
  assert.ok(summary.officialEligible >= 12);
  assert.ok(summary.mechanics.length >= 6);
  assert.equal(summary.humanPlay, false);
});

test("stage packages are content-hashed and stay put when another stage changes", () => {
  const first = packageStage(repoRoot, "galaxy-boss");
  const second = packageStage(repoRoot, "galaxy-boss");
  assert.equal(first.hash, second.hash);
  assert.ok(
    first.files.some((file) => file.path.endsWith("galaxy-boss/index.html")),
  );
  assert.ok(
    first.files.some((file) => file.path.endsWith("sdk/v2/relay-sdk.js")),
  );
});

test("SDK v2 ignores the wrong instance or token", () => {
  const messages = [];
  const host = SdkV2.createHost({
    stageId: "galaxy-boss",
    token: "token-a",
    instanceId: "inst-1",
    target: {
      postMessage(message) {
        messages.push(message);
      },
    },
  });
  host.ready({ id: "galaxy-boss" });
  assert.equal(
    SdkV2.acceptHostMessage(messages[0], {
      token: "token-a",
      instanceId: "inst-1",
    }),
    true,
  );
  assert.equal(
    SdkV2.acceptHostMessage(messages[0], { token: "token-b" }),
    false,
  );
  host.dispose();
  host.ready({ id: "galaxy-boss" });
  assert.equal(messages.length, 2);
});

test("v2 ranked writes stay closed in default config and isolation remains sandbox-only", () => {
  const config = fs.readFileSync(
    path.join(repoRoot, "relay-api/src/config.ts"),
    "utf8",
  );
  const home = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
  assert.match(
    config,
    /rankedWritesV2: readFlag\(env.RANKED_WRITES_V2, false\)/,
  );
  assert.match(
    config,
    /analyticsIngest: readFlag\(env.ANALYTICS_INGEST, false\)/,
  );
  assert.match(home, /sandbox="allow-scripts allow-pointer-lock"/);
  assert.doesNotMatch(home, /allow-same-origin/);
});

test("ops migration keeps v1 tables and adds reports, audit, and v2 runs", () => {
  const sql = fs.readFileSync(
    path.join(repoRoot, "relay-api/migrations/0002_community_ops.sql"),
    "utf8",
  );
  assert.match(sql, /content_reports/);
  assert.match(sql, /audit_events/);
  assert.match(sql, /challenge_runs/);
  assert.match(sql, /session_revocations/);
  assert.doesNotMatch(sql, /drop table leaderboard_runs/i);
});

test("analytics excludes technical failures from difficulty rates", () => {
  const events = [
    { name: "stage_ready" },
    { name: "stage_fail" },
    { name: "stage_invalid" },
    { name: "stage_ready" },
    { name: "stage_clear" },
  ];
  const fail = Analytics.compute("fail_rate", events);
  const clear = Analytics.compute("clear_rate", events);
  const invalid = Analytics.compute("invalid_rate", events);
  assert.equal(fail.numerator, 1);
  assert.equal(fail.denominator, 1);
  assert.equal(clear.numerator, 1);
  assert.equal(clear.denominator, 1);
  assert.equal(invalid.numerator, 1);
  assert.equal(
    Analytics.shouldSend({ name: "stage_fail" }, { optOut: true }),
    false,
  );
});
