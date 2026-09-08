import type { Pool } from "pg";
import { DuplicateError } from "./validate.js";

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
  author_name: string;
  body: string;
  created_at: string;
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
  listComments(stageId: string, limit: number): Promise<CommentRow[]>;
  insertComment(row: { stageId: string; visitorId: string; authorName: string; body: string }): Promise<CommentRow>;
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

function isPgUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code: string }).code === "23505");
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

    async listComments(stageId, limit) {
      const result = await pool.query(
        `select author_name, body, created_at
           from stage_comments
          where stage_id = $1
          order by created_at desc
          limit $2`,
        [stageId, limit],
      );
      return result.rows.map((row) => ({
        author_name: String(row.author_name),
        body: String(row.body),
        created_at: asIso(row.created_at),
      }));
    },

    async insertComment(row) {
      const result = await pool.query(
        `insert into stage_comments (stage_id, visitor_id, author_name, body)
         values ($1, $2, $3, $4)
         returning author_name, body, created_at`,
        [row.stageId, row.visitorId, row.authorName, row.body],
      );
      return {
        author_name: String(result.rows[0].author_name),
        body: String(result.rows[0].body),
        created_at: asIso(result.rows[0].created_at),
      };
    },
  };
}

export function createMemoryStore(): RelayStore {
  const leaderboard: LeaderboardRow[] = [];
  const rankings = new Map<string, StageRankingRow>();
  const votes = new Map<string, { stage_id: string; visitor_id: string; vote: 1 | -1 }>();
  const comments: Array<CommentRow & { stage_id: string }> = [];

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

    async listComments(stageId, limit) {
      return comments
        .filter((row) => row.stage_id === stageId)
        .sort((left, right) => right.created_at.localeCompare(left.created_at))
        .slice(0, limit)
        .map(({ author_name, body, created_at }) => ({ author_name, body, created_at }));
    },

    async insertComment(row) {
      const saved: CommentRow & { stage_id: string } = {
        stage_id: row.stageId,
        author_name: row.authorName,
        body: row.body,
        created_at: new Date().toISOString(),
      };
      comments.push(saved);
      return { author_name: saved.author_name, body: saved.body, created_at: saved.created_at };
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
