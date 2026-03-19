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

async function getRelayFrame(page) {
  const frameHandle = await page.waitForSelector("#relay-frame");
  const frame = await frameHandle.contentFrame();
  if (!frame) {
    throw new Error("Could not resolve relay iframe.");
  }
  await frame.waitForFunction(() => !!window.relayStageDebug && !!window.relayStageMeta, null, {
    timeout: 8000,
  });
  return frame;
}

async function waitForStageReady(page) {
  await page.waitForFunction(() => {
    const stageTitle = document.querySelector("#run-stage-title")?.textContent || "";
    const overlayHidden = document.querySelector("#relay-overlay")?.hidden === true;
    return (
      overlayHidden &&
      !stageTitle.includes("불러오는 중") &&
      !stageTitle.includes("고르는 중") &&
      !stageTitle.includes("로드 실패")
    );
  }, null, { timeout: 8000 });

  return getRelayFrame(page);
}

async function waitForOverlay(page, expectedTitle) {
  await page.waitForFunction((title) => {
    const overlay = document.querySelector("#relay-overlay");
    const overlayTitle = document.querySelector("#relay-overlay-title")?.textContent || "";
    return overlay?.hidden === false && overlayTitle === title;
  }, expectedTitle, { timeout: 8000 });
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");
  const outputDir = path.join(repoRoot, "output", "relay-tools");
  const baseUrl = (args["base-url"] || "http://series-game.localhost:1355").replace(/\/$/, "");

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

  const visitedStageIds = [];
  for (;;) {
    const frame = await waitForStageReady(page);
    const stageId = await frame.evaluate(() => window.relayStageMeta.id);
    if (visitedStageIds.includes(stageId)) {
      throw new Error(`Relay repeated a stage before all-clear: ${stageId}`);
    }

    visitedStageIds.push(stageId);
    await frame.evaluate(() => {
      window.relayStageDebug.forceClear();
    });

    try {
      await waitForOverlay(page, "ALL CLEAR");
      break;
    } catch (error) {
      // Another stage should load next; continue the loop.
    }
  }

  const allClearCount = await page.locator("#run-clear-count").textContent();
  const allClearCopy = await page.locator("#relay-overlay-copy").textContent();
  await page.screenshot({ path: path.join(outputDir, "main-host-flow-all-clear.png"), fullPage: true });

  await page.click("#relay-restart");
  const restartFrame = await waitForStageReady(page);
  const restartedStageId = await restartFrame.evaluate(() => window.relayStageMeta.id);
  const restartedClearCount = await page.locator("#run-clear-count").textContent();

  await restartFrame.evaluate(() => {
    window.relayStageDebug.forceFail();
  });
  await waitForOverlay(page, "GAME OVER");
  const gameOverCopy = await page.locator("#relay-overlay-copy").textContent();
  await page.screenshot({ path: path.join(outputDir, "main-host-flow-game-over.png"), fullPage: true });

  await browser.close();

  if (consoleErrors.length) {
    throw new Error(`Console errors detected during host flow check:\n${consoleErrors.join("\n")}`);
  }

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        visitedStageIds,
        restart: {
          stageId: restartedStageId,
          clearCount: restartedClearCount,
        },
        overlays: {
          allClearCount,
          allClearCopy,
          gameOverCopy,
        },
        screenshots: [
          path.relative(repoRoot, path.join(outputDir, "main-host-flow-all-clear.png")),
          path.relative(repoRoot, path.join(outputDir, "main-host-flow-game-over.png")),
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
