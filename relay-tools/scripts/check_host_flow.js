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

function findOverflowingElements(elements, viewportWidth, tolerance = 4) {
  return (elements || []).filter((entry) => {
    if (!entry) {
      return false;
    }
    return (
      Number(entry.left) < -tolerance ||
      Number(entry.right) > viewportWidth + tolerance ||
      Number(entry.width) > viewportWidth + tolerance
    );
  });
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

async function waitForModalState(page, modalSelector, expectedOpen) {
  await page.waitForFunction(
    ({ selector, open }) => document.querySelector(selector)?.dataset.open === String(open),
    { selector: modalSelector, open: expectedOpen ? "true" : "false" },
    { timeout: 4000 }
  );
}

async function readViewportMetrics(page) {
  return page.evaluate(() => {
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };
    const elements = Array.from(document.querySelectorAll("body *"))
      .filter((element) => {
        if (element.classList?.contains("sr-only")) {
          return false;
        }
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }
        const rect = element.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) {
          return false;
        }
        if (rect.bottom < -4 || rect.top > window.innerHeight + 4) {
          return false;
        }
        return true;
      })
      .slice(0, 120)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const id = element.id ? `#${element.id}` : "";
        const className = typeof element.className === "string"
          ? element.className
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((name) => `.${name}`)
              .join("")
          : "";
        return {
          tag: String(element.tagName || "").toLowerCase(),
          label: `${String(element.tagName || "").toLowerCase()}${id}${className}`,
          left: Number(rect.left.toFixed(1)),
          right: Number(rect.right.toFixed(1)),
          top: Number(rect.top.toFixed(1)),
          bottom: Number(rect.bottom.toFixed(1)),
          width: Number(rect.width.toFixed(1)),
          height: Number(rect.height.toFixed(1)),
        };
      });

    return {
      viewport,
      documentScrollWidth: document.documentElement.scrollWidth,
      elements,
    };
  });
}

async function readContainerMetrics(page, selector) {
  return page.evaluate((targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) {
      return null;
    }
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return {
      left: Number(rect.left.toFixed(1)),
      right: Number(rect.right.toFixed(1)),
      top: Number(rect.top.toFixed(1)),
      bottom: Number(rect.bottom.toFixed(1)),
      width: Number(rect.width.toFixed(1)),
      height: Number(rect.height.toFixed(1)),
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
      overflowY: style.overflowY,
    };
  }, selector);
}

async function assertMobilePageFits(page, label, selector = null) {
  const metrics = await readViewportMetrics(page);
  const viewportWidth = Number(metrics.viewport.width) || 0;
  const viewportHeight = Number(metrics.viewport.height) || 0;

  if (Number(metrics.documentScrollWidth) > viewportWidth + 4) {
    throw new Error(
      `Mobile host layout overflows horizontally in ${label} state (${metrics.documentScrollWidth} > ${viewportWidth}).`
    );
  }

  const overflowingElements = findOverflowingElements(metrics.elements, viewportWidth);
  if (overflowingElements.length) {
    const sample = overflowingElements
      .slice(0, 4)
      .map((entry) => entry.label || entry.tag || "unknown")
      .join(", ");
    throw new Error(`Mobile host layout has overflowing elements in ${label} state (${sample}).`);
  }

  let containerMetrics = null;
  if (selector) {
    containerMetrics = await readContainerMetrics(page, selector);
    if (!containerMetrics) {
      throw new Error(`Mobile host container not found for ${label}: ${selector}`);
    }

    if (containerMetrics.left < -4 || containerMetrics.right > viewportWidth + 4) {
      throw new Error(`Mobile host container exceeds viewport width in ${label} state.`);
    }

    const overflowsVertically = containerMetrics.bottom > viewportHeight + 4;
    const canScrollInternally =
      /auto|scroll/.test(containerMetrics.overflowY || "") &&
      containerMetrics.scrollHeight > containerMetrics.clientHeight + 4;
    if (overflowsVertically && !canScrollInternally) {
      throw new Error(`Mobile host container is clipped vertically in ${label} state.`);
    }
  }

  return {
    metrics,
    container: containerMetrics,
  };
}

async function runMobileChecks(browser, baseUrl, outputDir, consoleErrors) {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });

  const home = await assertMobilePageFits(page, "home");
  const homeScreenshot = path.join(outputDir, "main-host-mobile-home.png");
  await page.screenshot({ path: homeScreenshot, fullPage: false });

  await page.click("#open-prompt");
  await waitForModalState(page, "#prompt-modal", true);
  const prompt = await assertMobilePageFits(page, "prompt modal", "#prompt-modal [role='dialog']");
  const promptScreenshot = path.join(outputDir, "main-host-mobile-prompt.png");
  await page.screenshot({ path: promptScreenshot, fullPage: false });
  await page.click("#close-prompt");
  await waitForModalState(page, "#prompt-modal", false);

  await page.click("#open-leaderboard");
  await waitForModalState(page, "#leaderboard-modal", true);
  await page.waitForTimeout(250);
  const leaderboard = await assertMobilePageFits(
    page,
    "leaderboard modal",
    "#leaderboard-modal [role='dialog']"
  );
  const leaderboardScreenshot = path.join(outputDir, "main-host-mobile-leaderboard.png");
  await page.screenshot({ path: leaderboardScreenshot, fullPage: false });
  await page.click("#close-leaderboard");
  await waitForModalState(page, "#leaderboard-modal", false);

  const frame = await waitForStageReady(page);
  await frame.evaluate(() => {
    window.relayStageDebug.forceFail();
  });
  await waitForOverlay(page, "GAME OVER");
  const gameOver = await assertMobilePageFits(
    page,
    "game over overlay",
    "#relay-overlay .relay-overlay-card"
  );
  const gameOverScreenshot = path.join(outputDir, "main-host-mobile-game-over.png");
  await page.screenshot({ path: gameOverScreenshot, fullPage: false });

  await page.close();

  return {
    layouts: {
      home,
      prompt,
      leaderboard,
      gameOver,
    },
    screenshots: [
      homeScreenshot,
      promptScreenshot,
      leaderboardScreenshot,
      gameOverScreenshot,
    ],
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = path.resolve(__dirname, "../..");
  const outputDir = path.join(repoRoot, "output", "relay-tools");
  const baseUrl = (args["base-url"] || "http://series-game.localhost:1355").replace(/\/$/, "");
  const includeMobile = Boolean(args.mobile);

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
  const allClearScreenshot = path.join(outputDir, "main-host-flow-all-clear.png");
  await page.screenshot({ path: allClearScreenshot, fullPage: true });

  await page.click("#relay-restart");
  const restartFrame = await waitForStageReady(page);
  const restartedStageId = await restartFrame.evaluate(() => window.relayStageMeta.id);
  const restartedClearCount = await page.locator("#run-clear-count").textContent();

  await restartFrame.evaluate(() => {
    window.relayStageDebug.forceFail();
  });
  await waitForOverlay(page, "GAME OVER");
  const gameOverCopy = await page.locator("#relay-overlay-copy").textContent();
  const gameOverScreenshot = path.join(outputDir, "main-host-flow-game-over.png");
  await page.screenshot({ path: gameOverScreenshot, fullPage: true });

  await page.close();

  const mobile = includeMobile
    ? await runMobileChecks(browser, baseUrl, outputDir, consoleErrors)
    : null;

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
        mobile,
        screenshots: [
          path.relative(repoRoot, allClearScreenshot),
          path.relative(repoRoot, gameOverScreenshot),
          ...(mobile
            ? mobile.screenshots.map((screenshotPath) => path.relative(repoRoot, screenshotPath))
            : []),
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
