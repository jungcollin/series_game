#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

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

async function main() {
  const args = parseArgs(process.argv);
  const stageSlug = args.stage;
  if (!stageSlug) {
    throw new Error("Missing --stage <stage-slug>.");
  }

  const repoRoot = path.resolve(__dirname, "../..");
  const registryPath = path.join(repoRoot, "community-stages/registry.js");
  const outputDir = path.join(repoRoot, "output", "relay-tools");
  const baseUrl = (args["base-url"] || "http://series-game.localhost:1355").replace(/\/$/, "");

  const registryText = fs.readFileSync(registryPath, "utf8");
  if (!registryText.includes(`id: "${stageSlug}"`)) {
    throw new Error(`Registry entry missing for stage: ${stageSlug}`);
  }
  const entryMatch = registryText.match(
    new RegExp(
      `id: "${stageSlug}"[\\s\\S]*?title: "([^"]+)"[\\s\\S]*?path: "\\./([^"]+)/index\\.html"`
    )
  );
  const stageDir = entryMatch ? entryMatch[2] : stageSlug;
  const stagePath = path.join(repoRoot, "community-stages", stageDir, "index.html");
  if (!fs.existsSync(stagePath)) {
    throw new Error(`Stage file not found: ${path.relative(repoRoot, stagePath)}`);
  }
  const stageTitle = entryMatch ? entryMatch[1] : stageSlug;

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
  const launcherCount = await page.locator(`text=${stageTitle}`).count();
  await page.screenshot({ path: path.join(outputDir, `${stageSlug}-launcher.png`), fullPage: true });

  const stageUrl = `${baseUrl}/community-stages/${stageDir}/index.html`;
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
  await page.screenshot({ path: path.join(outputDir, `${stageSlug}-direct.png`), fullPage: true });

  if (!launcherCount) {
    throw new Error(`Launcher card not found for stage: ${stageSlug}`);
  }
  if (!directChecks.hasRender || !directChecks.hasAdvance || !directChecks.hasMeta || !directChecks.hasResult) {
    throw new Error(`Required relay interface missing for stage: ${stageSlug}`);
  }
  if (!directChecks.hasDebug) {
    throw new Error(`relayStageDebug.forceClear/forceFail missing for stage: ${stageSlug}`);
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
      ({ stageSlug, iframeId }) => {
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
        document.body.innerHTML = `<iframe id="${iframeId}" src="./${stageSlug}/index.html" style="width:960px;height:540px;border:0"></iframe>`;
      },
      { stageSlug: stageDir, iframeId }
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

  await hostPage.screenshot({ path: path.join(outputDir, `${stageSlug}-host.png`), fullPage: true });
  await browser.close();

  const hasClearEvent = clearEvents.some((event) => event.type === "cleared");
  const hasFailEvent = failEvents.some((event) => event.type === "failed");
  const hasReadyEvent = clearEvents.some((event) => event.type === "ready") && failEvents.some((event) => event.type === "ready");

  if (!hasReadyEvent || !hasClearEvent || !hasFailEvent) {
    throw new Error(`Host callback contract failed for stage: ${stageSlug}`);
  }
  if (consoleErrors.length) {
    throw new Error(`Console errors detected for stage: ${stageSlug}\n${consoleErrors.join("\n")}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        stage: stageSlug,
        directChecks,
        host: {
          clearEvents,
          failEvents,
        },
        screenshots: [
          path.relative(repoRoot, path.join(outputDir, `${stageSlug}-launcher.png`)),
          path.relative(repoRoot, path.join(outputDir, `${stageSlug}-direct.png`)),
          path.relative(repoRoot, path.join(outputDir, `${stageSlug}-host.png`)),
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
