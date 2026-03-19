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

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");
  const templatePath = path.join(repoRoot, "relay-tools/templates/stage-template.html");

  const description = (args.description || args.desc || args.title || "").trim();
  const slug = slugify(args.slug || args.id || args.title || description);
  if (!slug) {
    throw new Error("Missing stage slug. Pass --slug, --title, or --description.");
  }

  const title = args.title || titleCaseFromSlug(slug);
  const stageId = args.id || slug;
  const creatorName = readRequiredArg(args, ["creator"], "creator name");
  const creatorAvatar = args["creator-avatar"] || null;
  const creatorGithub = args["creator-github"] || null;
  const genre = readRequiredArg(args, ["genre"], "stage genre");
  const clearCondition = readRequiredArg(
    args,
    ["clear-condition", "clear"],
    "clear condition"
  );
  const failCondition = readRequiredArg(
    args,
    ["fail-condition", "fail"],
    "fail condition"
  );
  const controls = readRequiredArg(args, ["controls"], "player controls");
  const estimatedSeconds = readOptionalNumber(args, ["estimated-seconds"]);
  const stageDir = path.join(repoRoot, "community-stages", slug);
  const stagePath = stagePathForDir(repoRoot, slug);
  const metaPath = metaPathForDir(repoRoot, slug);

  if ((fs.existsSync(stagePath) || fs.existsSync(metaPath)) && !args.force) {
    throw new Error(`Stage already exists: community-stages/${slug}`);
  }

  const template = fs.readFileSync(templatePath, "utf8");
  const rendered = template
    .replace(/__STAGE_ID__/g, stageId)
    .replace(/__TITLE__/g, escapeTemplate(title))
    .replace(/__CREATOR__/g, escapeTemplate(creatorName))
    .replace(/__GENRE__/g, escapeTemplate(genre))
    .replace(/__CLEAR_CONDITION__/g, escapeTemplate(clearCondition))
    .replace(/__FAIL_CONDITION__/g, escapeTemplate(failCondition))
    .replace(/__CONTROLS__/g, escapeTemplate(controls))
    .replace(/__DESCRIPTION__/g, escapeTemplate(description || title))
    ;

  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(stagePath, rendered);
  fs.writeFileSync(
    metaPath,
    `${JSON.stringify(
      {
        id: stageId,
        title,
        description: description || title,
        creator: {
          name: creatorName,
          avatar: creatorAvatar,
          github: creatorGithub,
        },
        genre,
        clearCondition,
        failCondition,
        controls,
        estimatedSeconds,
      },
      null,
      2
    )}\n`
  );

  syncRegistry(repoRoot);

  process.stdout.write(
    JSON.stringify(
      {
        stagePath: path.relative(repoRoot, stagePath),
        metaPath: path.relative(repoRoot, metaPath),
        registryPath: "community-stages/registry.js",
        slug: stageId,
        directory: slug,
        title,
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
