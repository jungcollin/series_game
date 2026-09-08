#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT_FILES = [
  "index.html",
  "styles.css",
  "game.js",
  "interactions.js",
  "daily-relay.js",
  "about.html",
  "privacy.html",
  "terms.html",
  "ads.txt",
  "robots.txt",
  "sitemap.xml",
  "CNAME",
  "favicon.ico",
  "favicon-16.png",
  "favicon-32.png",
  "apple-touch-icon.png",
  "icon-512.png",
];

const DOMAIN_FILES = ["app/domain/run-state.js"];

const REQUIRED_PATHS = [
  "index.html",
  "game.js",
  "styles.css",
  "daily-relay.js",
  "app/domain/run-state.js",
  "community-stages/gallery.html",
  "community-stages/play.html",
  "community-stages/registry.js",
  ".nojekyll",
  "CNAME",
];

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".mp3",
  ".wav",
  ".ogg",
  ".mp4",
  ".webm",
  ".pdf",
  ".zip",
]);

const SECRET_RE = /DATABASE_URL|SESSION_SIGNING_SECRET|BEGIN (?:RSA |OPENSSH )?PRIVATE KEY/;
const SECRET_SCAN_BYTES = 64 * 1024;
const FORBIDDEN_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "id_rsa",
  "id_ed25519",
  "Caddyfile",
  "docker-compose.yml",
  "compose.yml",
  "compose.yaml",
]);

function parseArgs(argv) {
  const result = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
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

function repoRootFrom(filePath) {
  return path.resolve(path.dirname(filePath), "../..");
}

function isInsideOrEqual(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertSafeOutputDirectory(repoRoot, outDir) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedOut = path.resolve(outDir);
  if (isInsideOrEqual(resolvedOut, resolvedRoot)) {
    throw new Error("Pages output directory must not be the repository root or a parent of it");
  }
  const sources = [
    ...ROOT_FILES.map((relative) => path.join(resolvedRoot, relative)),
    ...DOMAIN_FILES.map((relative) => path.join(resolvedRoot, relative)),
    path.join(resolvedRoot, "community-stages"),
  ];
  for (const source of sources) {
    if (isInsideOrEqual(resolvedOut, source) || isInsideOrEqual(source, resolvedOut)) {
      throw new Error("Pages output directory overlaps a source path");
    }
  }
}

function copyRegularFile(src, dest) {
  if (fs.lstatSync(src).isSymbolicLink()) {
    throw new Error(`Pages artifact source must not be a symlink: ${src}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyTreeWithoutSymlinks(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) {
    throw new Error(`Pages artifact source must not be a symlink: ${src}`);
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyTreeWithoutSymlinks(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  if (!stat.isFile()) {
    throw new Error(`Pages artifact source has an unsupported file type: ${src}`);
  }
  copyRegularFile(src, dest);
}

function buildPagesSite(repoRoot, outDir) {
  const resolvedRoot = path.resolve(repoRoot);
  const resolvedOut = path.resolve(outDir);
  assertSafeOutputDirectory(resolvedRoot, resolvedOut);
  fs.rmSync(resolvedOut, { recursive: true, force: true });
  fs.mkdirSync(resolvedOut, { recursive: true });

  for (const relative of ROOT_FILES) {
    copyRegularFile(path.join(resolvedRoot, relative), path.join(resolvedOut, relative));
  }
  for (const relative of DOMAIN_FILES) {
    copyRegularFile(path.join(resolvedRoot, relative), path.join(resolvedOut, relative));
  }
  copyTreeWithoutSymlinks(
    path.join(resolvedRoot, "community-stages"),
    path.join(resolvedOut, "community-stages")
  );
  fs.writeFileSync(path.join(resolvedOut, ".nojekyll"), "");
  return resolvedOut;
}

function walkFiles(dir, files = [], root = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(root, full).split(path.sep).join("/");
    if (entry.isSymbolicLink() || fs.lstatSync(full).isSymbolicLink()) {
      throw new Error(`Pages artifact contains a symlink: ${relative}`);
    }
    if (entry.isDirectory()) {
      walkFiles(full, files, root);
    } else if (entry.isFile()) {
      files.push(full);
    } else {
      throw new Error(`Pages artifact contains an unsupported file type: ${relative}`);
    }
  }
  return files;
}

function looksBinary(buffer) {
  return buffer.includes(0);
}

function assertPagesArtifact(outDir) {
  if (!fs.existsSync(outDir)) {
    throw new Error(`Pages artifact is missing: ${outDir}`);
  }

  for (const relative of REQUIRED_PATHS) {
    if (!fs.existsSync(path.join(outDir, relative))) {
      throw new Error(`Pages artifact is missing ${relative}`);
    }
  }

  if (fs.existsSync(path.join(outDir, "relay-api"))) {
    throw new Error("Pages artifact must not include relay-api");
  }

  for (const filePath of walkFiles(outDir)) {
    const relative = path.relative(outDir, filePath).split(path.sep).join("/");
    const base = path.basename(filePath);
    if (FORBIDDEN_NAMES.has(base) || relative.startsWith("relay-api/") || relative.includes("/.env")) {
      throw new Error(`Pages artifact contains a forbidden path: ${relative}`);
    }

    const ext = path.extname(filePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      continue;
    }
    const sample = fs.readFileSync(filePath).subarray(0, SECRET_SCAN_BYTES);
    if (looksBinary(sample)) {
      continue;
    }
    if (SECRET_RE.test(sample.toString("utf8"))) {
      throw new Error(`Pages artifact contains a secret-like value in ${relative}`);
    }
  }
}

function main() {
  const args = parseArgs(process.argv);
  const repoRoot = repoRootFrom(__filename);
  const outDir = path.resolve(repoRoot, args.out || "_site");
  if (!args["check-only"]) {
    buildPagesSite(repoRoot, outDir);
  }
  assertPagesArtifact(outDir);
  process.stdout.write(`${path.relative(repoRoot, outDir) || outDir}\n`);
}

module.exports = {
  ROOT_FILES,
  DOMAIN_FILES,
  REQUIRED_PATHS,
  assertSafeOutputDirectory,
  buildPagesSite,
  assertPagesArtifact,
};

if (require.main === module) {
  main();
}
