#!/usr/bin/env node

const path = require("path");
const { execFileSync } = require("child_process");
const { loadAllStageMetas } = require("./stage_metadata");

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

function listChangedFiles(repoRoot, baseRef, headRef) {
  const diffRange = `${baseRef}...${headRef}`;
  const output = run("git", ["diff", "--name-only", diffRange], repoRoot);
  return output ? output.split("\n").filter(Boolean) : [];
}

function extractStageIds(changedFiles, registryEntries) {
  const ids = new Set();
  for (const file of changedFiles) {
    for (const entry of registryEntries) {
      if (file.startsWith(`community-stages/${entry.dir}/`)) {
        ids.add(entry.id);
      }
    }
  }
  return [...ids];
}

function collectNonStageFiles(changedFiles, registryEntries, stageIds) {
  const changedStageDirs = new Set(
    registryEntries.filter((entry) => stageIds.includes(entry.id)).map((entry) => entry.dir)
  );
  return changedFiles.filter((file) => {
    if (file === "community-stages/registry.js") {
      return false;
    }
    return ![...changedStageDirs].some((dir) => file.startsWith(`community-stages/${dir}/`));
  });
}

function scanStageRisks(repoRoot, registryEntries, stageIds, changedFiles) {
  const changedStageDirs = new Set(
    registryEntries.filter((entry) => stageIds.includes(entry.id)).map((entry) => entry.dir)
  );
  const scanTargets = changedFiles.filter((file) =>
    [...changedStageDirs].some((dir) => file.startsWith(`community-stages/${dir}/`))
  );
  const patterns = [
    { label: "external-script", regex: /<script[^>]+src=["']https?:\/\//i },
    { label: "network-fetch", regex: /\bfetch\s*\(/ },
    { label: "xhr", regex: /\bXMLHttpRequest\b/ },
    { label: "websocket", regex: /\bWebSocket\b/ },
    { label: "event-source", regex: /\bEventSource\b/ },
    { label: "eval", regex: /\beval\s*\(/ },
    { label: "new-function", regex: /\bnew Function\b/ },
    { label: "document-write", regex: /\bdocument\.write\s*\(/ },
    { label: "window-open", regex: /\bwindow\.open\s*\(/ },
    { label: "post-message", regex: /\.postMessage\s*\(/ },
  ];
  const findings = [];

  for (const file of scanTargets) {
    const absPath = path.join(repoRoot, file);
    if (!fs.existsSync(absPath)) {
      continue;
    }
    const content = fs.readFileSync(absPath, "utf8");
    for (const pattern of patterns) {
      if (pattern.regex.test(content)) {
        findings.push({ file, risk: pattern.label });
      }
    }
  }

  return findings;
}

function runStageChecks(repoRoot, stageSlugs, baseUrl) {
  return stageSlugs.map((slug) => {
    const output = run(
      "node",
      ["relay-tools/scripts/check_stage.js", "--stage", slug, "--base-url", baseUrl],
      repoRoot
    );
    return JSON.parse(output);
  });
}

function buildSummary(report) {
  const lines = [];
  lines.push(`Checked stages: ${report.stageSlugs.join(", ") || "none"}`);
  if (report.nonStageFiles.length) {
    lines.push(`Non-stage files changed: ${report.nonStageFiles.join(", ")}`);
  }
  if (report.risks.length) {
    lines.push(
      `Risk findings: ${report.risks.map((entry) => `${entry.file} (${entry.risk})`).join(", ")}`
    );
  }
  return lines.join("\n");
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");
  const baseRef = args["base-ref"] || "HEAD~1";
  const headRef = args["head-ref"] || "HEAD";
  const baseUrl = args["base-url"] || "http://127.0.0.1:4173";

  const changedFiles = listChangedFiles(repoRoot, baseRef, headRef);
  const registryEntries = loadAllStageMetas(repoRoot);
  const stageSlugs = extractStageIds(changedFiles, registryEntries);
  const nonStageFiles = collectNonStageFiles(changedFiles, registryEntries, stageSlugs);
  const risks = scanStageRisks(repoRoot, registryEntries, stageSlugs, changedFiles);
  const checks = stageSlugs.length ? runStageChecks(repoRoot, stageSlugs, baseUrl) : [];

  const ok = stageSlugs.length > 0 && checks.every((entry) => entry.ok);
  const safeToApprove =
    ok &&
    stageSlugs.length === 1 &&
    nonStageFiles.length === 0 &&
    risks.length === 0;

  const report = {
    ok,
    safeToApprove,
    baseRef,
    headRef,
    changedFiles,
    stageSlugs,
    nonStageFiles,
    risks,
    checks,
  };
  report.summary = buildSummary(report);

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(ok ? 0 : 1);
}

try {
  main();
} catch (error) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        safeToApprove: false,
        error: error.message,
      },
      null,
      2
    )}\n`
  );
  process.exit(1);
}
