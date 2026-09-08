import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createMemoryStore } from "../src/store.js";

function makeApp() {
  const store = createMemoryStore();
  const app = createApp(store, loadConfig({
    NODE_ENV: "test",
    PORT: "8798",
    CORS_ORIGIN: "https://relay.collinworks.dev",
    SESSION_SIGNING_SECRET: "test-session-signing-secret-32-characters",
  }));
  return { app, store };
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

async function session(app: ReturnType<typeof makeApp>["app"]) {
  const response = await app.request("/v1/session", { method: "POST" });
  assert.equal(response.status, 201);
  const body = await json(response) as { token: string };
  return { Authorization: `Bearer ${body.token}`, "Content-Type": "application/json" };
}

test("health and ready", async () => {
  const { app } = makeApp();
  assert.deepEqual(await json(await app.request("/v1/health")), { ok: true, service: "oneliferelay-api" });
  assert.equal((await app.request("/v1/ready")).status, 200);
});

test("rejects unverified leaderboard and stage ranking writes", async () => {
  const { app } = makeApp();
  const global = await app.request("/v1/leaderboard", { method: "POST", body: "{}" });
  const stage = await app.request("/v1/stages/fly-bird/rankings", { method: "POST", body: "{}" });
  assert.equal(global.status, 410);
  assert.equal(stage.status, 410);
  assert.equal((await json(global)).error, "verified_results_required");
});

test("legacy ranking POSTs stay closed and do not mutate stored history", async () => {
  const { app, store } = makeApp();
  await store.insertLeaderboard({
    run_id: "run-history01",
    player_name: "기존기록",
    clear_count: 3,
    duration_sec: 40.2,
    finished_all_clear: false,
    stages: ["galaxy-boss", "slither-worm", "lightning-dodge"],
  });
  const spoofed = await app.request("/v1/leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      run_id: "run-spoofed01",
      player_name: "스푸핑",
      clear_count: "5",
      duration_sec: "1",
      finished_all_clear: "false",
      stages: ["galaxy-boss"],
    }),
  });
  assert.equal(spoofed.status, 410);
  assert.equal((await json(spoofed)).error, "verified_results_required");

  const listed = await json(await app.request("/v1/leaderboard")) as {
    verified: boolean;
    entries: Array<{ player_name: string; run_id: string }>;
  };
  assert.equal(listed.verified, false);
  assert.equal(listed.entries.length, 1);
  assert.equal(listed.entries[0].player_name, "기존기록");
  assert.equal(listed.entries[0].run_id, "run-history01");
});

test("write endpoints reject coerced votes, invalid ids, and oversized payloads", async () => {
  const { app, store } = makeApp();
  const headers = await session(app);

  const stringVote = await app.request("/v1/votes", {
    method: "PUT",
    headers,
    body: JSON.stringify({ stage_id: "fly-bird", vote: "1" }),
  });
  assert.equal(stringVote.status, 400);
  assert.equal((await json(stringVote)).error, "invalid_input");

  const badStage = await app.request("/v1/votes", {
    method: "PUT",
    headers,
    body: JSON.stringify({ stage_id: "../etc/passwd", vote: 1 }),
  });
  assert.equal(badStage.status, 400);

  const oversized = await app.request("/v1/votes", {
    method: "PUT",
    headers,
    body: JSON.stringify({ stage_id: "fly-bird", vote: 1, pad: "x".repeat(20 * 1024) }),
  });
  assert.equal(oversized.status, 413);
  assert.equal((await json(oversized)).error, "payload_too_large");

  const emptyComment = await app.request("/v1/stages/fly-bird/comments", {
    method: "POST",
    headers,
    body: JSON.stringify({ author_name: "콜린", body: "" }),
  });
  assert.equal(emptyComment.status, 400);

  const scores = await json(await app.request("/v1/votes")) as { scores: unknown[] };
  assert.deepEqual(scores.scores, []);
  assert.equal((await store.listComments("fly-bird", 10)).length, 0);
});

test("query limit digit strings still work and junk query values return invalid_input", async () => {
  const { app } = makeApp();
  assert.equal((await app.request("/v1/leaderboard?limit=10")).status, 200);
  const invalid = await app.request("/v1/leaderboard?limit=nope");
  assert.equal(invalid.status, 400);
  assert.equal((await json(invalid)).error, "invalid_input");
});

test("keeps historical rankings read-only without exposing visitor ids", async () => {
  const { app, store } = makeApp();
  await store.upsertStageRanking({ stage_id: "fly-bird", visitor_id: "private-visitor-id", player_name: "기존기록", duration_sec: 9.4 });
  const response = await app.request("/v1/stages/fly-bird/rankings");
  const payload = await json(response) as { rankings: Array<Record<string, unknown>>; verified: boolean };
  assert.equal(response.status, 200);
  assert.equal(payload.verified, false);
  assert.equal(payload.rankings[0].player_name, "기존기록");
  assert.equal("visitor_id" in payload.rankings[0], false);
});

test("binds votes and comments to bearer session, not caller visitor_id", async () => {
  const { app } = makeApp();
  const alice = await session(app);
  const bob = await session(app);
  const put = await app.request("/v1/votes", {
    method: "PUT", headers: alice,
    body: JSON.stringify({ stage_id: "fly-bird", visitor_id: "attacker-selected", vote: 1 }),
  });
  assert.equal(put.status, 200);
  const aliceVotes = await json(await app.request("/v1/votes/me?visitor_id=attacker-selected", { headers: alice })) as { votes: Array<{ vote: number }> };
  const bobVotes = await json(await app.request("/v1/votes/me?visitor_id=attacker-selected", { headers: bob })) as { votes: Array<{ vote: number }> };
  assert.equal(aliceVotes.votes[0].vote, 1);
  assert.deepEqual(bobVotes.votes, []);
  const comment = await app.request("/v1/stages/fly-bird/comments", {
    method: "POST", headers: alice,
    body: JSON.stringify({ visitor_id: "attacker-selected", author_name: "관전", body: "재밌어요" }),
  });
  assert.equal(comment.status, 201);
});

test("requires valid bearer sessions for identity-bound endpoints", async () => {
  const { app } = makeApp();
  assert.equal((await app.request("/v1/votes/me")).status, 401);
  assert.equal((await app.request("/v1/votes", {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: "Bearer forged" },
    body: JSON.stringify({ stage_id: "fly-bird", vote: 1 }),
  })).status, 401);
});

test("spoofed forwarding headers cannot rotate the write-rate-limit bucket", async () => {
  const { app } = makeApp();
  let response: Response | null = null;
  for (let index = 0; index < 31; index += 1) {
    response = await app.request("/v1/session", {
      method: "POST",
      headers: {
        "CF-Connecting-IP": `198.51.100.${index}`,
        "X-Forwarded-For": `203.0.113.${index}`,
        "X-Real-IP": `192.0.2.${index}`,
      },
    });
  }
  assert.equal(response?.status, 429);
});
