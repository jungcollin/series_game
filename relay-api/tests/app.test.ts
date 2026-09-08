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
