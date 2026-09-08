import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createMemoryStore } from "../src/store.js";

function makeApp() {
  return createApp(createMemoryStore(), loadConfig({
    NODE_ENV: "test",
    PORT: "8798",
    CORS_ORIGIN: "https://relay.collinworks.dev",
  }));
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

test("health and ready", async () => {
  const app = makeApp();
  const health = await app.request("/v1/health");
  assert.equal(health.status, 200);
  assert.deepEqual(await json(health), { ok: true, service: "oneliferelay-api" });

  const ready = await app.request("/v1/ready");
  assert.equal(ready.status, 200);
});

test("saves and lists leaderboard by clear count then duration", async () => {
  const app = makeApp();
  const first = await app.request("/v1/leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      run_id: "run-1111111111-1",
      player_name: "이름이름",
      clear_count: 2,
      duration_sec: 12.4,
      finished_all_clear: false,
      stages: ["fly-bird", "jump-hurdle"],
    }),
  });
  assert.equal(first.status, 201);

  const second = await app.request("/v1/leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      run_id: "run-1111111111-2",
      player_name: "빠른사람",
      clear_count: 2,
      duration_sec: 8.1,
      finished_all_clear: false,
      stages: ["fly-bird"],
    }),
  });
  assert.equal(second.status, 201);

  const listed = await app.request("/v1/leaderboard");
  const payload = await json(listed) as { entries: Array<{ player_name: string; duration_sec: number }> };
  assert.equal(listed.status, 200);
  assert.equal(payload.entries[0].player_name, "빠른사람");
  assert.equal(payload.entries[0].duration_sec, 8.1);
});

test("rejects short nicknames", async () => {
  const app = makeApp();
  const response = await app.request("/v1/leaderboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      run_id: "run-1111111111-3",
      player_name: "가",
      clear_count: 1,
      duration_sec: 3,
      finished_all_clear: false,
      stages: ["fly-bird"],
    }),
  });
  assert.equal(response.status, 400);
  const payload = await json(response);
  assert.equal(payload.error, "invalid_input");
});

test("keeps the faster stage ranking", async () => {
  const app = makeApp();
  const visitor = "11111111-1111-1111-1111-111111111111";
  const first = await app.request("/v1/stages/fly-bird/rankings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitor_id: visitor, player_name: "러너", duration_sec: 9.4 }),
  });
  assert.equal(first.status, 200);

  const slower = await app.request("/v1/stages/fly-bird/rankings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitor_id: visitor, player_name: "러너", duration_sec: 12.1 }),
  });
  const slowerBody = await json(slower) as { ranking: { duration_sec: number } };
  assert.equal(slowerBody.ranking.duration_sec, 9.4);

  const faster = await app.request("/v1/stages/fly-bird/rankings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitor_id: visitor, player_name: "러너", duration_sec: 7.2 }),
  });
  const fasterBody = await json(faster) as { ranking: { duration_sec: number } };
  assert.equal(fasterBody.ranking.duration_sec, 7.2);
});

test("votes and comments round-trip", async () => {
  const app = makeApp();
  const visitor = "anon-1111111111111-42";

  const put = await app.request("/v1/votes", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stage_id: "fly-bird", visitor_id: visitor, vote: 1 }),
  });
  assert.equal(put.status, 200);

  const scores = await json(await app.request("/v1/votes")) as {
    scores: Array<{ stage_id: string; score: number }>;
  };
  assert.equal(scores.scores[0].score, 1);

  const mine = await json(await app.request(`/v1/votes/me?visitor_id=${encodeURIComponent(visitor)}`)) as {
    votes: Array<{ stage_id: string; vote: number }>;
  };
  assert.equal(mine.votes[0].vote, 1);

  const removed = await app.request(`/v1/votes?stage_id=fly-bird&visitor_id=${encodeURIComponent(visitor)}`, {
    method: "DELETE",
  });
  assert.equal(removed.status, 204);

  const comment = await app.request("/v1/stages/fly-bird/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitor_id: visitor, author_name: "관전", body: "재밌어요" }),
  });
  assert.equal(comment.status, 201);
  const comments = await json(await app.request("/v1/stages/fly-bird/comments")) as {
    comments: Array<{ body: string }>;
  };
  assert.equal(comments.comments[0].body, "재밌어요");
});
