#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { metaPathForDir, stagePathForDir, syncRegistry } = require("./stage_metadata");

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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function titleCaseFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function escapeTemplate(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function readRequiredArg(args, names, label) {
  for (const name of names) {
    const value = args[name];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  throw new Error(`Missing required argument: --${names[0]} (${label})`);
}

function readOptionalNumber(args, names) {
  for (const name of names) {
    if (!(name in args)) {
      continue;
    }
    const parsed = Number(args[name]);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`Expected a positive number for --${name}`);
    }
    return parsed;
  }
  return null;
}

function resolveStageConfig(args) {
  const description = (args.description || args.desc || args.title || "").trim();
  const directory = slugify(args.slug || args.id || args.title || description);
  if (!directory) {
    throw new Error("Missing stage slug. Pass --slug, --title, or --description.");
  }

  const title = args.title || titleCaseFromSlug(directory);
  const stageId = args.id || directory;
  return {
    description,
    directory,
    title,
    stageId,
    creatorName: readRequiredArg(args, ["creator"], "creator name"),
    creatorAvatar: args["creator-avatar"] || null,
    creatorGithub: args["creator-github"] || null,
    genre: readRequiredArg(args, ["genre"], "stage genre"),
    clearCondition: readRequiredArg(
      args,
      ["clear-condition", "clear"],
      "clear condition"
    ),
    failCondition: readRequiredArg(
      args,
      ["fail-condition", "fail"],
      "fail condition"
    ),
    controls: readRequiredArg(args, ["controls"], "player controls"),
    estimatedSeconds: readOptionalNumber(args, ["estimated-seconds"]),
  };
}

function renderStageTemplate(template, config) {
  return template
    .replace(/__STAGE_ID__/g, config.stageId)
    .replace(/__TITLE__/g, escapeTemplate(config.title))
    .replace(/__CREATOR__/g, escapeTemplate(config.creatorName))
    .replace(/__GENRE__/g, escapeTemplate(config.genre))
    .replace(/__CLEAR_CONDITION__/g, escapeTemplate(config.clearCondition))
    .replace(/__FAIL_CONDITION__/g, escapeTemplate(config.failCondition))
    .replace(/__CONTROLS__/g, escapeTemplate(config.controls))
    .replace(/__DESCRIPTION__/g, escapeTemplate(config.description || config.title));
}

function createStageInRepo({ repoRoot, args }) {
  const templatePath = path.join(repoRoot, "relay-tools/templates/stage-template.html");
  const config = resolveStageConfig(args);
  const stageDir = path.join(repoRoot, "community-stages", config.directory);
  const stagePath = stagePathForDir(repoRoot, config.directory);
  const metaPath = metaPathForDir(repoRoot, config.directory);

  if ((fs.existsSync(stagePath) || fs.existsSync(metaPath)) && !args.force) {
    throw new Error(`Stage already exists: community-stages/${config.directory}`);
  }

  const template = fs.readFileSync(templatePath, "utf8");
  const rendered = renderStageTemplate(template, config);

  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(stagePath, rendered);
  fs.writeFileSync(
    metaPath,
    `${JSON.stringify(
      {
        id: config.stageId,
        title: config.title,
        description: config.description || config.title,
        creator: {
          name: config.creatorName,
          avatar: config.creatorAvatar,
          github: config.creatorGithub,
        },
        genre: config.genre,
        clearCondition: config.clearCondition,
        failCondition: config.failCondition,
        controls: config.controls,
        estimatedSeconds: config.estimatedSeconds,
      },
      null,
      2
    )}\n`
  );

  syncRegistry(repoRoot);

  return {
    stagePath: path.relative(repoRoot, stagePath),
    metaPath: path.relative(repoRoot, metaPath),
    registryPath: "community-stages/registry.js",
    slug: config.stageId,
    directory: config.directory,
    title: config.title,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");
  const output = createStageInRepo({ repoRoot, args });

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  createStageInRepo,
  escapeTemplate,
  parseArgs,
  readOptionalNumber,
  readRequiredArg,
  renderStageTemplate,
  resolveStageConfig,
  slugify,
  titleCaseFromSlug,
};
