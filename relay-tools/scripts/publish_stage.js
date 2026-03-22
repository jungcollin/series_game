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

function runDetailed(command, args, cwd) {
  try {
    return {
      ok: true,
      stdout: run(command, args, cwd),
      stderr: "",
    };
  } catch (error) {
    return {
      ok: false,
      stdout: String(error.stdout || "").trim(),
      stderr: String(error.stderr || "").trim(),
      error: error.message,
    };
  }
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

function parsePrNumber(prUrl) {
  const match = String(prUrl || "").match(/\/pull\/(\d+)/);
  return match ? Number(match[1]) : null;
}

function verifyAutoMerge(repoRoot, repositoryFullName, prRef) {
  const viewResult = runDetailed(
    "gh",
    ["pr", "view", String(prRef), "--repo", repositoryFullName, "--json", "number,url,state,autoMergeRequest"],
    repoRoot
  );

  if (!viewResult.ok) {
    return {
      verified: false,
      enabled: false,
      merged: false,
      message: viewResult.stderr || viewResult.error || "Failed to verify auto-merge state.",
      details: null,
    };
  }

  const details = JSON.parse(viewResult.stdout);
  return {
    verified: true,
    enabled: Boolean(details.autoMergeRequest),
    merged: details.state === "MERGED",
    message: details.autoMergeRequest
      ? "Auto-merge request is set."
      : details.state === "MERGED"
        ? "PR merged immediately after enabling auto-merge."
        : "Auto-merge request not present after merge command.",
    details,
  };
}

function enableAutoMerge(repoRoot, repositoryFullName, prRef) {
  const mergeResult = runDetailed(
    "gh",
    ["pr", "merge", String(prRef), "--repo", repositoryFullName, "--auto", "--squash"],
    repoRoot
  );

  if (!mergeResult.ok) {
    return {
      requested: true,
      enabled: false,
      verified: false,
      merged: false,
      message: mergeResult.stderr || mergeResult.error || "Failed to enable auto-merge.",
      details: null,
    };
  }

  const verification = verifyAutoMerge(repoRoot, repositoryFullName, prRef);
  return {
    requested: true,
    enabled: verification.enabled || verification.merged,
    verified: verification.verified,
    merged: verification.merged,
    message: verification.message || mergeResult.stdout || "Auto-merge command succeeded.",
    details: verification.details,
    commandOutput: mergeResult.stdout,
  };
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

  let branch = "";
  let committed = false;
  let pushed = false;
  let prUrl = "";
  let isFork = false;
  let prAction = "not_requested";
  let existingPr = null;
  let previousPr = null;
  let autoMerge = {
    requested: false,
    enabled: false,
    verified: false,
    merged: false,
    message: "",
    details: null,
  };

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

    if (args["auto-merge"]) {
      const prRef = existingPr?.number || parsePrNumber(prUrl);
      if (!prRef) {
        throw new Error("Auto-merge requested but PR reference could not be determined.");
      }
      autoMerge = enableAutoMerge(repoRoot, targetRepo, prRef);
      if (!autoMerge.enabled) {
        throw new Error(`Auto-merge requested but was not enabled. ${autoMerge.message}`);
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
        autoMerge,
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
