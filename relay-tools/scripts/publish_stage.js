#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { findStageMeta, stagePathForDir, syncRegistry } = require("./stage_metadata");

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

function parseRepoFullName(remoteUrl) {
  const match = String(remoteUrl || "").match(/github\.com[:/]([^/]+\/[^/.]+)/);
  return match ? match[1].replace(/\.git$/, "") : null;
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

function stageAndVerify(repoRoot, stageDir) {
  const stageDirPath = `community-stages/${stageDir}`;
  const registryPath = "community-stages/registry.js";
  run("git", ["add", stageDirPath, registryPath], repoRoot);
  const staged = run("git", ["diff", "--cached", "--name-only"], repoRoot);
  if (!staged.trim()) {
    throw new Error(`No changes staged for stage directory: ${stageDirPath}`);
  }
  return staged.trim().split("\n");
}

function ensureBranch(repoRoot, stageSlug) {
  const currentBranch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
  if (currentBranch && currentBranch !== "HEAD" && currentBranch !== "main") {
    return currentBranch;
  }
  const branchName = `stage/${stageSlug}`;
  try {
    run("git", ["checkout", "-b", branchName], repoRoot);
  } catch (_err) {
    run("git", ["checkout", branchName], repoRoot);
  }
  return branchName;
}

function detectUpstreamRepo(repoRoot) {
  // Check if 'upstream' remote exists (fork workflow)
  try {
    const upstreamUrl = run("git", ["remote", "get-url", "upstream"], repoRoot);
    return parseRepoFullName(upstreamUrl);
  } catch (_err) {
    // No upstream remote = working on the original repo directly
  }
  return null;
}

function getOriginRepo(repoRoot) {
  try {
    return parseRepoFullName(run("git", ["remote", "get-url", "origin"], repoRoot));
  } catch (_err) {
    return null;
  }
}

function getOriginOwner(repoRoot) {
  try {
    const originUrl = run("git", ["remote", "get-url", "origin"], repoRoot);
    const match = originUrl.match(/github\.com[:/]([^/]+)\//);
    if (match) {
      return match[1];
    }
  } catch (_err) {
    // ignore
  }
  return null;
}

function findExistingPr(repoRoot, repositoryFullName, branch, headOwner) {
  const raw = run(
    "gh",
    [
      "pr",
      "list",
      "--repo",
      repositoryFullName,
      "--state",
      "all",
      "--limit",
      "100",
      "--json",
      "number,url,state,headRefName,baseRefName,headRepositoryOwner",
    ],
    repoRoot
  );

  const prs = JSON.parse(raw).filter((pr) => {
    const ownerLogin = pr.headRepositoryOwner?.login || null;
    return (
      pr.baseRefName === "main" &&
      pr.headRefName === branch &&
      (!headOwner || ownerLogin === headOwner)
    );
  });

  prs.sort((left, right) => right.number - left.number);

  const openPr = prs.find((pr) => pr.state === "OPEN") || null;
  const latestClosedPr = prs.find((pr) => pr.state !== "OPEN") || null;

  return {
    openPr,
    latestClosedPr,
  };
}

function enableAutoMerge(repoRoot, prUrl) {
  if (!prUrl) {
    throw new Error("Cannot enable auto-merge without a PR URL.");
  }
  run("gh", ["pr", "merge", "--auto", "--squash", prUrl], repoRoot);
}

function readAutoMergeState(repoRoot, repositoryFullName, prNumber) {
  if (!repositoryFullName || !prNumber) {
    return null;
  }
  const raw = run(
    "gh",
    [
      "pr",
      "view",
      String(prNumber),
      "--repo",
      repositoryFullName,
      "--json",
      "number,mergeStateStatus,autoMergeRequest",
    ],
    repoRoot
  );
  return JSON.parse(raw);
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");
  const stageCandidate = resolveStageSlug(args, repoRoot);
  const stageMeta = findStageMeta(repoRoot, stageCandidate);
  const baseUrl = args["base-url"] || "http://127.0.0.1:4173";
  const stagePath = stagePathForDir(repoRoot, stageMeta?.dir || stageCandidate);

  if (!stageMeta) {
    throw new Error(`Stage metadata not found for: ${stageCandidate}`);
  }

  if (!fs.existsSync(stagePath)) {
    throw new Error(`Stage file not found: ${path.relative(repoRoot, stagePath)}`);
  }

  syncRegistry(repoRoot);

  // Run check
  const checkOutput = run(
    "node",
    ["relay-tools/scripts/check_stage.js", "--stage", stageMeta.id, "--base-url", baseUrl],
    repoRoot
  );
  const gitStatus = run("git", ["status", "--short"], repoRoot);
  const commitMessage = `feat: add relay stage ${stageMeta.id}`;
  const prTitle = commitMessage;
  const prBody = [
    "## Summary",
    `- Add relay stage \`${stageMeta.id}\``,
    `- Genre: ${stageMeta.genre}`,
    `- Description: ${stageMeta.description}`,
    "",
    "## Controls",
    `- ${stageMeta.controls}`,
    "",
    "## Clear Condition",
    `- ${stageMeta.clearCondition}`,
    "",
    "## Fail Condition",
    `- ${stageMeta.failCondition}`,
    "",
    "## Test",
    `- \`node relay-tools/scripts/check_stage.js --stage ${stageMeta.id}\``,
  ].join("\n");

  // --pr implies --commit and --push, then creates a GitHub PR
  const doPr = Boolean(args.pr);
  const doCommit = doPr || Boolean(args.commit);
  const doPush = doPr || Boolean(args.push);
  const doAutoMerge = Boolean(args["auto-merge"]);

  let branch = "";
  let committed = false;
  let pushed = false;
  let prUrl = "";
  let isFork = false;
  let prAction = "not_requested";
  let existingPr = null;
  let previousPr = null;
  let autoMergeEnabled = false;
  let autoMergeState = null;

  // Detect fork vs direct workflow
  const upstreamRepo = detectUpstreamRepo(repoRoot);
  const originRepo = getOriginRepo(repoRoot);
  const originOwner = getOriginOwner(repoRoot);
  isFork = Boolean(upstreamRepo);

  if (doCommit) {
    if (doPr) {
      branch = ensureBranch(repoRoot, stageMeta.dir);
    }

    stageAndVerify(repoRoot, stageMeta.dir);
    run("git", ["commit", "-m", commitMessage], repoRoot);
    committed = true;
  }

  if (doPush) {
    if (!branch) {
      branch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"], repoRoot);
    }
    if (!branch || branch === "HEAD") {
      throw new Error("Cannot push from detached HEAD.");
    }
    // Always push to origin (which is the fork for forked repos)
    run("git", ["push", "-u", "origin", branch], repoRoot);
    pushed = true;
  }

  if (doPr) {
    const targetRepo = upstreamRepo || originRepo;
    if (!targetRepo) {
      throw new Error("Could not determine the GitHub repository for PR creation.");
    }

    const prLookup = findExistingPr(repoRoot, targetRepo, branch, originOwner);
    existingPr = prLookup.openPr;
    previousPr = prLookup.latestClosedPr;

    if (existingPr) {
      run(
        "gh",
        [
          "pr",
          "edit",
          String(existingPr.number),
          "--repo",
          targetRepo,
          "--title",
          prTitle,
          "--body",
          prBody,
        ],
        repoRoot
      );
      prUrl = existingPr.url;
      prAction = "updated_existing";
    } else {
      const ghArgs = ["pr", "create", "--title", prTitle, "--body", prBody, "--base", "main"];
      ghArgs.push("--repo", targetRepo);
      if (isFork) {
        ghArgs.push("--head", `${originOwner}:${branch}`);
      }
      const ghOutput = run("gh", ghArgs, repoRoot);
      prUrl = ghOutput.trim();
      prAction = previousPr ? "created_after_closed_pr" : "created_new";
    }

    if (doAutoMerge) {
      enableAutoMerge(repoRoot, prUrl);
      const prNumber =
        existingPr?.number ||
        (prUrl.match(/\/pull\/(\d+)/)?.[1] ? Number(prUrl.match(/\/pull\/(\d+)/)?.[1]) : null);
      autoMergeState = readAutoMergeState(repoRoot, targetRepo, prNumber);
      autoMergeEnabled = Boolean(autoMergeState?.autoMergeRequest);
      if (!autoMergeEnabled) {
        throw new Error(`Auto-merge was requested but is not enabled for PR: ${prUrl}`);
      }
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        stage: stageMeta.id,
        stageDir: stageMeta.dir,
        check: JSON.parse(checkOutput),
        changedFiles: gitStatus ? gitStatus.split("\n") : [],
        commitMessage,
        prTitle,
        prBody,
        committed,
        pushed,
        branch,
        isFork,
        originRepo: originRepo || null,
        upstreamRepo: upstreamRepo || null,
        prAction,
        existingPr,
        previousPr,
        prUrl,
        autoMergeEnabled,
        autoMergeState,
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
