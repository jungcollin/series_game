#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadAllStageMetas } = require("./stage_metadata");

const FORBIDDEN_AUTHOR_FIELDS = [
  "dailyEligible",
  "officialEligible",
  "reviewStatus",
  "approved",
];

// v1 레거시(커뮤니티 테스트 기여작)와 v2(정식 검수 대상)를 가르는 게시 시각 컷오프.
// 컷오프 이전에 게시된 스테이지는 검수 면제 레거시로 묶는다. publishedAt이 없는 신규 스테이지는 v2.
const GENERATION_V1_CUTOFF = "2026-09-09T00:00:00+09:00";

function generationFor(publishedAt) {
  const ms = publishedAt ? Date.parse(publishedAt) : NaN;
  if (!Number.isFinite(ms)) return "v2";
  return ms < Date.parse(GENERATION_V1_CUTOFF) ? "v1" : "v2";
}

function repoRootFrom(filePath) {
  return path.resolve(path.dirname(filePath), "../..");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to parse JSON: ${path.relative(process.cwd(), filePath)} (${error.message})`,
    );
  }
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
  return crypto
    .createHash("sha256")
    .update(canonicalStringify(catalog))
    .digest("hex");
}

function assertNoAuthorApprovals(rawMeta, id) {
  for (const field of FORBIDDEN_AUTHOR_FIELDS) {
    if (Object.hasOwn(rawMeta, field)) {
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
    const rawMeta = readJson(
      path.join(repoRoot, "community-stages", meta.id, "meta.json"),
    );
    assertNoAuthorApprovals(rawMeta, meta.id);
    const review =
      reviews.stages && reviews.stages[meta.id]
        ? reviews.stages[meta.id]
        : null;
    const packageFile = path.join(packagesDir, `${meta.id}.json`);
    const packageInfo = fs.existsSync(packageFile)
      ? readJson(packageFile)
      : null;
    const publishedAt =
      options.publishedAt?.[meta.id] || gitPublishedAt(repoRoot, meta.id);
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
      publishedAt,
      generation: generationFor(publishedAt),
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
  catalog.hash = catalogHash({
    version: catalog.version,
    entries: catalog.entries,
  });
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
  const current = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : "";
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
      throw new Error(
        "content/catalog.json is out of date. Run node relay-tools/scripts/build_catalog.js",
      );
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
  GENERATION_V1_CUTOFF,
  buildCatalog,
  catalogHash,
  checkCatalogSync,
  generationFor,
  writeCatalog,
};

if (require.main === module) {
  main();
}
