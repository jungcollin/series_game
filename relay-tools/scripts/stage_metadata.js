const fs = require("fs");
const path = require("path");

const REQUIRED_STAGE_FIELDS = [
  "id",
  "title",
  "description",
  "genre",
  "clearCondition",
  "failCondition",
  "controls",
];

function communityStagesRoot(repoRoot) {
  return path.join(repoRoot, "community-stages");
}

function registryPath(repoRoot) {
  return path.join(communityStagesRoot(repoRoot), "registry.js");
}

function metaPathForDir(repoRoot, dir) {
  return path.join(communityStagesRoot(repoRoot), dir, "meta.json");
}

function stagePathForDir(repoRoot, dir) {
  return path.join(communityStagesRoot(repoRoot), dir, "index.html");
}

function ensureNonEmptyString(label, value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required stage metadata field: ${label}`);
  }
  return value.trim();
}

function normalizeOptionalString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function normalizeCreator(rawCreator) {
  if (typeof rawCreator === "string") {
    return {
      name: ensureNonEmptyString("creator.name", rawCreator),
      avatar: null,
      github: null,
    };
  }

  if (!rawCreator || typeof rawCreator !== "object") {
    throw new Error("Missing required stage metadata field: creator.name");
  }

  return {
    name: ensureNonEmptyString("creator.name", rawCreator.name),
    avatar: normalizeOptionalString(rawCreator.avatar),
    github: normalizeOptionalString(rawCreator.github),
  };
}

function normalizeEstimatedSeconds(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("estimatedSeconds must be a positive number when provided.");
  }
  return parsed;
}

function normalizeStageMeta(rawMeta, dir) {
  const normalized = {
    id: ensureNonEmptyString("id", rawMeta.id),
    title: ensureNonEmptyString("title", rawMeta.title),
    description: ensureNonEmptyString("description", rawMeta.description),
    genre: ensureNonEmptyString("genre", rawMeta.genre),
    clearCondition: ensureNonEmptyString("clearCondition", rawMeta.clearCondition),
    failCondition: ensureNonEmptyString("failCondition", rawMeta.failCondition),
    controls: ensureNonEmptyString("controls", rawMeta.controls),
    creator: normalizeCreator(rawMeta.creator),
    estimatedSeconds: normalizeEstimatedSeconds(rawMeta.estimatedSeconds),
    dir,
    path: `./${dir}/index.html`,
  };

  if (normalized.id.includes("/")) {
    throw new Error(`Stage id cannot contain "/": ${normalized.id}`);
  }

  return normalized;
}

function readStageMetaFile(repoRoot, dir) {
  const metaPath = metaPathForDir(repoRoot, dir);
  if (!fs.existsSync(metaPath)) {
    return null;
  }

  const rawMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  return normalizeStageMeta(rawMeta, dir);
}

function loadAllStageMetas(repoRoot) {
  const stagesRoot = communityStagesRoot(repoRoot);
  return fs
    .readdirSync(stagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => readStageMetaFile(repoRoot, entry.name))
    .filter(Boolean);
}

function findStageMeta(repoRoot, candidate) {
  const normalizedCandidate = String(candidate || "").trim();
  if (!normalizedCandidate) {
    return null;
  }

  return (
    loadAllStageMetas(repoRoot).find(
      (meta) => meta.id === normalizedCandidate || meta.dir === normalizedCandidate
    ) || null
  );
}

function escapeJs(value) {
  return JSON.stringify(value);
}

function readRegistryOrder(repoRoot) {
  const filePath = registryPath(repoRoot);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const text = fs.readFileSync(filePath, "utf8");
  const ids = [];
  const pattern = /id: "([^"]+)"/g;
  let match = pattern.exec(text);
  while (match) {
    ids.push(match[1]);
    match = pattern.exec(text);
  }
  return ids;
}

function sortMetasForRegistry(repoRoot, metas) {
  const existingOrder = readRegistryOrder(repoRoot);
  const orderMap = new Map(existingOrder.map((id, index) => [id, index]));
  return [...metas].sort((left, right) => {
    const leftIndex = orderMap.has(left.id) ? orderMap.get(left.id) : Number.MAX_SAFE_INTEGER;
    const rightIndex = orderMap.has(right.id) ? orderMap.get(right.id) : Number.MAX_SAFE_INTEGER;
    if (leftIndex !== rightIndex) {
      return leftIndex - rightIndex;
    }
    return left.id.localeCompare(right.id);
  });
}

function buildRegistrySource(metas) {
  const entries = metas
    .map(
      (meta) => `  {
    id: ${escapeJs(meta.id)},
    title: ${escapeJs(meta.title)},
    creator: { name: ${escapeJs(meta.creator.name)}, avatar: ${
        meta.creator.avatar === null ? "null" : escapeJs(meta.creator.avatar)
      }, github: ${meta.creator.github === null ? "null" : escapeJs(meta.creator.github)} },
    genre: ${escapeJs(meta.genre)},
    clearCondition: ${escapeJs(meta.clearCondition)},
    path: ${escapeJs(meta.path)},
  }`
    )
    .join(",\n");

  return `window.COMMUNITY_STAGE_REGISTRY = [
${entries}
];
`;
}

function getGeneratedRegistrySource(repoRoot) {
  const metas = sortMetasForRegistry(repoRoot, loadAllStageMetas(repoRoot));
  return buildRegistrySource(metas);
}

function syncRegistry(repoRoot) {
  const filePath = registryPath(repoRoot);
  const source = getGeneratedRegistrySource(repoRoot);
  fs.writeFileSync(filePath, source);
  return source;
}

function checkRegistrySync(repoRoot) {
  const filePath = registryPath(repoRoot);
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  const expected = getGeneratedRegistrySource(repoRoot);
  return {
    ok: current === expected,
    current,
    expected,
    registryPath: filePath,
  };
}

module.exports = {
  REQUIRED_STAGE_FIELDS,
  checkRegistrySync,
  communityStagesRoot,
  findStageMeta,
  loadAllStageMetas,
  metaPathForDir,
  normalizeStageMeta,
  registryPath,
  stagePathForDir,
  syncRegistry,
};
