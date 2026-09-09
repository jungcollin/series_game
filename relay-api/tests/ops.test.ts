import assert from "node:assert/strict";
import { test } from "node:test";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createMemoryStore } from "../src/store.js";

function makeApp(extra: Record<string, string> = {}) {
  const store = createMemoryStore();
  const app = createApp(store, loadConfig({
    NODE_ENV: "test",
    PORT: "8798",
    CORS_ORIGIN: "https://relay.collinworks.dev",
    SESSION_SIGNING_SECRET: "test-session-signing-secret-32-characters",
    ...extra,
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
  assert.match(response.headers.get("set-cookie") || "", /relay_session=/);
  assert.match(response.headers.get("x-request-id") || "", /[A-Za-z0-9._-]{8,}/);
  return { Authorization: `Bearer ${body.token}`, "Content-Type": "application/json" };
}

test("rejects disallowed write origins", async () => {
  const { app } = makeApp();
  const response = await app.request("/v1/session", {
    method: "POST",
    headers: { Origin: "https://evil.example" },
  });
  assert.equal(response.status, 403);
});

test("revoked sessions cannot write votes", async () => {
  const { app } = makeApp();
  const headers = await session(app);
  const revoked = await app.request("/v1/session/revoke", { method: "POST", headers });
  assert.equal(revoked.status, 200);
  const vote = await app.request("/v1/votes", {
    method: "PUT",
    headers,
    body: JSON.stringify({ stage_id: "fly-bird", vote: 1 }),
  });
  assert.equal(vote.status, 401);
});

test("reports require a session and do not echo the subject", async () => {
  const { app } = makeApp();
  const headers = await session(app);
  const created = await app.request("/v1/reports", {
    method: "POST",
    headers,
    body: JSON.stringify({ stage_id: "galaxy-boss", reason: "broken", detail: "로드가 안 됩니다" }),
  });
  assert.equal(created.status, 201);
  const body = await json(created) as { report: Record<string, unknown> };
  assert.equal(body.report.reason, "broken");
  assert.equal("subject" in body.report, false);
});

test("admin hide removes comments from the public list", async () => {
  const { app } = makeApp({ ADMIN_TOKEN: "admin-secret-token-32-characters-long" });
  const headers = await session(app);
  const created = await app.request("/v1/stages/fly-bird/comments", {
    method: "POST",
    headers,
    body: JSON.stringify({ author_name: "콜린", body: "숨길 댓글" }),
  });
  const comment = (await json(created) as { comment: { id: string } }).comment;
  const hidden = await app.request(`/v1/admin/comments/${comment.id}/hide`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Admin-Token": "admin-secret-token-32-characters-long" },
    body: JSON.stringify({ reason: "spam" }),
  });
  assert.equal(hidden.status, 200);
  const listed = await json(await app.request("/v1/stages/fly-bird/comments")) as { comments: unknown[] };
  assert.equal(listed.comments.length, 0);
});

test("v2 ranked writes stay closed unless the feature flag is on", async () => {
  const { app } = makeApp();
  const headers = await session(app);
  const closed = await app.request("/v2/runs", {
    method: "POST",
    headers,
    body: JSON.stringify({
      challenge_id: "daily-2026-09-08-r1",
      stage_ids: ["galaxy-boss", "slither-worm"],
    }),
  });
  assert.equal(closed.status, 403);
  assert.equal((await json(closed)).error, "ranked_writes_disabled");
});

test("v2 runs accept idempotent events and ignore another subject", async () => {
  const { app } = makeApp({ RANKED_WRITES_V2: "true" });
  const alice = await session(app);
  const bob = await session(app);
  const created = await app.request("/v2/runs", {
    method: "POST",
    headers: alice,
    body: JSON.stringify({
      challenge_id: "daily-2026-09-08-r1",
      stage_ids: ["galaxy-boss", "slither-worm"],
    }),
  });
  assert.equal(created.status, 201);
  const runId = (await json(created) as { run: { id: string } }).run.id;
  const event = {
    event_id: "evt-ready-0001",
    seq: 1,
    name: "stage_ready",
    payload: { stage_id: "galaxy-boss" },
  };
  const first = await app.request(`/v2/runs/${runId}/events`, {
    method: "POST",
    headers: alice,
    body: JSON.stringify(event),
  });
  const retry = await app.request(`/v2/runs/${runId}/events`, {
    method: "POST",
    headers: alice,
    body: JSON.stringify(event),
  });
  assert.equal(first.status, 200);
  assert.equal(retry.status, 200);
  const stolen = await app.request(`/v2/runs/${runId}`, { headers: bob });
  assert.equal(stolen.status, 403);
});

test("untrusted forwarding headers still share a rate-limit bucket", async () => {
  const { app } = makeApp({ TRUST_RELAY_CLIENT_IP: "false" });
  let response: Response | null = null;
  for (let index = 0; index < 31; index += 1) {
    response = await app.request("/v1/session", {
      method: "POST",
      headers: { "X-Relay-Client-IP": `198.51.100.${index}` },
    });
  }
  assert.equal(response?.status, 429);
});

test("creator stats hide small samples", async () => {
  const { app } = makeApp();
  const headers = await session(app);
  const stats = await json(await app.request("/v1/creators/jungcollin/stats", { headers }));
  assert.equal(stats.hidden, true);
});

test("analytics ingest stays closed unless the feature flag is on", async () => {
  const { app } = makeApp();
  const headers = await session(app);
  const closed = await app.request("/v1/events", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "stage_ready", stage_id: "galaxy-boss" }),
  });
  assert.equal(closed.status, 403);
  assert.equal((await json(closed)).error, "analytics_disabled");
});

test("production trusts X-Relay-Client-IP by default", () => {
  const config = loadConfig({
    NODE_ENV: "production",
    PORT: "8798",
    DATABASE_URL: "postgres://example.invalid/relay",
    SESSION_SIGNING_SECRET: "test-session-signing-secret-32-characters",
  });
  assert.equal(config.trustRelayClientIp, true);
});

test("test env does not trust client IP by default", () => {
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "8798",
    SESSION_SIGNING_SECRET: "test-session-signing-secret-32-characters",
  });
  assert.equal(config.trustRelayClientIp, false);
});

test("creator stats count only catalog stages for that github", async () => {
  const { app } = makeApp({ ANALYTICS_INGEST: "true" });
  const headers = await session(app);
  for (let index = 0; index < 5; index += 1) {
    const own = await app.request("/v1/events", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "stage_ready", stage_id: "galaxy-boss" }),
    });
    assert.equal(own.status, 200);
    const other = await app.request("/v1/events", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "stage_ready", stage_id: "abyssal-gate" }),
    });
    assert.equal(other.status, 200);
  }
  const ownStats = await json(await app.request("/v1/creators/jungcollin/stats?stages=abyssal-gate", { headers }));
  assert.equal(ownStats.hidden, false);
  assert.equal(ownStats.sample_size, 5);
  const otherStats = await json(await app.request("/v1/creators/collin-gits/stats", { headers }));
  assert.equal(otherStats.hidden, false);
  assert.equal(otherStats.sample_size, 5);
});
