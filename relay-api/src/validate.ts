export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class DuplicateError extends Error {
  constructor(message = "이미 저장된 기록입니다.") {
    super(message);
    this.name = "DuplicateError";
  }
}

const STAGE_ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const RUN_ID_RE = /^[a-z0-9][a-z0-9._:-]{7,79}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ValidationError("요청 본문이 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new ValidationError(`${label}이(가) 필요합니다.`);
  }
  return value;
}

export function normalizeName(value: unknown, label: string, min: number, max: number): string {
  const name = readString(value, label).replace(/\s+/g, " ").trim();
  if (name.length < min || name.length > max) {
    throw new ValidationError(`${label}은(는) ${min}~${max}자로 입력해 주세요.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new ValidationError(`${label}에 사용할 수 없는 문자가 있습니다.`);
  }
  return name;
}

export function normalizeStageId(value: unknown): string {
  const stageId = readString(value, "스테이지").trim();
  if (!STAGE_ID_RE.test(stageId)) {
    throw new ValidationError("스테이지 값이 올바르지 않습니다.");
  }
  return stageId;
}

export function normalizeVisitorId(value: unknown): string {
  const visitorId = readString(value, "방문 키").trim();
  if (visitorId.length < 8 || visitorId.length > 80) {
    throw new ValidationError("방문 키가 올바르지 않습니다.");
  }
  if (!/^[a-z0-9][a-z0-9._:-]{7,79}$/i.test(visitorId)) {
    throw new ValidationError("방문 키가 올바르지 않습니다.");
  }
  return visitorId;
}

export function normalizeRunId(value: unknown): string {
  const runId = readString(value, "런 ID").trim();
  if (!RUN_ID_RE.test(runId)) {
    throw new ValidationError("런 ID가 올바르지 않습니다.");
  }
  return runId;
}

export function normalizeDuration(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new ValidationError("기록 시간이 올바르지 않습니다.");
  }
  return Number(value.toFixed(1));
}

export function normalizeClearCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 999) {
    throw new ValidationError("클리어 수가 올바르지 않습니다.");
  }
  return value;
}

export function normalizeStages(value: unknown): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError("스테이지 목록이 올바르지 않습니다.");
  }
  if (value.length > 32) {
    throw new ValidationError("스테이지 목록이 너무 깁니다.");
  }
  const stages = value.map((item) => normalizeStageId(item));
  const unique = new Set(stages.map((stageId) => stageId.toLowerCase()));
  if (unique.size !== stages.length) {
    throw new ValidationError("스테이지 목록이 올바르지 않습니다.");
  }
  return stages;
}

export function normalizeVote(value: unknown): 1 | -1 {
  if (value !== 1 && value !== -1) {
    throw new ValidationError("투표 값이 올바르지 않습니다.");
  }
  return value;
}

export function normalizeCommentBody(value: unknown): string {
  const body = readString(value, "댓글").trim();
  if (body.length < 1 || body.length > 500) {
    throw new ValidationError("댓글은 1~500자로 입력해 주세요.");
  }
  return body;
}

export function parseLimit(value: string | undefined, fallback: number, max: number): number {
  if (value == null || value === "") return fallback;
  if (!/^[1-9]\d{0,8}$/.test(value)) {
    throw new ValidationError("limit 값이 올바르지 않습니다.");
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new ValidationError("limit 값이 올바르지 않습니다.");
  }
  return Math.min(parsed, max);
}

/**
 * Strict body parser for ranking writes. Current POST routes return 410 without
 * calling this; keep the contract so restored writes cannot coerce "false"/NaN.
 */
export function readLeaderboardInput(value: unknown) {
  const body = asRecord(value);
  const clearCount = normalizeClearCount(body.clear_count);
  const stages = normalizeStages(body.stages);
  if (clearCount !== stages.length) {
    throw new ValidationError("클리어 수와 스테이지 목록이 일치하지 않습니다.");
  }
  if (body.finished_all_clear !== undefined && typeof body.finished_all_clear !== "boolean") {
    throw new ValidationError("완주 여부가 올바르지 않습니다.");
  }
  const finishedAllClear = body.finished_all_clear === true;
  if (finishedAllClear && stages.length === 0) {
    throw new ValidationError("완주 기록에는 스테이지 목록이 필요합니다.");
  }
  return {
    runId: normalizeRunId(body.run_id),
    playerName: normalizeName(body.player_name, "닉네임", 2, 24),
    clearCount,
    durationSec: normalizeDuration(body.duration_sec, 0, 36000),
    finishedAllClear,
    stages,
  };
}

export function readVoteInput(value: unknown, fallbackStageId?: string) {
  const body = asRecord(value);
  return {
    stageId: normalizeStageId(body.stage_id ?? fallbackStageId),
    vote: normalizeVote(body.vote),
  };
}

export function readVoteTarget(value: unknown, query: { stage_id?: string }) {
  const body = value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
  return {
    stageId: normalizeStageId(body.stage_id ?? query.stage_id),
  };
}

export function readCommentInput(stageId: string, value: unknown) {
  const body = asRecord(value);
  return {
    stageId: normalizeStageId(stageId),
    authorName: normalizeName(body.author_name, "닉네임", 1, 24),
    body: normalizeCommentBody(body.body),
  };
}
