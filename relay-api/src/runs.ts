export type RunStatus = "open" | "cleared" | "failed" | "invalid" | "aborted";

export interface ChallengeRun {
  id: string;
  subject: string;
  challenge_id: string;
  stage_ids: string[];
  status: RunStatus;
  clear_count: number;
  duration_sec: number;
  finished_all_clear: boolean;
  stages: string[];
  event_count: number;
  created_at: string;
  finalized_at: string | null;
}

export interface RunEventInput {
  eventId: string;
  seq: number;
  name: string;
  payload: Record<string, unknown>;
  payloadHash: string;
}

const EVENT_NAMES = new Set(["stage_ready", "stage_clear", "stage_fail", "stage_invalid", "run_abort"]);

export function assertEventName(name: string) {
  if (!EVENT_NAMES.has(name)) {
    throw new Error("invalid_event");
  }
}

export function applyRunEvent(run: ChallengeRun, event: RunEventInput): ChallengeRun {
  if (run.finalized_at) return run;
  if (run.status !== "open") return run;
  if (event.seq !== run.event_count + 1) {
    throw new Error("event_seq");
  }
  const next: ChallengeRun = {
    ...run,
    event_count: run.event_count + 1,
    duration_sec: Number((run.duration_sec + readDuration(event.payload)).toFixed(1)),
  };
  if (event.name === "stage_clear") {
    const stageId = String(event.payload.stage_id || "");
    const expected = run.stage_ids[run.clear_count];
    if (!stageId || stageId !== expected) {
      throw new Error("event_stage");
    }
    next.clear_count = run.clear_count + 1;
    next.stages = run.stages.concat([stageId]);
    if (next.clear_count === run.stage_ids.length) {
      next.status = "cleared";
      next.finished_all_clear = true;
    }
    return next;
  }
  if (event.name === "stage_fail") {
    next.status = "failed";
    next.finished_all_clear = false;
    return next;
  }
  if (event.name === "stage_invalid") {
    next.status = "invalid";
    next.finished_all_clear = false;
    return next;
  }
  if (event.name === "run_abort") {
    next.status = "aborted";
    return next;
  }
  return next;
}

export function finalizeRun(run: ChallengeRun, nowIso: string): ChallengeRun {
  if (run.finalized_at) return run;
  if (run.status === "open") {
    throw new Error("run_open");
  }
  return { ...run, finalized_at: nowIso };
}

function readDuration(payload: Record<string, unknown>): number {
  const value = payload.duration_sec;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Number(value.toFixed(1));
}
