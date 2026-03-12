#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

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

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");
  const templatePath = path.join(repoRoot, "relay-tools/templates/stage-template.html");
  const registryPath = path.join(repoRoot, "community-stages/registry.js");

  const description = args.description || args.desc || "";
  const slug = slugify(args.slug || args.title || description);
  if (!slug) {
    throw new Error("Missing stage slug. Pass --slug, --title, or --description.");
  }

  const title = args.title || titleCaseFromSlug(slug);
  const creator = args.creator || "Contributor";
  const genre = args.genre || "Arcade stage";
  const clearCondition = args["clear-condition"] || args.clear || "스테이지 목표를 달성하기";
  const failCopy = args["fail-copy"] || "실패 조건에 맞춰 즉시 종료됩니다.";
  const stageDir = path.join(repoRoot, "community-stages", slug);
  const stagePath = path.join(stageDir, "index.html");

  if (fs.existsSync(stagePath) && !args.force) {
    throw new Error(`Stage already exists: ${path.relative(repoRoot, stagePath)}`);
  }

  const template = fs.readFileSync(templatePath, "utf8");
  const rendered = template
    .replace(/__STAGE_ID__/g, slug)
    .replace(/__TITLE__/g, title)
    .replace(/__CREATOR__/g, creator)
    .replace(/__GENRE__/g, genre)
    .replace(/__CLEAR_CONDITION__/g, clearCondition)
    .replace(/__DESCRIPTION__/g, escapeTemplate(description || title))
    .replace(/__FAIL_COPY__/g, escapeTemplate(failCopy));

  fs.mkdirSync(stageDir, { recursive: true });
  fs.writeFileSync(stagePath, rendered);

  const registryText = fs.readFileSync(registryPath, "utf8");
  if (!registryText.includes(`id: "${slug}"`)) {
    const entry = `  {\n    id: "${slug}",\n    title: "${title}",\n    creator: "${creator}",\n    genre: "${genre}",\n    clearCondition: "${clearCondition}",\n    path: "./${slug}/index.html",\n  },\n`;
    const updated = registryText.replace(
      /window\.COMMUNITY_STAGE_REGISTRY = \[\n/,
      `window.COMMUNITY_STAGE_REGISTRY = [\n${entry}`
    );
    fs.writeFileSync(registryPath, updated);
  }

  process.stdout.write(
    JSON.stringify(
      {
        stagePath: path.relative(repoRoot, stagePath),
        registryPath: path.relative(repoRoot, registryPath),
        slug,
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
