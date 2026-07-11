#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEFAULT_STAGES = [
  "cipher-rain",
  "command-deck",
  "echo-twins",
  "elastic-grapple",
  "microscope-hunt",
  "orbital-dock",
  "parallax-vault",
  "resonance-field",
  "signal-triangulator",
  "storm-cargo-crane",
];

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (firstError) {
    try {
      const npmRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
      return require(path.join(npmRoot, "playwright"));
    } catch (secondError) {
      throw firstError;
    }
  }
}

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

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalizeDifficulty(value) {
  if (Number.isFinite(value)) return Number(value);
  if (value && Number.isFinite(value.difficulty)) return Number(value.difficulty);
  if (value && Number.isFinite(value.progress)) return Number(value.progress);
  return Number.NaN;
}

function parseSnapshot(raw) {
  if (raw && typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

async function launchBrowser(chromium, probeUrl) {
  const attempts = [
    { channel: "chrome", headless: true, args: ["--disable-gpu"] },
    { headless: true, args: ["--disable-gpu"] },
  ];
  const errors = [];
  for (const options of attempts) {
    let browser;
    try {
      browser = await chromium.launch(options);
      const page = await browser.newPage({ viewport: { width: 320, height: 240 } });
      await page.goto(probeUrl, { waitUntil: "domcontentloaded", timeout: 8000 });
      await page.close();
      return browser;
    } catch (error) {
      errors.push(error.message);
      await browser?.close().catch(() => {});
    }
  }
  throw new Error(`Playwright launch failed:\n${errors.join("\n")}`);
}

async function startFromCanvas(page) {
  await page.evaluate(() => {
    const canvas = document.querySelector("#game");
    const rect = canvas.getBoundingClientRect();
    const init = {
      bubbles: true,
      pointerId: 1,
      pointerType: "touch",
      clientX: rect.left + rect.width * 0.5,
      clientY: rect.top + rect.height * 0.5,
    };
    canvas.dispatchEvent(new PointerEvent("pointerdown", init));
    canvas.dispatchEvent(new PointerEvent("pointerup", init));
  });
  await page.waitForTimeout(80);
}

async function inspectStage({ browser, baseUrl, repoRoot, stage }) {
  const metaPath = path.join(repoRoot, "community-stages", stage, "meta.json");
  assert(fs.existsSync(metaPath), `Missing meta.json: ${stage}`);
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
  const duration = Number(meta.estimatedSeconds);
  assert(Number.isFinite(duration) && duration > 0, `Missing estimatedSeconds: ${stage}`);

  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  try {
    await page.goto(`${baseUrl}/community-stages/${stage}/index.html`, {
      waitUntil: "domcontentloaded",
      timeout: 10000,
    });
    await page.waitForFunction(
      () =>
        typeof window.render_game_to_text === "function" &&
        typeof window.advanceTime === "function" &&
        typeof window.relayStageDebug?.difficultyAt === "function",
      { timeout: 5000 }
    );

    const sampleSeconds = [0, duration * 0.25, duration * 0.5, duration * 0.75, duration];
    const curve = await page.evaluate((seconds) =>
      seconds.map((value) => window.relayStageDebug.difficultyAt(value)), sampleSeconds
    );
    const values = curve.map(normalizeDifficulty);
    assert(values.every(Number.isFinite), `difficultyAt must return a number: ${stage}`);
    assert(
      values.every((value) => value >= -0.001 && value <= 1.001),
      `difficultyAt must stay in [0, 1]: ${stage} (${values.join(", ")})`
    );
    for (let index = 1; index < values.length; index += 1) {
      assert(
        values[index] + 0.001 >= values[index - 1],
        `Difficulty decreased at sample ${index}: ${stage} (${values.join(", ")})`
      );
    }
    assert(
      values.at(-1) - values[0] >= 0.6,
      `Difficulty range is too small: ${stage} (${values.join(", ")})`
    );

    await startFromCanvas(page);
    let snapshot = parseSnapshot(
      await page.evaluate(() => window.render_game_to_text())
    );
    if (snapshot?.mode === "menu") {
      await startFromCanvas(page);
      snapshot = parseSnapshot(await page.evaluate(() => window.render_game_to_text()));
    }
    assert(snapshot?.mode === "running", `Touch start did not enter running mode: ${stage}`);
    assert(Number.isFinite(Number(snapshot.difficulty)), `Snapshot missing difficulty: ${stage}`);
    assert(snapshot.phase !== undefined && snapshot.phase !== null, `Snapshot missing phase: ${stage}`);

    const beforeElapsed = Number(snapshot.elapsed) || 0;
    const beforeDifficulty = Number(snapshot.difficulty) || 0;
    await page.evaluate(() => window.advanceTime(1000));
    const after = parseSnapshot(await page.evaluate(() => window.render_game_to_text()));
    assert(after?.mode === "running", `Stage fails during its first simulated second: ${stage}`);
    assert(Number(after.elapsed) >= beforeElapsed + 0.9, `advanceTime did not advance elapsed: ${stage}`);
    assert(
      Number(after.difficulty) + 0.001 >= beforeDifficulty,
      `Runtime difficulty decreased: ${stage}`
    );
    assert(consoleErrors.length === 0, `Console errors in ${stage}: ${consoleErrors.join(" | ")}`);

    return {
      stage,
      duration,
      samples: sampleSeconds.map((seconds, index) => ({
        seconds: Number(seconds.toFixed(2)),
        difficulty: Number(values[index].toFixed(4)),
      })),
      runtime: {
        elapsed: Number(Number(after.elapsed).toFixed(3)),
        difficulty: Number(Number(after.difficulty).toFixed(4)),
        phase: after.phase,
      },
      ok: true,
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");
  const baseUrl = String(args["base-url"] || "http://127.0.0.1:4173").replace(/\/$/, "");
  const stages = String(args.stages || DEFAULT_STAGES.join(","))
    .split(",")
    .map((stage) => stage.trim())
    .filter(Boolean);
  const { chromium } = loadPlaywright();
  const browser = await launchBrowser(chromium, `${baseUrl}/community-stages/index.html`);
  const results = [];

  try {
    for (const stage of stages) {
      results.push(await inspectStage({ browser, baseUrl, repoRoot, stage }));
    }
  } finally {
    await browser.close();
  }

  process.stdout.write(`${JSON.stringify({ ok: true, stages: results }, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_STAGES,
  normalizeDifficulty,
  parseArgs,
  parseSnapshot,
};
