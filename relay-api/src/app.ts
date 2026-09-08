import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { Hono } from "hono";
import { createSessionToken, requireSessionSubject, UnauthorizedError } from "./auth.js";
import type { Config } from "./config.js";
import { createRateLimitMiddleware } from "./rate-limit.js";
import type { RelayStore } from "./store.js";
import {
  DuplicateError,
  ValidationError,
  normalizeStageId,
  parseLimit,
  readCommentInput,
  readVoteInput,
  readVoteTarget,
} from "./validate.js";

export function createApp(store: RelayStore, config: Config) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "no-referrer");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (!c.res.headers.has("Cache-Control")) {
      c.header("Cache-Control", "no-store");
    }
  });

  app.use("*", cors({
    origin: (origin) => (origin && config.corsOrigins.has(origin) ? origin : undefined),
    allowMethods: ["GET", "PUT", "POST", "DELETE", "HEAD", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86_400,
  }));

  app.use("*", createRateLimitMiddleware());

  const writeLimit = bodyLimit({
    maxSize: 16 * 1024,
    onError: (c) => c.json({ error: "payload_too_large", message: "요청이 너무 큽니다." }, 413),
  });

  app.get("/v1/health", (c) => c.json({ ok: true, service: "oneliferelay-api" }));

  app.get("/v1/ready", async (c) => {
    try {
      await store.ping();
      return c.json({ ok: true, service: "oneliferelay-api" });
    } catch (error) {
      console.error("ready_failed", error);
      return c.json({ ok: false, service: "oneliferelay-api" }, 503);
    }
  });

  app.post("/v1/session", writeLimit, (c) => {
    const session = createSessionToken(config.sessionSigningSecret);
    return c.json({ token: session.token, expires_at: session.expiresAt }, 201);
  });

  app.get("/v1/leaderboard", async (c) => {
    try {
      const limit = parseLimit(c.req.query("limit"), 50, 50);
      const entries = await store.listLeaderboard(limit);
      return c.json({ entries, verified: false });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/v1/leaderboard", writeLimit, async (c) => {
    return c.json({ error: "verified_results_required", message: "검증되지 않은 클라이언트 기록 등록은 중단되었습니다." }, 410);
  });

  app.get("/v1/stages/:stageId/rankings", async (c) => {
    try {
      const stageId = normalizeStageId(c.req.param("stageId"));
      const limit = parseLimit(c.req.query("limit"), 10, 20);
      const rankings = (await store.listStageRankings(stageId, limit)).map(({ visitor_id: _private, ...row }) => row);
      return c.json({ rankings, verified: false });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/v1/stages/:stageId/rankings", writeLimit, async (c) => {
    return c.json({ error: "verified_results_required", message: "검증되지 않은 클라이언트 기록 등록은 중단되었습니다." }, 410);
  });

  app.get("/v1/votes", async (c) => {
    const scores = await store.listVoteScores();
    return c.json({ scores });
  });

  app.get("/v1/votes/me", async (c) => {
    try {
      const visitorId = requireSessionSubject(c.req.header("Authorization"), config.sessionSigningSecret);
      const votes = await store.listVotesForVisitor(visitorId);
      return c.json({ votes });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.put("/v1/votes", writeLimit, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json", message: "요청 본문이 올바르지 않습니다." }, 400);
    }
    try {
      const input = readVoteInput(body);
      const visitorId = requireSessionSubject(c.req.header("Authorization"), config.sessionSigningSecret);
      await store.upsertVote(input.stageId, visitorId, input.vote);
      return c.json({ ok: true });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.delete("/v1/votes", writeLimit, async (c) => {
    let body: unknown = null;
    try {
      body = await c.req.json();
    } catch {
      body = null;
    }
    try {
      const input = readVoteTarget(body, {
        stage_id: c.req.query("stage_id"),
      });
      const visitorId = requireSessionSubject(c.req.header("Authorization"), config.sessionSigningSecret);
      await store.deleteVote(input.stageId, visitorId);
      return c.body(null, 204);
    } catch (error) {
      return fail(c, error);
    }
  });

  app.get("/v1/stages/:stageId/comments", async (c) => {
    try {
      const stageId = normalizeStageId(c.req.param("stageId"));
      const limit = parseLimit(c.req.query("limit"), 50, 50);
      const comments = await store.listComments(stageId, limit);
      return c.json({ comments });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/v1/stages/:stageId/comments", writeLimit, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json", message: "요청 본문이 올바르지 않습니다." }, 400);
    }
    try {
      const input = readCommentInput(c.req.param("stageId"), body);
      const visitorId = requireSessionSubject(c.req.header("Authorization"), config.sessionSigningSecret);
      const comment = await store.insertComment({ ...input, visitorId });
      return c.json({ comment }, 201);
    } catch (error) {
      return fail(c, error);
    }
  });

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((error, c) => {
    console.error("request_failed", { path: c.req.path, error: error.message });
    return c.json({ error: "internal_error" }, 500);
  });

  return app;
}

function fail(c: { json: (body: unknown, status: 400 | 401 | 409) => Response }, error: unknown) {
  if (error instanceof UnauthorizedError) {
    return c.json({ error: "unauthorized", message: error.message }, 401);
  }
  if (error instanceof ValidationError) {
    return c.json({ error: "invalid_input", message: error.message }, 400);
  }
  if (error instanceof DuplicateError) {
    return c.json({ error: "duplicate", message: error.message }, 409);
  }
  throw error;
}
