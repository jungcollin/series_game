#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadAllStageMetas } = require("./stage_metadata");

const FORBIDDEN_AUTHOR_FIELDS = ["dailyEligible", "officialEligible", "reviewStatus", "approved"];

function repoRootFrom(filePath) {
  return path.resolve(path.dirname(filePath), "../..");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function canonicalStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function catalogHash(catalog) {
  return crypto.createHash("sha256").update(canonicalStringify(catalog)).digest("hex");
}

function assertNoAuthorApprovals(rawMeta, id) {
  for (const field of FORBIDDEN_AUTHOR_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(rawMeta, field)) {
      throw new Error(`Author metadata cannot set ${field}: ${id}`);
    }
  }
}

function gitPublishedAt(repoRoot, stageId) {
  const publishedPath = path.join(repoRoot, "content", "published-at.json");
  if (fs.existsSync(publishedPath)) {
    const map = readJson(publishedPath);
    if (map && map[stageId]) return map[stageId];
  }
  return null;
}

function loadReviews(repoRoot) {
  const filePath = path.join(repoRoot, "content", "reviews.json");
  if (!fs.existsSync(filePath)) {
    return { stages: {} };
  }
  return readJson(filePath);
}

function buildCatalog(repoRoot, options = {}) {
  const reviews = loadReviews(repoRoot);
  const metas = loadAllStageMetas(repoRoot);
  const packagesDir = path.join(repoRoot, "content", "packages");
  const entries = metas.map((meta) => {
    const rawMeta = readJson(path.join(repoRoot, "community-stages", meta.id, "meta.json"));
    assertNoAuthorApprovals(rawMeta, meta.id);
    const review = reviews.stages && reviews.stages[meta.id] ? reviews.stages[meta.id] : null;
    const packageFile = path.join(packagesDir, `${meta.id}.json`);
    const packageInfo = fs.existsSync(packageFile) ? readJson(packageFile) : null;
    return {
      id: meta.id,
      title: meta.title,
      description: meta.description,
      genre: meta.genre,
      clearCondition: meta.clearCondition,
      failCondition: meta.failCondition,
      controls: meta.controls,
      creator: meta.creator,
      estimatedSeconds: meta.estimatedSeconds,
      thumbnail: meta.thumbnail,
      path: meta.path,
      publishedAt: options.publishedAt?.[meta.id] || gitPublishedAt(repoRoot, meta.id),
      packageHash: packageInfo && packageInfo.hash ? packageInfo.hash : null,
      review: review
        ? {
            status: review.status,
            officialEligible: review.officialEligible === true,
            practiceEligible: review.practiceEligible !== false,
            mechanic: review.mechanic,
            input: review.input,
            kind: review.kind,
          }
        : null,
    };
  });

  entries.sort((left, right) => left.id.localeCompare(right.id));
  const catalog = {
    version: 1,
    generatedFrom: "meta.json + content/reviews.json",
    entries,
  };
  catalog.hash = catalogHash({ version: catalog.version, entries: catalog.entries });
  return catalog;
}

function writeCatalog(repoRoot, catalog) {
  const outPath = path.join(repoRoot, "content", "catalog.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
  return outPath;
}

function checkCatalogSync(repoRoot) {
  const expected = buildCatalog(repoRoot);
  const filePath = path.join(repoRoot, "content", "catalog.json");
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const rendered = `${JSON.stringify(expected, null, 2)}\n`;
  return {
    ok: current === rendered,
    expected,
    filePath,
  };
}

function main() {
  const repoRoot = repoRootFrom(__filename);
  const checkOnly = process.argv.includes("--check");
  if (checkOnly) {
    const result = checkCatalogSync(repoRoot);
    if (!result.ok) {
      throw new Error("content/catalog.json is out of date. Run node relay-tools/scripts/build_catalog.js");
    }
    process.stdout.write(`${result.expected.hash}\n`);
    return;
  }
  const catalog = buildCatalog(repoRoot);
  writeCatalog(repoRoot, catalog);
  process.stdout.write(`${catalog.hash}\n`);
}

module.exports = {
  FORBIDDEN_AUTHOR_FIELDS,
  buildCatalog,
  catalogHash,
  checkCatalogSync,
  writeCatalog,
};

if (require.main === module) {
  main();
}
