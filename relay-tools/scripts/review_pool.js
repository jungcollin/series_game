#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { loadAllStageMetas } = require("./stage_metadata");

const REVIEW_IDS = [
  "galaxy-boss",
  "slither-worm",
  "lightning-dodge",
  "wrong-way-runner",
  "neon-shield",
  "echo-twins",
  "signal-triangulator",
  "orbital-dock",
  "storm-cargo-crane",
  "command-deck",
  "pottery-wheel",
  "memory-match",
  "pipe-rush",
  "rhythm-fishing",
  "wildlife-snap",
  "stone-skipper",
  "bento-box",
  "shadow-rotate",
  "frozen-lake",
  "mochi-pound",
];

function repoRootFrom(filePath) {
  return path.resolve(path.dirname(filePath), "../..");
}

function scanStage(repoRoot, stageId) {
  const htmlPath = path.join(repoRoot, "community-stages", stageId, "index.html");
  const metaPath = path.join(repoRoot, "community-stages", stageId, "meta.json");
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";
  const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : null;
  const controls = String((meta && meta.controls) || "");
  return {
    id: stageId,
    hasHtml: Boolean(html),
    hasMeta: Boolean(meta),
    usesRuntime: /relay-runtime\.js/.test(html),
    usesHostBridge: /RelayStageHost/.test(html),
    parentHostAccess: /parent\.RelayHost/.test(html),
    iframeParentCheck: /window\.parent/.test(html),
    mentionsTouch: /터치|touch|pointer|클릭|드래그/i.test(controls + html),
    mentionsKeyboard: /방향키|키보드|keydown|Arrow/i.test(controls + html),
  };
}

function reviewPool(repoRoot) {
  const reviews = JSON.parse(fs.readFileSync(path.join(repoRoot, "content", "reviews.json"), "utf8"));
  const metas = new Map(loadAllStageMetas(repoRoot).map((meta) => [meta.id, meta]));
  return REVIEW_IDS.map((id) => {
    const review = reviews.stages[id];
    if (!review) throw new Error(`Missing review for ${id}`);
    const scan = scanStage(repoRoot, id);
    if (!scan.hasHtml || !scan.hasMeta) throw new Error(`Missing files for ${id}`);
    if (!scan.usesHostBridge) throw new Error(`${id} does not use RelayStageHost`);
    if (scan.parentHostAccess) throw new Error(`${id} uses parent.RelayHost`);
    if (review.officialEligible && !scan.mentionsTouch) {
      throw new Error(`${id} is marked official without a touch/pointer control mention`);
    }
    return {
      id,
      title: metas.get(id)?.title || id,
      review,
      scan,
    };
  });
}

function summarize(entries) {
  const official = entries.filter((entry) => entry.review.officialEligible);
  const mechanics = new Set(official.map((entry) => entry.review.mechanic));
  return {
    reviewed: entries.length,
    officialEligible: official.length,
    mechanics: [...mechanics].sort(),
    humanPlay: false,
  };
}

function main() {
  const repoRoot = repoRootFrom(__filename);
  const entries = reviewPool(repoRoot);
  const summary = summarize(entries);
  if (summary.reviewed !== 20) throw new Error("Expected 20 reviewed stages");
  if (summary.officialEligible < 12) throw new Error("Official eligible pool is below 12");
  if (summary.mechanics.length < 6) throw new Error("Official pool has fewer than 6 mechanics");
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

module.exports = {
  REVIEW_IDS,
  reviewPool,
  scanStage,
  summarize,
};

if (require.main === module) {
  main();
}
