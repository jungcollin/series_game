#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { checkRegistrySync, findStageMeta, stagePathForDir } = require("./stage_metadata");

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

const { chromium } = loadPlaywright();

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

function run(command, args, cwd) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function parseChangedStageSlugs(gitStatus) {
  const stageSlugs = new Set();
  const lines = String(gitStatus || "").split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    let changedPath = line.slice(3).trim();
    if (!changedPath) {
      continue;
    }
    if (changedPath.includes(" -> ")) {
      changedPath = changedPath.split(" -> ").pop().trim();
    }
    const match = changedPath.match(/^community-stages\/([^/]+)\//);
    if (match && match[1]) {
      stageSlugs.add(match[1]);
    }
  }
  return Array.from(stageSlugs);
}

function resolveStageSlug(args, repoRoot) {
  if (args.stage) {
    return args.stage;
  }
  const gitStatus = run("git", ["status", "--short"], repoRoot);
  const candidates = parseChangedStageSlugs(gitStatus);
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length > 1) {
    throw new Error(
      `Missing --stage. Multiple changed stage candidates found: ${candidates.join(", ")}.`
    );
  }
  throw new Error(
    "Missing --stage and could not infer stage from git changes. Pass --stage <stage-slug>."
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");
  const stageCandidate = resolveStageSlug(args, repoRoot);
  const stageMeta = findStageMeta(repoRoot, stageCandidate);
  const outputDir = path.join(repoRoot, "output", "relay-tools");
  const baseUrl = (args["base-url"] || "http://series-game.localhost:1355").replace(/\/$/, "");

  if (!stageMeta) {
    throw new Error(`Stage metadata not found for: ${stageCandidate}`);
  }

  const registryStatus = checkRegistrySync(repoRoot);
  if (!registryStatus.ok) {
    throw new Error(
      "community-stages/registry.js is out of sync with stage metadata. Run node relay-tools/scripts/sync_registry.js."
    );
  }

  const stagePath = stagePathForDir(repoRoot, stageMeta.dir);
  if (!fs.existsSync(stagePath)) {
    throw new Error(`Stage file not found: ${path.relative(repoRoot, stagePath)}`);
  }

  const stageSource = fs.readFileSync(stagePath, "utf8");
  for (const field of [
    { label: "clearCondition", value: stageMeta.clearCondition },
    { label: "failCondition", value: stageMeta.failCondition },
    { label: "controls", value: stageMeta.controls },
  ]) {
    if (!stageSource.includes(field.value)) {
      throw new Error(
        `Stage source must include the exact ${field.label} text from meta.json: ${field.value}`
      );
    }
  }

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  const launcherUrl = `${baseUrl}/community-stages/index.html`;
  await page.goto(launcherUrl, { waitUntil: "networkidle" });
  const launcherCount = await page.locator(`text=${stageMeta.title}`).count();
  await page.screenshot({
    path: path.join(outputDir, `${stageMeta.dir}-launcher.png`),
    fullPage: true,
  });

  const stageUrl = `${baseUrl}/community-stages/${stageMeta.dir}/index.html`;
  await page.goto(stageUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const directChecks = await page.evaluate(() => ({
    hasRender: typeof window.render_game_to_text === "function",
    hasAdvance: typeof window.advanceTime === "function",
    hasMeta: typeof window.relayStageMeta === "object" && window.relayStageMeta !== null,
    hasResult: typeof window.relayStageResult === "object" && window.relayStageResult !== null,
    hasDebug:
      typeof window.relayStageDebug === "object" &&
      typeof window.relayStageDebug?.forceClear === "function" &&
      typeof window.relayStageDebug?.forceFail === "function",
    text: typeof window.render_game_to_text === "function" ? window.render_game_to_text() : null,
    meta: window.relayStageMeta || null,
    result: window.relayStageResult || null,
  }));
  await page.screenshot({
    path: path.join(outputDir, `${stageMeta.dir}-direct.png`),
    fullPage: true,
  });

  if (!launcherCount) {
    throw new Error(`Launcher card not found for stage: ${stageMeta.id}`);
  }
  if (!directChecks.hasRender || !directChecks.hasAdvance || !directChecks.hasMeta || !directChecks.hasResult) {
    throw new Error(`Required relay interface missing for stage: ${stageMeta.id}`);
  }
  if (!directChecks.hasDebug) {
    throw new Error(`relayStageDebug.forceClear/forceFail missing for stage: ${stageMeta.id}`);
  }
  if (directChecks.meta?.id !== stageMeta.id) {
    throw new Error(`window.relayStageMeta.id does not match meta.json for stage: ${stageMeta.id}`);
  }
  if (directChecks.meta?.title !== stageMeta.title) {
    throw new Error(
      `window.relayStageMeta.title does not match meta.json for stage: ${stageMeta.id}`
    );
  }
  if (directChecks.meta?.genre !== stageMeta.genre) {
    throw new Error(
      `window.relayStageMeta.genre does not match meta.json for stage: ${stageMeta.id}`
    );
  }
  if (directChecks.meta?.clearCondition !== stageMeta.clearCondition) {
    throw new Error(
      `window.relayStageMeta.clearCondition does not match meta.json for stage: ${stageMeta.id}`
    );
  }

  const hostPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  hostPage.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });
  await hostPage.goto(launcherUrl, { waitUntil: "networkidle" });

  async function runHostCase(iframeId, actionName) {
    await hostPage.evaluate(
      ({ stageDir, iframeId }) => {
        window.__relayHostEvents = [];
        window.RelayHost = {
          onStageReady(meta) {
            window.__relayHostEvents.push({ type: "ready", meta });
          },
          onStageCleared(payload) {
            window.__relayHostEvents.push({ type: "cleared", payload });
          },
          onStageFailed(payload) {
            window.__relayHostEvents.push({ type: "failed", payload });
          },
        };
        document.body.innerHTML = `<iframe id="${iframeId}" src="./${stageDir}/index.html" style="width:960px;height:540px;border:0"></iframe>`;
      },
      { stageDir: stageMeta.dir, iframeId }
    );

    const frame = await (await hostPage.waitForSelector(`#${iframeId}`)).contentFrame();
    await frame.waitForFunction(() => !!window.relayStageDebug);
    await frame.evaluate((actionName) => {
      window.relayStageDebug[actionName]();
    }, actionName);
    await hostPage.waitForTimeout(250);
    return hostPage.evaluate(() => window.__relayHostEvents);
  }

  const clearEvents = await runHostCase("stage-clear", "forceClear");
  const failEvents = await runHostCase("stage-fail", "forceFail");

  await hostPage.screenshot({
    path: path.join(outputDir, `${stageMeta.dir}-host.png`),
    fullPage: true,
  });
  await browser.close();

  const hasClearEvent = clearEvents.some((event) => event.type === "cleared");
  const hasFailEvent = failEvents.some((event) => event.type === "failed");
  const hasReadyEvent = clearEvents.some((event) => event.type === "ready") && failEvents.some((event) => event.type === "ready");

  if (!hasReadyEvent || !hasClearEvent || !hasFailEvent) {
    throw new Error(`Host callback contract failed for stage: ${stageMeta.id}`);
  }
  if (consoleErrors.length) {
    throw new Error(`Console errors detected for stage: ${stageMeta.id}\n${consoleErrors.join("\n")}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        stage: stageMeta.id,
        stageDir: stageMeta.dir,
        directChecks,
        host: {
          clearEvents,
          failEvents,
        },
        screenshots: [
          path.relative(repoRoot, path.join(outputDir, `${stageMeta.dir}-launcher.png`)),
          path.relative(repoRoot, path.join(outputDir, `${stageMeta.dir}-direct.png`)),
          path.relative(repoRoot, path.join(outputDir, `${stageMeta.dir}-host.png`)),
        ],
      },
      null,
      2
    ) + "\n"
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
