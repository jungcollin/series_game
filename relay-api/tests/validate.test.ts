import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ValidationError,
  readLeaderboardInput,
  readVoteInput,
  readCommentInput,
  normalizeVote,
  normalizeDuration,
  normalizeStageId,
  parseLimit,
} from "../src/validate.js";

function reject(fn: () => unknown) {
  assert.throws(fn, ValidationError);
}

const validLeaderboard = {
  run_id: "run-abc12345",
  player_name: "콜린",
  clear_count: 2,
  duration_sec: 12.4,
  finished_all_clear: false,
  stages: ["galaxy-boss", "slither-worm"],
};

test("leaderboard input accepts typed numbers and booleans", () => {
  assert.deepEqual(readLeaderboardInput(validLeaderboard), {
    runId: "run-abc12345",
    playerName: "콜린",
    clearCount: 2,
    durationSec: 12.4,
    finishedAllClear: false,
    stages: ["galaxy-boss", "slither-worm"],
  });
});

test("leaderboard input rejects coerced booleans, numeric strings, and junk values", () => {
  reject(() => readLeaderboardInput({ ...validLeaderboard, finished_all_clear: "false" }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, finished_all_clear: "true" }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, finished_all_clear: 1 }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, finished_all_clear: 0 }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, clear_count: "2" }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, duration_sec: "12.4" }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, duration_sec: Number.NaN }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, duration_sec: Number.POSITIVE_INFINITY }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, duration_sec: Number.NEGATIVE_INFINITY }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, clear_count: null }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, player_name: "" }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, stages: "galaxy-boss" }));
  reject(() => readLeaderboardInput([]));
  reject(() => readLeaderboardInput(null));
});

test("leaderboard input rejects mismatched, duplicate, and empty all-clear combinations", () => {
  reject(() => readLeaderboardInput({ ...validLeaderboard, clear_count: 1 }));
  reject(() => readLeaderboardInput({ ...validLeaderboard, stages: ["galaxy-boss", "galaxy-boss"] }));
  reject(() => readLeaderboardInput({
    ...validLeaderboard,
    finished_all_clear: true,
    clear_count: 0,
    stages: [],
  }));
  reject(() => readLeaderboardInput({
    ...validLeaderboard,
    stages: ["galaxy-boss", "../secret"],
  }));
});

test("vote and duration require actual numbers", () => {
  assert.equal(normalizeVote(1), 1);
  assert.equal(normalizeVote(-1), -1);
  reject(() => normalizeVote("1"));
  reject(() => normalizeVote("-1"));
  reject(() => normalizeVote(true));
  reject(() => normalizeVote(0));
  reject(() => normalizeVote([1]));
  reject(() => normalizeDuration("3.1", 0, 10));
  reject(() => normalizeDuration(Number.NaN, 0, 10));
  reject(() => readVoteInput({ stage_id: "fly-bird", vote: "1" }));
  reject(() => readVoteInput({ stage_id: "not a stage", vote: 1 }));
});

test("comments and stage ids reject empty or invalid values", () => {
  reject(() => readCommentInput("fly-bird", { author_name: "콜린", body: "" }));
  reject(() => readCommentInput("fly-bird", { author_name: "", body: "좋아요" }));
  reject(() => normalizeStageId("../etc/passwd"));
  reject(() => normalizeStageId(""));
});

test("query limit still parses digit strings and rejects other query values", () => {
  assert.equal(parseLimit(undefined, 50, 50), 50);
  assert.equal(parseLimit("", 50, 50), 50);
  assert.equal(parseLimit("10", 50, 50), 10);
  assert.equal(parseLimit("999", 50, 50), 50);
  reject(() => parseLimit("nope", 50, 50));
  reject(() => parseLimit("1.5", 50, 50));
  reject(() => parseLimit("01", 50, 50));
  reject(() => parseLimit("1e2", 50, 50));
});
