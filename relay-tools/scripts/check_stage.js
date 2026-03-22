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

function resolveChromiumLaunchOptions() {
  const launchOptions = {
    headless: true,
    args: ["--disable-gpu", "--single-process", "--no-zygote", "--renderer-process-limit=1"],
  };
  const candidates = [
    process.env.PLAYWRIGHT_CHROME_EXECUTABLE,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      launchOptions.executablePath = candidate;
      break;
    }
  }

  return launchOptions;
}

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

function assertStageSourceIncludesMetaText(stageSource, stageMeta) {
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
}

function assertStageSourceIncludesMobileSupport(stageSource, stageMeta) {
  const hasMobileInputHook = /touchstart|pointerdown/.test(stageSource);
  const hasTouchCopy = /화면\s*터치|터치\s*또는|터치로|화면\s*버튼|모바일/.test(stageSource);

  if (!hasMobileInputHook) {
    throw new Error(
      `Stage source must include touchstart or pointerdown mobile input for stage: ${stageMeta.id}`
    );
  }
  if (!hasTouchCopy) {
    throw new Error(
      `Stage source must mention touch/mobile controls in stage copy for stage: ${stageMeta.id}`
    );
  }
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

function parseStageRenderText(renderedText) {
  if (typeof renderedText !== "string" || !renderedText.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(renderedText);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    return null;
  }
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

function assertMobileLayoutMetrics(layoutMetrics, stageMeta, label) {
  if (!layoutMetrics || !layoutMetrics.viewport) {
    throw new Error(`Missing mobile layout metrics for stage: ${stageMeta.id} (${label})`);
  }

  const viewportWidth = Number(layoutMetrics.viewport.width) || 0;
  const viewportHeight = Number(layoutMetrics.viewport.height) || 0;
  const documentScrollWidth = Number(layoutMetrics.documentScrollWidth) || 0;
  const overflowingElements = findOverflowingElements(
    layoutMetrics.elements,
    viewportWidth
  );

  if (documentScrollWidth > viewportWidth + 4) {
    throw new Error(
      `Mobile layout overflows horizontally in ${label} state for stage: ${stageMeta.id} (scrollWidth ${documentScrollWidth} > viewport ${viewportWidth})`
    );
  }

  if (overflowingElements.length) {
    const sample = overflowingElements
      .slice(0, 4)
      .map((entry) => entry.label || entry.tag || "unknown")
      .join(", ");
    throw new Error(
      `Mobile layout has overflowing elements in ${label} state for stage: ${stageMeta.id} (${sample})`
    );
  }

  const canvas = layoutMetrics.canvas;
  if (!canvas) {
    throw new Error(`Mobile canvas metrics missing for stage: ${stageMeta.id} (${label})`);
  }

  if (Number(canvas.width) < viewportWidth * 0.75) {
    throw new Error(
      `Mobile canvas is too narrow in ${label} state for stage: ${stageMeta.id}`
    );
  }

  if (Number(canvas.height) < Math.min(220, viewportHeight * 0.35)) {
    throw new Error(
      `Mobile canvas is too short in ${label} state for stage: ${stageMeta.id}`
    );
  }
}

function stageThumbnailPath(repoRoot, stageDir) {
  return path.join(repoRoot, "community-stages", stageDir, "thumbnail.png");
}

async function withBrowser(chromium, task) {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let browser = null;
    try {
      browser = await chromium.launch(resolveChromiumLaunchOptions());
      return await task(browser);
    } catch (error) {
      lastError = error;
      const message = String(error?.message || error || "");
      const isRetriable =
        /Target page, context or browser has been closed|Target closed|browser\.newPage|browserType\.launch/.test(
          message
        );
      if (!isRetriable || attempt === 3) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }
  throw lastError;
}

async function captureGameplayThumbnail({ page, stageUrl, repoRoot, stageMeta }) {
  await page.goto(stageUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(150);

  const canvas = page.locator("#game");
  if ((await canvas.count()) === 0) {
    throw new Error(`Stage canvas #game not found for thumbnail capture: ${stageMeta.id}`);
  }

  const readSnapshot = async () =>
    parseStageRenderText(
      await page.evaluate(() =>
        typeof window.render_game_to_text === "function" ? window.render_game_to_text() : null
      )
    );

  const startStage = async (frames) => {
    await canvas.click({ position: { x: 24, y: 24 } }).catch(() => {});
    await page.keyboard.press("Enter").catch(() => {});
    await page.waitForTimeout(80);
    await page.evaluate((frameCount) => {
      if (typeof window.advanceTime === "function") {
        for (let index = 0; index < frameCount; index += 1) {
          window.advanceTime(1000 / 60);
        }
      }
    }, frames);
    await page.waitForTimeout(40);
  };

  let snapshot = await readSnapshot();
  if (!snapshot || snapshot.mode === "menu") {
    await startStage(6);
    snapshot = await readSnapshot();
  }

  if (!snapshot || snapshot.mode === "menu") {
    await startStage(1);
    snapshot = await readSnapshot();
  }

  if (!snapshot || snapshot.mode !== "running") {
    throw new Error(
      `Auto thumbnail capture requires a running gameplay scene, but stage stayed in "${snapshot?.mode || "unknown"}": ${stageMeta.id}`
    );
  }

  const thumbnailPath = stageThumbnailPath(repoRoot, stageMeta.dir);
  await canvas.screenshot({ path: thumbnailPath });
  return thumbnailPath;
}

async function safePageScreenshot(page, options) {
  try {
    await page.screenshot(options);
    return true;
  } catch (error) {
    const message = String(error?.message || error || "");
    if (/Target page, context or browser has been closed|Target closed/.test(message)) {
      return false;
    }
    throw error;
  }
}

async function captureMobileStageState({ browser, stageUrl, outputDir, stageMeta, consoleErrors }) {
  const mobilePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobilePage.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  const readLayoutMetrics = async () =>
    mobilePage.evaluate(() => {
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const canvas = document.querySelector("#game");
      const canvasRect = canvas
        ? (() => {
            const rect = canvas.getBoundingClientRect();
            return {
              left: Number(rect.left.toFixed(1)),
              right: Number(rect.right.toFixed(1)),
              top: Number(rect.top.toFixed(1)),
              bottom: Number(rect.bottom.toFixed(1)),
              width: Number(rect.width.toFixed(1)),
              height: Number(rect.height.toFixed(1)),
            };
          })()
        : null;
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
        .slice(0, 80)
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
        canvas: canvasRect,
        elements,
      };
    });

  await mobilePage.goto(stageUrl, { waitUntil: "networkidle" });
  const canvas = mobilePage.locator("#game");
  await canvas.waitFor({ state: "visible" });

  const readSnapshot = async () =>
    parseStageRenderText(
      await mobilePage.evaluate(() =>
        typeof window.render_game_to_text === "function" ? window.render_game_to_text() : null
      )
    );

  const tapToStart = async (frames) => {
    await canvas.tap({ position: { x: 24, y: 24 } }).catch(() => {});
    await mobilePage.waitForTimeout(90);
    await mobilePage.evaluate((frameCount) => {
      if (typeof window.advanceTime === "function") {
        for (let index = 0; index < frameCount; index += 1) {
          window.advanceTime(1000 / 60);
        }
      }
    }, frames);
    await mobilePage.waitForTimeout(40);
  };

  const menuScreenshotPath = path.join(outputDir, `${stageMeta.dir}-mobile-menu.png`);
  await safePageScreenshot(mobilePage, { path: menuScreenshotPath, fullPage: true });
  const menuLayout = await readLayoutMetrics();
  assertMobileLayoutMetrics(menuLayout, stageMeta, "menu");

  let snapshot = await readSnapshot();
  if (!snapshot || snapshot.mode === "menu") {
    await tapToStart(6);
    snapshot = await readSnapshot();
  }
  if (!snapshot || snapshot.mode === "menu") {
    await tapToStart(1);
    snapshot = await readSnapshot();
  }

  if (!snapshot || snapshot.mode !== "running") {
    throw new Error(
      `Mobile touch start failed to enter running state for stage: ${stageMeta.id} (got "${snapshot?.mode || "unknown"}")`
    );
  }

  const runningScreenshotPath = path.join(outputDir, `${stageMeta.dir}-mobile-running.png`);
  await safePageScreenshot(mobilePage, { path: runningScreenshotPath, fullPage: true });
  const runningLayout = await readLayoutMetrics();
  assertMobileLayoutMetrics(runningLayout, stageMeta, "running");

  await mobilePage.evaluate(() => {
    window.relayStageDebug?.forceFail?.();
  });
  await mobilePage.waitForTimeout(120);

  const failedSnapshot = await readSnapshot();
  if (!failedSnapshot || failedSnapshot.mode !== "failed") {
    throw new Error(`Mobile forceFail did not enter failed state for stage: ${stageMeta.id}`);
  }

  const failedScreenshotPath = path.join(outputDir, `${stageMeta.dir}-mobile-failed.png`);
  await safePageScreenshot(mobilePage, { path: failedScreenshotPath, fullPage: true });
  const failedLayout = await readLayoutMetrics();
  assertMobileLayoutMetrics(failedLayout, stageMeta, "failed");

  await mobilePage.close();

  return {
    text: JSON.stringify(snapshot),
    layouts: {
      menu: menuLayout,
      running: runningLayout,
      failed: failedLayout,
    },
    screenshotPaths: [menuScreenshotPath, runningScreenshotPath, failedScreenshotPath],
  };
}

async function main() {
  const { chromium } = loadPlaywright();
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
  assertStageSourceIncludesMetaText(stageSource, stageMeta);
  assertStageSourceIncludesMobileSupport(stageSource, stageMeta);

  fs.mkdirSync(outputDir, { recursive: true });

  const launcherUrl = `${baseUrl}/community-stages/index.html`;
  const stageUrl = `${baseUrl}/community-stages/${stageMeta.dir}/index.html`;
  const consoleErrors = [];

  const {
    launcherCount,
    directChecks,
    thumbnailPath,
  } = await withBrowser(chromium, async (browser) => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(launcherUrl, { waitUntil: "networkidle" });
    const nextLauncherCount = await page.locator(`text=${stageMeta.title}`).count();
    await safePageScreenshot(page, {
      path: path.join(outputDir, `${stageMeta.dir}-launcher.png`),
      fullPage: true,
    });

    await page.goto(stageUrl, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    const nextDirectChecks = await page.evaluate(() => ({
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
    await safePageScreenshot(page, {
      path: path.join(outputDir, `${stageMeta.dir}-direct.png`),
      fullPage: true,
    });
    const nextThumbnailPath = await captureGameplayThumbnail({
      page,
      stageUrl,
      repoRoot,
      stageMeta,
    });

    return {
      launcherCount: nextLauncherCount,
      directChecks: nextDirectChecks,
      thumbnailPath: nextThumbnailPath,
    };
  });

  const mobileChecks = await withBrowser(chromium, async (browser) =>
    captureMobileStageState({
      browser,
      stageUrl,
      outputDir,
      stageMeta,
      consoleErrors,
    })
  );

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

  const { clearEvents, failEvents } = await withBrowser(chromium, async (browser) => {
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
      await frame.evaluate((nextActionName) => {
        window.relayStageDebug[nextActionName]();
      }, actionName);
      await hostPage.waitForTimeout(250);
      return hostPage.evaluate(() => window.__relayHostEvents);
    }

    const nextClearEvents = await runHostCase("stage-clear", "forceClear");
    const nextFailEvents = await runHostCase("stage-fail", "forceFail");

    await safePageScreenshot(hostPage, {
      path: path.join(outputDir, `${stageMeta.dir}-host.png`),
      fullPage: true,
    });

    return { clearEvents: nextClearEvents, failEvents: nextFailEvents };
  });

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
        mobileChecks: {
          text: mobileChecks.text,
          layouts: mobileChecks.layouts,
        },
        host: {
          clearEvents,
          failEvents,
        },
        screenshots: [
          path.relative(repoRoot, path.join(outputDir, `${stageMeta.dir}-launcher.png`)),
          path.relative(repoRoot, path.join(outputDir, `${stageMeta.dir}-direct.png`)),
          ...mobileChecks.screenshotPaths.map((screenshotPath) => path.relative(repoRoot, screenshotPath)),
          path.relative(repoRoot, path.join(outputDir, `${stageMeta.dir}-host.png`)),
        ],
        thumbnail: path.relative(repoRoot, thumbnailPath),
      },
      null,
      2
    ) + "\n"
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  assertMobileLayoutMetrics,
  assertStageSourceIncludesMobileSupport,
  assertStageSourceIncludesMetaText,
  findOverflowingElements,
  parseArgs,
  parseChangedStageSlugs,
  parseStageRenderText,
  resolveStageSlug,
  stageThumbnailPath,
};
