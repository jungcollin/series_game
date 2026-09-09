import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { DuplicateError } from "./validate.js";
import { applyRunEvent, finalizeRun, type ChallengeRun, type RunEventInput } from "./runs.js";

export interface LeaderboardRow {
  run_id: string;
  player_name: string;
  clear_count: number;
  duration_sec: number;
  finished_all_clear: boolean;
  stages: string[];
  created_at: string;
}

export interface StageRankingRow {
  stage_id: string;
  visitor_id: string;
  player_name: string;
  duration_sec: number;
  updated_at: string;
}

export interface VoteScoreRow {
  stage_id: string;
  score: number;
  upvotes: number;
  downvotes: number;
}

export interface VoteRow {
  stage_id: string;
  vote: 1 | -1;
}

export interface CommentRow {
  id: string;
  author_name: string;
  body: string;
  created_at: string;
  mine?: boolean;
}

export interface ReportRow {
  id: string;
  subject: string;
  stage_id: string;
  reason: string;
  detail: string;
  created_at: string;
}

export interface AuditRow {
  id: string;
  actor: string;
  action: string;
  target: string;
  detail: Record<string, unknown>;
  request_id: string | null;
  created_at: string;
}

export interface AnalyticsRow {
  name: string;
  subject: string | null;
  stage_id: string | null;
  challenge_id: string | null;
  technical: boolean;
  created_at: string;
}

export interface CreatorStatsSummary {
  sample_size: number;
  play_starts: number;
  clears: number;
  tech_errors: number;
}

export interface RelayStore {
  ping(): Promise<void>;
  listLeaderboard(limit: number): Promise<LeaderboardRow[]>;
  insertLeaderboard(row: Omit<LeaderboardRow, "created_at"> & { created_at?: string }): Promise<LeaderboardRow>;
  listStageRankings(stageId: string, limit: number): Promise<StageRankingRow[]>;
  upsertStageRanking(row: Omit<StageRankingRow, "updated_at">): Promise<StageRankingRow>;
  listVoteScores(): Promise<VoteScoreRow[]>;
  listVotesForVisitor(visitorId: string): Promise<VoteRow[]>;
  upsertVote(stageId: string, visitorId: string, vote: 1 | -1): Promise<void>;
  deleteVote(stageId: string, visitorId: string): Promise<void>;
  listComments(stageId: string, limit: number, visitorId?: string): Promise<CommentRow[]>;
  insertComment(row: { stageId: string; visitorId: string; authorName: string; body: string }): Promise<CommentRow>;
  hideComment(id: string, reason: string): Promise<CommentRow>;
  deleteOwnComment(id: string, visitorId: string): Promise<boolean>;
  revokeSession(subject: string, jti: string | null): Promise<void>;
  isRevoked(subject: string, jti: string | null): Promise<boolean>;
  insertReport(row: { subject: string; stageId: string; reason: string; detail: string }): Promise<ReportRow>;
  insertAudit(row: { actor: string; action: string; target: string; detail?: Record<string, unknown>; requestId?: string | null }): Promise<AuditRow>;
  insertAnalytics(row: { subject: string | null; name: string; stageId: string | null; challengeId: string | null; technical: boolean }): Promise<void>;
  summarizeCreatorStats(stageIds: string[]): Promise<CreatorStatsSummary>;
  createChallengeRun(row: { subject: string; challengeId: string; stageIds: string[] }): Promise<ChallengeRun>;
  getChallengeRun(id: string): Promise<ChallengeRun | null>;
  appendChallengeRunEvent(runId: string, subject: string, event: RunEventInput): Promise<ChallengeRun>;
  finalizeChallengeRun(runId: string, subject: string): Promise<ChallengeRun>;
  listFinalizedChallengeRuns(challengeId: string): Promise<ChallengeRun[]>;
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function emptyCreatorStats(): CreatorStatsSummary {
  return { sample_size: 0, play_starts: 0, clears: 0, tech_errors: 0 };
}

function summarizeAnalyticsRows(rows: AnalyticsRow[], stageIds: string[]): CreatorStatsSummary {
  if (!stageIds.length) return emptyCreatorStats();
  const allowed = new Set(stageIds);
  const events = rows.filter((row) => row.stage_id && allowed.has(row.stage_id));
  return {
    sample_size: events.filter((event) => event.name === "stage_ready").length,
    play_starts: events.filter((event) => event.name === "run_start" || event.name === "stage_ready").length,
    clears: events.filter((event) => event.name === "stage_clear").length,
    tech_errors: events.filter((event) => event.name === "stage_invalid" || event.technical).length,
  };
}

function isPgUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
}

function payloadHash(payload: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function mapComment(row: Record<string, unknown>, visitorId?: string): CommentRow {
  return {
    id: String(row.id),
    author_name: String(row.author_name),
    body: String(row.body),
    created_at: asIso(row.created_at),
    mine: visitorId ? String(row.visitor_id) === visitorId : undefined,
  };
}

function mapChallengeRun(row: Record<string, unknown>): ChallengeRun {
  return {
    id: String(row.id),
    subject: String(row.subject),
    challenge_id: String(row.challenge_id),
    stage_ids: Array.isArray(row.stage_ids) ? row.stage_ids.map(String) : [],
    status: row.status as ChallengeRun["status"],
    clear_count: asNumber(row.clear_count),
    duration_sec: asNumber(row.duration_sec),
    finished_all_clear: Boolean(row.finished_all_clear),
    stages: Array.isArray(row.stages) ? row.stages.map(String) : [],
    event_count: asNumber(row.event_count),
    created_at: asIso(row.created_at),
    finalized_at: row.finalized_at ? asIso(row.finalized_at) : null,
  };
}

export function createPgStore(pool: Pool): RelayStore {
  return {
    async ping() {
      await pool.query("select 1");
    },

    async listLeaderboard(limit) {
      const result = await pool.query(
        `select run_id, player_name, clear_count, duration_sec, finished_all_clear, stages, created_at
           from leaderboard_runs
          order by clear_count desc, finished_all_clear desc, duration_sec asc, created_at asc
          limit $1`,
        [limit],
      );
      return result.rows.map(mapLeaderboard);
    },

    async insertLeaderboard(row) {
      try {
        const result = await pool.query(
          `insert into leaderboard_runs
             (run_id, player_name, clear_count, duration_sec, finished_all_clear, stages)
           values ($1, $2, $3, $4, $5, $6)
           returning run_id, player_name, clear_count, duration_sec, finished_all_clear, stages, created_at`,
          [row.run_id, row.player_name, row.clear_count, row.duration_sec, row.finished_all_clear, row.stages],
        );
        return mapLeaderboard(result.rows[0]);
      } catch (error) {
        if (isPgUniqueViolation(error)) throw new DuplicateError();
        throw error;
      }
    },

    async listStageRankings(stageId, limit) {
      const result = await pool.query(
        `select stage_id, visitor_id, player_name, duration_sec, updated_at
           from stage_rankings
          where stage_id = $1
          order by duration_sec asc, updated_at asc
          limit $2`,
        [stageId, limit],
      );
      return result.rows.map(mapStageRanking);
    },

    async upsertStageRanking(row) {
      const upsert = await pool.query(
        `insert into stage_rankings (stage_id, visitor_id, player_name, duration_sec)
         values ($1, $2, $3, $4)
         on conflict (stage_id, visitor_id) do update set
           player_name = excluded.player_name,
           duration_sec = excluded.duration_sec,
           updated_at = timezone('utc', now())
         where stage_rankings.duration_sec > excluded.duration_sec
         returning stage_id, visitor_id, player_name, duration_sec, updated_at`,
        [row.stage_id, row.visitor_id, row.player_name, row.duration_sec],
      );
      if (upsert.rows[0]) return mapStageRanking(upsert.rows[0]);
      const existing = await pool.query(
        `select stage_id, visitor_id, player_name, duration_sec, updated_at
           from stage_rankings
          where stage_id = $1 and visitor_id = $2`,
        [row.stage_id, row.visitor_id],
      );
      return mapStageRanking(existing.rows[0]);
    },

    async listVoteScores() {
      const result = await pool.query(
        `select stage_id,
                coalesce(sum(vote), 0)::int as score,
                count(*) filter (where vote = 1)::int as upvotes,
                count(*) filter (where vote = -1)::int as downvotes
           from stage_votes
          group by stage_id`,
      );
      return result.rows.map((row) => ({
        stage_id: String(row.stage_id),
        score: asNumber(row.score),
        upvotes: asNumber(row.upvotes),
        downvotes: asNumber(row.downvotes),
      }));
    },

    async listVotesForVisitor(visitorId) {
      const result = await pool.query(
        `select stage_id, vote from stage_votes where visitor_id = $1`,
        [visitorId],
      );
      return result.rows.map((row) => ({
        stage_id: String(row.stage_id),
        vote: asNumber(row.vote) === -1 ? -1 : 1,
      }));
    },

    async upsertVote(stageId, visitorId, vote) {
      await pool.query(
        `insert into stage_votes (stage_id, visitor_id, vote)
         values ($1, $2, $3)
         on conflict (stage_id, visitor_id) do update set vote = excluded.vote`,
        [stageId, visitorId, vote],
      );
    },

    async deleteVote(stageId, visitorId) {
      await pool.query(
        `delete from stage_votes where stage_id = $1 and visitor_id = $2`,
        [stageId, visitorId],
      );
    },

    async listComments(stageId, limit, visitorId) {
      const result = await pool.query(
        `select id, visitor_id, author_name, body, created_at
           from stage_comments
          where stage_id = $1 and hidden_at is null
          order by created_at desc
          limit $2`,
        [stageId, limit],
      );
      return result.rows.map((row) => mapComment(row, visitorId));
    },

    async insertComment(row) {
      const result = await pool.query(
        `insert into stage_comments (stage_id, visitor_id, author_name, body)
         values ($1, $2, $3, $4)
         returning id, visitor_id, author_name, body, created_at`,
        [row.stageId, row.visitorId, row.authorName, row.body],
      );
      return mapComment(result.rows[0], row.visitorId);
    },

    async hideComment(id, reason) {
      const result = await pool.query(
        `update stage_comments
            set hidden_at = timezone('utc', now()), hidden_reason = $2
          where id = $1
          returning id, visitor_id, author_name, body, created_at`,
        [id, reason],
      );
      if (!result.rows[0]) throw new Error("not_found");
      return mapComment(result.rows[0]);
    },

    async deleteOwnComment(id, visitorId) {
      const result = await pool.query(
        `delete from stage_comments where id = $1 and visitor_id = $2`,
        [id, visitorId],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async revokeSession(subject, jti) {
      await pool.query(
        `insert into session_revocations (subject, jti) values ($1, $2)
         on conflict (subject, jti) do nothing`,
        [subject, jti ?? ""],
      );
    },

    async isRevoked(subject, jti) {
      const result = await pool.query(
        `select 1 from session_revocations
          where subject = $1 and jti in ($2, '')
          limit 1`,
        [subject, jti ?? ""],
      );
      return result.rows.length > 0;
    },

    async insertReport(row) {
      const result = await pool.query(
        `insert into content_reports (subject, stage_id, reason, detail)
         values ($1, $2, $3, $4)
         returning id, subject, stage_id, reason, detail, created_at`,
        [row.subject, row.stageId, row.reason, row.detail],
      );
      const saved = result.rows[0];
      return {
        id: String(saved.id),
        subject: String(saved.subject),
        stage_id: String(saved.stage_id),
        reason: String(saved.reason),
        detail: String(saved.detail),
        created_at: asIso(saved.created_at),
      };
    },

    async insertAudit(row) {
      const result = await pool.query(
        `insert into audit_events (actor, action, target, detail, request_id)
         values ($1, $2, $3, $4::jsonb, $5)
         returning id, actor, action, target, detail, request_id, created_at`,
        [row.actor, row.action, row.target, JSON.stringify(row.detail ?? {}), row.requestId ?? null],
      );
      const saved = result.rows[0];
      return {
        id: String(saved.id),
        actor: String(saved.actor),
        action: String(saved.action),
        target: String(saved.target),
        detail: (saved.detail || {}) as Record<string, unknown>,
        request_id: saved.request_id ? String(saved.request_id) : null,
        created_at: asIso(saved.created_at),
      };
    },

    async insertAnalytics(row) {
      await pool.query(
        `insert into analytics_events (subject, name, stage_id, challenge_id, technical)
         values ($1, $2, $3, $4, $5)`,
        [row.subject, row.name, row.stageId, row.challengeId, row.technical],
      );
    },

    async summarizeCreatorStats(stageIds) {
      if (!stageIds.length) return emptyCreatorStats();
      const result = await pool.query(
        `select
           count(*) filter (where name = 'stage_ready')::int as sample_size,
           count(*) filter (where name in ('run_start', 'stage_ready'))::int as play_starts,
           count(*) filter (where name = 'stage_clear')::int as clears,
           count(*) filter (where name = 'stage_invalid' or technical)::int as tech_errors
         from analytics_events
         where stage_id = any($1::text[])`,
        [stageIds],
      );
      const row = result.rows[0] || {};
      return {
        sample_size: asNumber(row.sample_size),
        play_starts: asNumber(row.play_starts),
        clears: asNumber(row.clears),
        tech_errors: asNumber(row.tech_errors),
      };
    },

    async createChallengeRun(row) {
      const id = `runv2-${randomUUID()}`;
      try {
        const result = await pool.query(
          `insert into challenge_runs
             (id, subject, challenge_id, stage_ids, status, clear_count, duration_sec, finished_all_clear, stages, event_count)
           values ($1, $2, $3, $4, 'open', 0, 0, false, '{}', 0)
           returning *`,
          [id, row.subject, row.challengeId, row.stageIds],
        );
        return mapChallengeRun(result.rows[0]);
      } catch (error) {
        if (isPgUniqueViolation(error)) throw new DuplicateError("이미 진행 중인 런이 있습니다.");
        throw error;
      }
    },

    async getChallengeRun(id) {
      const result = await pool.query(`select * from challenge_runs where id = $1`, [id]);
      return result.rows[0] ? mapChallengeRun(result.rows[0]) : null;
    },

    async appendChallengeRunEvent(runId, subject, event) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        const current = await client.query(`select * from challenge_runs where id = $1 for update`, [runId]);
        if (!current.rows[0]) throw new Error("not_found");
        const run = mapChallengeRun(current.rows[0]);
        if (run.subject !== subject) throw new Error("forbidden");
        const existing = await client.query(
          `select payload_hash from challenge_run_events where run_id = $1 and event_id = $2`,
          [runId, event.eventId],
        );
        if (existing.rows[0]) {
          if (String(existing.rows[0].payload_hash) !== event.payloadHash) throw new DuplicateError();
          await client.query("commit");
          return run;
        }
        const next = applyRunEvent(run, event);
        await client.query(
          `insert into challenge_run_events (run_id, event_id, seq, name, payload, payload_hash)
           values ($1, $2, $3, $4, $5::jsonb, $6)`,
          [runId, event.eventId, event.seq, event.name, JSON.stringify(event.payload), event.payloadHash],
        );
        const updated = await client.query(
          `update challenge_runs
              set status = $2, clear_count = $3, duration_sec = $4, finished_all_clear = $5, stages = $6, event_count = $7
            where id = $1
            returning *`,
          [runId, next.status, next.clear_count, next.duration_sec, next.finished_all_clear, next.stages, next.event_count],
        );
        await client.query("commit");
        return mapChallengeRun(updated.rows[0]);
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },

    async finalizeChallengeRun(runId, subject) {
      const current = await pool.query(`select * from challenge_runs where id = $1`, [runId]);
      if (!current.rows[0]) throw new Error("not_found");
      const run = mapChallengeRun(current.rows[0]);
      if (run.subject !== subject) throw new Error("forbidden");
      const next = finalizeRun(run, new Date().toISOString());
      const updated = await pool.query(
        `update challenge_runs set status = $2, finalized_at = $3 where id = $1 returning *`,
        [runId, next.status, next.finalized_at],
      );
      return mapChallengeRun(updated.rows[0]);
    },

    async listFinalizedChallengeRuns(challengeId) {
      const result = await pool.query(
        `select * from challenge_runs where challenge_id = $1 and finalized_at is not null and status in ('cleared', 'failed')`,
        [challengeId],
      );
      return result.rows.map(mapChallengeRun);
    },
  };
}

export function createMemoryStore(): RelayStore {
  const leaderboard: LeaderboardRow[] = [];
  const rankings = new Map<string, StageRankingRow>();
  const votes = new Map<string, { stage_id: string; visitor_id: string; vote: 1 | -1 }>();
  const comments: Array<CommentRow & { stage_id: string; visitor_id: string; hidden?: boolean }> = [];
  const revocations = new Set<string>();
  const reports: ReportRow[] = [];
  const audits: AuditRow[] = [];
  const analytics: AnalyticsRow[] = [];
  const runs = new Map<string, ChallengeRun>();
  const runEvents = new Map<string, Map<string, RunEventInput>>();
  let commentSeq = 1;
  let reportSeq = 1;
  let auditSeq = 1;

  function rankingKey(stageId: string, visitorId: string) {
    return `${stageId}\0${visitorId}`;
  }

  function voteKey(stageId: string, visitorId: string) {
    return `${stageId}\0${visitorId}`;
  }

  return {
    async ping() {},

    async listLeaderboard(limit) {
      return [...leaderboard]
        .sort((left, right) => {
          if (right.clear_count !== left.clear_count) return right.clear_count - left.clear_count;
          if (Number(right.finished_all_clear) !== Number(left.finished_all_clear)) {
            return Number(right.finished_all_clear) - Number(left.finished_all_clear);
          }
          if (left.duration_sec !== right.duration_sec) return left.duration_sec - right.duration_sec;
          return left.created_at.localeCompare(right.created_at);
        })
        .slice(0, limit);
    },

    async insertLeaderboard(row) {
      if (leaderboard.some((entry) => entry.run_id === row.run_id)) {
        throw new DuplicateError();
      }
      const saved: LeaderboardRow = {
        ...row,
        created_at: row.created_at ?? new Date().toISOString(),
      };
      leaderboard.push(saved);
      return saved;
    },

    async listStageRankings(stageId, limit) {
      return [...rankings.values()]
        .filter((row) => row.stage_id === stageId)
        .sort((left, right) => {
          if (left.duration_sec !== right.duration_sec) return left.duration_sec - right.duration_sec;
          return left.updated_at.localeCompare(right.updated_at);
        })
        .slice(0, limit);
    },

    async upsertStageRanking(row) {
      const key = rankingKey(row.stage_id, row.visitor_id);
      const existing = rankings.get(key);
      if (!existing || row.duration_sec < existing.duration_sec) {
        const saved: StageRankingRow = {
          ...row,
          updated_at: new Date().toISOString(),
        };
        rankings.set(key, saved);
        return saved;
      }
      return existing;
    },

    async listVoteScores() {
      const byStage = new Map<string, VoteScoreRow>();
      for (const vote of votes.values()) {
        const current = byStage.get(vote.stage_id) ?? {
          stage_id: vote.stage_id,
          score: 0,
          upvotes: 0,
          downvotes: 0,
        };
        current.score += vote.vote;
        if (vote.vote === 1) current.upvotes += 1;
        else current.downvotes += 1;
        byStage.set(vote.stage_id, current);
      }
      return [...byStage.values()];
    },

    async listVotesForVisitor(visitorId) {
      return [...votes.values()]
        .filter((row) => row.visitor_id === visitorId)
        .map((row) => ({ stage_id: row.stage_id, vote: row.vote }));
    },

    async upsertVote(stageId, visitorId, vote) {
      votes.set(voteKey(stageId, visitorId), { stage_id: stageId, visitor_id: visitorId, vote });
    },

    async deleteVote(stageId, visitorId) {
      votes.delete(voteKey(stageId, visitorId));
    },

    async listComments(stageId, limit, visitorId) {
      return comments
        .filter((row) => row.stage_id === stageId && !row.hidden)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, limit)
        .map(({ id, author_name, body, created_at, visitor_id }) => ({
          id,
          author_name,
          body,
          created_at,
          mine: visitorId ? visitor_id === visitorId : undefined,
        }));
    },

    async insertComment(row) {
      const saved = {
        id: String(commentSeq++),
        stage_id: row.stageId,
        visitor_id: row.visitorId,
        author_name: row.authorName,
        body: row.body,
        created_at: new Date().toISOString(),
      };
      comments.push(saved);
      return { id: saved.id, author_name: saved.author_name, body: saved.body, created_at: saved.created_at, mine: true };
    },

    async hideComment(id, _reason) {
      const found = comments.find((row) => row.id === id);
      if (!found) throw new Error("not_found");
      found.hidden = true;
      return { id: found.id, author_name: found.author_name, body: found.body, created_at: found.created_at };
    },

    async deleteOwnComment(id, visitorId) {
      const index = comments.findIndex((row) => row.id === id && row.visitor_id === visitorId);
      if (index === -1) return false;
      comments.splice(index, 1);
      return true;
    },

    async revokeSession(subject, jti) {
      revocations.add(`${subject}\0${jti ?? ""}`);
    },

    async isRevoked(subject, jti) {
      return revocations.has(`${subject}\0${jti ?? ""}`) || revocations.has(`${subject}\0`);
    },

    async insertReport(row) {
      const saved: ReportRow = {
        id: String(reportSeq++),
        subject: row.subject,
        stage_id: row.stageId,
        reason: row.reason,
        detail: row.detail,
        created_at: new Date().toISOString(),
      };
      reports.push(saved);
      return saved;
    },

    async insertAudit(row) {
      const saved: AuditRow = {
        id: String(auditSeq++),
        actor: row.actor,
        action: row.action,
        target: row.target,
        detail: row.detail ?? {},
        request_id: row.requestId ?? null,
        created_at: new Date().toISOString(),
      };
      audits.push(saved);
      return saved;
    },

    async insertAnalytics(row) {
      analytics.push({
        name: row.name,
        subject: row.subject,
        stage_id: row.stageId,
        challenge_id: row.challengeId,
        technical: row.technical,
        created_at: new Date().toISOString(),
      });
    },

    async summarizeCreatorStats(stageIds) {
      return summarizeAnalyticsRows(analytics, stageIds);
    },

    async createChallengeRun(row) {
      const open = [...runs.values()].find(
        (entry) => entry.subject === row.subject && entry.challenge_id === row.challengeId && !entry.finalized_at,
      );
      if (open) throw new DuplicateError("이미 진행 중인 런이 있습니다.");
      const saved: ChallengeRun = {
        id: `runv2-${randomUUID()}`,
        subject: row.subject,
        challenge_id: row.challengeId,
        stage_ids: row.stageIds,
        status: "open",
        clear_count: 0,
        duration_sec: 0,
        finished_all_clear: false,
        stages: [],
        event_count: 0,
        created_at: new Date().toISOString(),
        finalized_at: null,
      };
      runs.set(saved.id, saved);
      runEvents.set(saved.id, new Map());
      return { ...saved, stages: [...saved.stages], stage_ids: [...saved.stage_ids] };
    },

    async getChallengeRun(id) {
      const run = runs.get(id);
      return run ? { ...run, stages: [...run.stages], stage_ids: [...run.stage_ids] } : null;
    },

    async appendChallengeRunEvent(runId, subject, event) {
      const run = runs.get(runId);
      if (!run) throw new Error("not_found");
      if (run.subject !== subject) throw new Error("forbidden");
      const events = runEvents.get(runId) ?? new Map();
      const existing = events.get(event.eventId);
      if (existing) {
        if (existing.payloadHash !== event.payloadHash) throw new DuplicateError();
        return { ...run, stages: [...run.stages], stage_ids: [...run.stage_ids] };
      }
      const next = applyRunEvent(run, event);
      events.set(event.eventId, event);
      runEvents.set(runId, events);
      runs.set(runId, next);
      return { ...next, stages: [...next.stages], stage_ids: [...next.stage_ids] };
    },

    async finalizeChallengeRun(runId, subject) {
      const run = runs.get(runId);
      if (!run) throw new Error("not_found");
      if (run.subject !== subject) throw new Error("forbidden");
      const next = finalizeRun(run, new Date().toISOString());
      runs.set(runId, next);
      return { ...next, stages: [...next.stages], stage_ids: [...next.stage_ids] };
    },

    async listFinalizedChallengeRuns(challengeId) {
      return [...runs.values()]
        .filter((row) => row.challenge_id === challengeId && row.finalized_at && (row.status === "cleared" || row.status === "failed"))
        .map((row) => ({ ...row, stages: [...row.stages], stage_ids: [...row.stage_ids] }));
    },
  };
}

function mapLeaderboard(row: Record<string, unknown>): LeaderboardRow {
  return {
    run_id: String(row.run_id),
    player_name: String(row.player_name),
    clear_count: asNumber(row.clear_count),
    duration_sec: asNumber(row.duration_sec),
    finished_all_clear: Boolean(row.finished_all_clear),
    stages: Array.isArray(row.stages) ? row.stages.map(String) : [],
    created_at: asIso(row.created_at),
  };
}

function mapStageRanking(row: Record<string, unknown>): StageRankingRow {
  return {
    stage_id: String(row.stage_id),
    visitor_id: String(row.visitor_id),
    player_name: String(row.player_name),
    duration_sec: asNumber(row.duration_sec),
    updated_at: asIso(row.updated_at),
  };
}

export { payloadHash };
