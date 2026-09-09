import { randomUUID } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { Hono } from "hono";
import {
  buildSessionCookie,
  constantTimeEqual,
  createSessionToken,
  ForbiddenError,
  NotFoundError,
  requireSession,
  UnauthorizedError,
} from "./auth.js";
import type { Config } from "./config.js";
import { createRateLimitMiddleware } from "./rate-limit.js";
import type { RelayStore } from "./store.js";
import { payloadHash } from "./store.js";
import {
  DuplicateError,
  ValidationError,
  normalizeChallengeId,
  normalizeGithubHandle,
  normalizeStageId,
  parseLimit,
  readAnalyticsInput,
  readCommentInput,
  readCreateRunInput,
  readHideInput,
  readReportInput,
  readRunEventInput,
  readVoteInput,
  readVoteTarget,
} from "./validate.js";

export function createApp(store: RelayStore, config: Config) {
  const app = new Hono();

  app.use("*", async (c, next) => {
    const incoming = c.req.header("X-Request-Id")?.trim() || "";
    const requestId = /^[A-Za-z0-9._-]{8,80}$/.test(incoming) ? incoming : randomUUID();
    c.header("X-Request-Id", requestId);
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
    allowHeaders: ["Content-Type", "Authorization", "X-Request-Id", "X-Admin-Token"],
    exposeHeaders: ["X-Request-Id"],
    maxAge: 86_400,
  }));

  app.use("*", async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS") {
      const origin = c.req.header("Origin");
      if (origin && !config.corsOrigins.has(origin)) {
        return c.json({ error: "forbidden", message: "허용되지 않은 origin입니다." }, 403);
      }
    }
    await next();
  });

  app.use("*", createRateLimitMiddleware({ trustRelayClientIp: config.trustRelayClientIp }));

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
      console.error("ready_failed", { error: error instanceof Error ? error.message : "unknown" });
      return c.json({ ok: false, service: "oneliferelay-api" }, 503);
    }
  });

  app.post("/v1/session", writeLimit, (c) => {
    const session = createSessionToken(config.sessionSigningSecret);
    c.header("Set-Cookie", buildSessionCookie(session.token, session.expiresAt, config.nodeEnv === "production"));
    return c.json({ token: session.token, expires_at: session.expiresAt }, 201);
  });

  app.post("/v1/session/revoke", writeLimit, async (c) => {
    try {
      const session = await requireActiveSession(c, store, config);
      await store.revokeSession(session.subject, session.jti);
      await store.insertAudit({
        actor: session.subject,
        action: "session.revoke",
        target: session.jti || session.subject,
        requestId: c.res.headers.get("X-Request-Id"),
      });
      return c.json({ ok: true });
    } catch (error) {
      return fail(c, error);
    }
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
      const session = await requireActiveSession(c, store, config);
      const votes = await store.listVotesForVisitor(session.subject);
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
      const session = await requireActiveSession(c, store, config);
      await store.upsertVote(input.stageId, session.subject, input.vote);
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
      const session = await requireActiveSession(c, store, config);
      await store.deleteVote(input.stageId, session.subject);
      return c.body(null, 204);
    } catch (error) {
      return fail(c, error);
    }
  });

  app.get("/v1/stages/:stageId/comments", async (c) => {
    try {
      const stageId = normalizeStageId(c.req.param("stageId"));
      const limit = parseLimit(c.req.query("limit"), 50, 50);
      let visitorId: string | undefined;
      try {
        visitorId = (await requireActiveSession(c, store, config)).subject;
      } catch {
        visitorId = undefined;
      }
      const comments = await store.listComments(stageId, limit, visitorId);
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
      const session = await requireActiveSession(c, store, config);
      const comment = await store.insertComment({ ...input, visitorId: session.subject });
      return c.json({ comment }, 201);
    } catch (error) {
      return fail(c, error);
    }
  });

  app.delete("/v1/comments/:id", writeLimit, async (c) => {
    try {
      const session = await requireActiveSession(c, store, config);
      const deleted = await store.deleteOwnComment(c.req.param("id"), session.subject);
      if (!deleted) throw new ForbiddenError("다른 사용자의 댓글은 삭제할 수 없습니다.");
      await store.insertAudit({
        actor: session.subject,
        action: "comment.delete",
        target: c.req.param("id"),
        requestId: c.res.headers.get("X-Request-Id"),
      });
      return c.body(null, 204);
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/v1/reports", writeLimit, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json", message: "요청 본문이 올바르지 않습니다." }, 400);
    }
    try {
      const input = readReportInput(body);
      const session = await requireActiveSession(c, store, config);
      const report = await store.insertReport({
        subject: session.subject,
        stageId: input.stageId,
        reason: input.reason,
        detail: input.detail,
      });
      return c.json({ report: { id: report.id, stage_id: report.stage_id, reason: report.reason } }, 201);
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/v1/events", writeLimit, async (c) => {
    if (!config.analyticsIngest) {
      return c.json({ error: "analytics_disabled", message: "이벤트 수집은 아직 닫혀 있습니다." }, 403);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json", message: "요청 본문이 올바르지 않습니다." }, 400);
    }
    try {
      const input = readAnalyticsInput(body);
      const session = await requireActiveSession(c, store, config);
      await store.insertAnalytics({
        subject: session.subject,
        name: input.name,
        stageId: input.stageId,
        challengeId: input.challengeId,
        technical: input.technical,
      });
      return c.json({ ok: true });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/v1/admin/comments/:id/hide", writeLimit, async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json", message: "요청 본문이 올바르지 않습니다." }, 400);
    }
    try {
      if (!config.adminToken) {
        return c.json({ error: "admin_unconfigured", message: "관리자 토큰이 설정되지 않았습니다." }, 503);
      }
      const provided = c.req.header("X-Admin-Token") || "";
      if (!constantTimeEqual(provided, config.adminToken)) throw new UnauthorizedError();
      const input = readHideInput(body);
      const comment = await store.hideComment(c.req.param("id"), input.reason);
      await store.insertAudit({
        actor: "admin",
        action: "comment.hide",
        target: comment.id,
        detail: { reason: input.reason },
        requestId: c.res.headers.get("X-Request-Id"),
      });
      return c.json({ ok: true, comment: { id: comment.id } });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.get("/v1/creators/:github/stats", async (c) => {
    try {
      await requireActiveSession(c, store, config);
      const github = normalizeGithubHandle(c.req.param("github"));
      const stageIds = config.creatorStagesByGithub.get(github) || [];
      const summary = await store.summarizeCreatorStats(stageIds);
      if (summary.sample_size < 5) {
        return c.json({ hidden: true, sample_size: summary.sample_size, message: "표본이 부족합니다." });
      }
      return c.json({
        hidden: false,
        sample_size: summary.sample_size,
        play_starts: summary.play_starts,
        clears: summary.clears,
        tech_errors: summary.tech_errors,
      });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.get("/v1/challenges/today", (c) => {
    return c.json({
      ranked_writes: config.rankedWritesV2,
      source: "static-catalog",
      message: "코스 편성은 정적 catalog에서 재현합니다.",
    });
  });

  app.post("/v2/runs", writeLimit, async (c) => {
    if (!config.rankedWritesV2) {
      return c.json({ error: "ranked_writes_disabled", message: "공식 기록 쓰기는 아직 닫혀 있습니다." }, 403);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json", message: "요청 본문이 올바르지 않습니다." }, 400);
    }
    try {
      const input = readCreateRunInput(body);
      const session = await requireActiveSession(c, store, config);
      const run = await store.createChallengeRun({
        subject: session.subject,
        challengeId: input.challengeId,
        stageIds: input.stageIds,
      });
      return c.json({ run: publicRun(run) }, 201);
    } catch (error) {
      return fail(c, error);
    }
  });

  app.get("/v2/runs/:id", async (c) => {
    try {
      const session = await requireActiveSession(c, store, config);
      const run = await store.getChallengeRun(c.req.param("id"));
      if (!run) throw new NotFoundError();
      if (run.subject !== session.subject) throw new ForbiddenError();
      return c.json({ run: publicRun(run) });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/v2/runs/:id/events", writeLimit, async (c) => {
    if (!config.rankedWritesV2) {
      return c.json({ error: "ranked_writes_disabled", message: "공식 기록 쓰기는 아직 닫혀 있습니다." }, 403);
    }
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_json", message: "요청 본문이 올바르지 않습니다." }, 400);
    }
    try {
      const input = readRunEventInput(body);
      const session = await requireActiveSession(c, store, config);
      const run = await store.appendChallengeRunEvent(c.req.param("id"), session.subject, {
        ...input,
        payloadHash: payloadHash(input.payload),
      });
      return c.json({ run: publicRun(run) });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.post("/v2/runs/:id/finalize", writeLimit, async (c) => {
    if (!config.rankedWritesV2) {
      return c.json({ error: "ranked_writes_disabled", message: "공식 기록 쓰기는 아직 닫혀 있습니다." }, 403);
    }
    try {
      const session = await requireActiveSession(c, store, config);
      const run = await store.finalizeChallengeRun(c.req.param("id"), session.subject);
      return c.json({ run: publicRun(run) });
    } catch (error) {
      return fail(c, error);
    }
  });

  app.get("/v2/challenges/:challengeId/leaderboard", async (c) => {
    try {
      const challengeId = normalizeChallengeId(c.req.param("challengeId"));
      const rows = await store.listFinalizedChallengeRuns(challengeId);
      return c.json({
        ranked_writes: config.rankedWritesV2,
        entries: rows.map((row) => ({
          challenge_id: row.challenge_id,
          clear_count: row.clear_count,
          duration_sec: row.duration_sec,
          finished_all_clear: row.finished_all_clear,
          created_at: row.created_at,
        })),
      });
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

async function requireActiveSession(
  c: { req: { header: (name: string) => string | undefined } },
  store: RelayStore,
  config: Config,
) {
  const session = requireSession(c.req.header("Authorization"), config.sessionSigningSecret, c.req.header("Cookie"));
  if (await store.isRevoked(session.subject, session.jti)) throw new UnauthorizedError();
  return session;
}

function publicRun(run: {
  id: string;
  challenge_id: string;
  status: string;
  clear_count: number;
  duration_sec: number;
  finished_all_clear: boolean;
  stages: string[];
  event_count: number;
  created_at: string;
  finalized_at: string | null;
}) {
  return {
    id: run.id,
    challenge_id: run.challenge_id,
    status: run.status,
    clear_count: run.clear_count,
    duration_sec: run.duration_sec,
    finished_all_clear: run.finished_all_clear,
    stages: run.stages,
    event_count: run.event_count,
    created_at: run.created_at,
    finalized_at: run.finalized_at,
  };
}

function fail(c: { json: (body: unknown, status: 400 | 401 | 403 | 404 | 409) => Response }, error: unknown) {
  if (error instanceof UnauthorizedError) {
    return c.json({ error: "unauthorized", message: error.message }, 401);
  }
  if (error instanceof ForbiddenError) {
    return c.json({ error: "forbidden", message: error.message }, 403);
  }
  if (error instanceof NotFoundError) {
    return c.json({ error: "not_found", message: error.message }, 404);
  }
  if (error instanceof ValidationError) {
    return c.json({ error: "invalid_input", message: error.message }, 400);
  }
  if (error instanceof DuplicateError) {
    return c.json({ error: "duplicate", message: error.message }, 409);
  }
  if (error instanceof Error && error.message === "not_found") {
    return c.json({ error: "not_found", message: "찾을 수 없습니다." }, 404);
  }
  if (error instanceof Error && error.message === "forbidden") {
    return c.json({ error: "forbidden", message: "권한이 없습니다." }, 403);
  }
  if (error instanceof Error && (error.message === "event_seq" || error.message === "event_stage" || error.message === "run_open" || error.message === "invalid_event")) {
    return c.json({ error: "invalid_input", message: "런 이벤트가 올바르지 않습니다." }, 400);
  }
  throw error;
}
