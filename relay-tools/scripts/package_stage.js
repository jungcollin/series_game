#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const LICENSE_HINTS = /mit|license|cc0|cc-by/i;
const MAX_PACKAGE_BYTES = 2.5 * 1024 * 1024;

function repoRootFrom(filePath) {
  return path.resolve(path.dirname(filePath), "../..");
}

function walkFiles(dir, files = [], root = dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink() || fs.lstatSync(full).isSymbolicLink()) {
      throw new Error(`Package source cannot be a symlink: ${path.relative(root, full)}`);
    }
    if (entry.isDirectory()) {
      walkFiles(full, files, root);
    } else if (entry.isFile()) {
      files.push(full);
    } else {
      throw new Error(`Unsupported file type in package: ${path.relative(root, full)}`);
    }
  }
  return files.sort();
}

function hashFile(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function packageStage(repoRoot, stageId, options = {}) {
  const stageDir = path.join(repoRoot, "community-stages", stageId);
  if (!fs.existsSync(path.join(stageDir, "index.html"))) {
    throw new Error(`Missing stage entry: ${stageId}`);
  }
  const extraFiles = options.extraFiles || [
    path.join(repoRoot, "community-stages", "relay-runtime.js"),
    path.join(repoRoot, "community-stages", "sdk", "v2", "relay-sdk.js"),
  ];
  const files = [];
  for (const filePath of walkFiles(stageDir)) {
    files.push({
      path: path.relative(repoRoot, filePath).split(path.sep).join("/"),
      sha256: hashFile(filePath),
      bytes: fs.statSync(filePath).size,
    });
  }
  for (const extra of extraFiles) {
    if (!fs.existsSync(extra)) continue;
    files.push({
      path: path.relative(repoRoot, extra).split(path.sep).join("/"),
      sha256: hashFile(extra),
      bytes: fs.statSync(extra).size,
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes > MAX_PACKAGE_BYTES) {
    throw new Error(`${stageId} package is too large: ${totalBytes}`);
  }
  const licensePath = path.join(repoRoot, "LICENSE");
  const licenseOk = fs.existsSync(licensePath) && LICENSE_HINTS.test(fs.readFileSync(licensePath, "utf8"));
  if (!licenseOk) {
    throw new Error("Repository LICENSE is missing or unrecognized");
  }
  const hash = crypto.createHash("sha256").update(JSON.stringify(files)).digest("hex");
  return {
    stageId,
    hash,
    bytes: totalBytes,
    files,
  };
}

function writePackage(repoRoot, manifest) {
  const outDir = path.join(repoRoot, "content", "packages");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `${manifest.stageId}.json`);
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return outPath;
}

function main() {
  const repoRoot = repoRootFrom(__filename);
  const stageId = process.argv[2];
  if (!stageId) {
    throw new Error("Usage: node package_stage.js <stage-id>");
  }
  const manifest = packageStage(repoRoot, stageId);
  writePackage(repoRoot, manifest);
  process.stdout.write(`${manifest.hash}\n`);
}

module.exports = {
  MAX_PACKAGE_BYTES,
  packageStage,
  writePackage,
};

if (require.main === module) {
  main();
}
