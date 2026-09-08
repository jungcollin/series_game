const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const {
  buildPagesSite,
  assertPagesArtifact,
  assertSafeOutputDirectory,
  REQUIRED_PATHS,
} = require("../scripts/build_pages_site.js");

const repoRoot = path.resolve(__dirname, "../..");

test("Pages artifact includes host files and omits API deploy secrets", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-pages-"));
  try {
    buildPagesSite(repoRoot, outDir);
    assertPagesArtifact(outDir);
    for (const relative of REQUIRED_PATHS) {
      assert.equal(fs.existsSync(path.join(outDir, relative)), true, relative);
    }
    assert.equal(fs.existsSync(path.join(outDir, "relay-api")), false);
    assert.equal(fs.existsSync(path.join(outDir, ".env")), false);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("Pages artifact check rejects env files, key material, and symlinks", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-pages-bad-"));
  try {
    buildPagesSite(repoRoot, outDir);
    fs.writeFileSync(path.join(outDir, ".env"), "DATABASE_URL=postgres://example\n");
    assert.throws(() => assertPagesArtifact(outDir), /forbidden path|\.env/);
    fs.rmSync(path.join(outDir, ".env"));
    fs.writeFileSync(
      path.join(outDir, "leak.txt"),
      "SESSION_SIGNING_SECRET=please-do-not-ship\n"
    );
    assert.throws(() => assertPagesArtifact(outDir), /secret-like value/);
    fs.rmSync(path.join(outDir, "leak.txt"));
    fs.writeFileSync(
      path.join(outDir, "stolen.pem"),
      "-----BEGIN RSA PRIVATE KEY-----\nMIIFake\n-----END RSA PRIVATE KEY-----\n"
    );
    assert.throws(() => assertPagesArtifact(outDir), /secret-like value/);
    fs.rmSync(path.join(outDir, "stolen.pem"));
    fs.symlinkSync("/etc/passwd", path.join(outDir, "outside-link"));
    assert.throws(() => assertPagesArtifact(outDir), /symlink/);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test("Pages builder refuses output paths that overlap the source tree", () => {
  assert.throws(
    () => assertSafeOutputDirectory(repoRoot, repoRoot),
    /repository root or a parent/
  );
  assert.throws(
    () => assertSafeOutputDirectory(repoRoot, path.join(repoRoot, "..")),
    /repository root or a parent/
  );
  assert.throws(
    () => assertSafeOutputDirectory(repoRoot, path.join(repoRoot, "community-stages")),
    /overlaps a source path/
  );
  assert.doesNotThrow(() => assertSafeOutputDirectory(repoRoot, path.join(repoRoot, "_site")));
});

test("build_pages_site CLI writes and checks an artifact", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "relay-pages-cli-"));
  try {
    const result = spawnSync(
      process.execPath,
      ["relay-tools/scripts/build_pages_site.js", "--out", outDir],
      { cwd: repoRoot, encoding: "utf8" }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(outDir, "index.html")), true);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});
