#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function parseChangedStageSlugs(gitStatus) {
  const stageSlugs = new Set();
  const lines = String(gitStatus || "").split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    let changedPath = line.slice(3).trim();
    if (!changedPath) {
      continue;
    }
    if (changedPath.includes(" -> ")) {
      changedPath = changedPath.split(" -> ").pop().trim();
    }
    const match = changedPath.match(/^community-stages\/([^/]+)\//);
    if (match && match[1]) {
      stageSlugs.add(match[1]);
    }
  }
  return Array.from(stageSlugs);
}

function resolveStageSlug(args, repoRoot) {
  if (args.stage) {
    return args.stage;
  }
  const gitStatus = run("git", ["status", "--short"], repoRoot);
  const candidates = parseChangedStageSlugs(gitStatus);
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length > 1) {
    throw new Error(
      `Missing --stage. Multiple changed stage candidates found: ${candidates.join(", ")}.`
    );
  }
  throw new Error(
    "Missing --stage and could not infer stage from git changes. Pass --stage <stage-slug>."
  );
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");
  const stageSlug = resolveStageSlug(args, repoRoot);
  const baseUrl = args["base-url"] || "http://series-game.localhost:1355";
  const stageDir = path.join(repoRoot, "community-stages", stageSlug);
  const stagePath = path.join(stageDir, "index.html");
  const registryPath = path.join(repoRoot, "community-stages/registry.js");

  if (!fs.existsSync(stagePath)) {
    throw new Error(`Stage file not found: ${path.relative(repoRoot, stagePath)}`);
  }

  const checkOutput = run("node", ["relay-tools/scripts/check_stage.js", "--stage", stageSlug, "--base-url", baseUrl], repoRoot);
  const gitStatus = run("git", ["status", "--short"], repoRoot);
  const commitMessage = `feat: add relay stage ${stageSlug}`;
  const prTitle = commitMessage;
  const prBody = [
    "## Summary",
    `- Add relay stage \`${stageSlug}\``,
    "",
    "## Controls",
    "- Fill in the stage-specific controls here.",
    "",
    "## Clear Condition",
    "- Fill in the clear condition here.",
    "",
    "## Fail Condition",
    "- Fill in the fail condition here.",
    "",
    "## Test",
    `- node relay-tools/scripts/check_stage.js --stage ${stageSlug}`,
  ].join("\n");

  if (args.commit) {
    run("git", ["add", `community-stages/${stageSlug}`, "community-stages/registry.js"], repoRoot);
    run("git", ["commit", "-m", commitMessage], repoRoot);
  }

  let pushed = false;
  let branch = "";
  if (args.push) {
    branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
    if (!branch || branch === "HEAD") {
      throw new Error("Cannot push from detached HEAD.");
    }
    run("git", ["push", "origin", branch], repoRoot);
    pushed = true;
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        stage: stageSlug,
        check: JSON.parse(checkOutput),
        changedFiles: gitStatus ? gitStatus.split("\n") : [],
        commitMessage,
        prTitle,
        prBody,
        committed: Boolean(args.commit),
        pushed,
        branch,
      },
      null,
      2
    ) + "\n"
  );
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
