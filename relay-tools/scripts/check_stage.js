#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
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

async function writeCanvasSnapshot({ page, selector = "#game", outputPath }) {
  const dataUrl = await page.evaluate((targetSelector) => {
    const canvas = document.querySelector(targetSelector);
    if (!canvas || typeof canvas.toDataURL !== "function") {
      return null;
    }
    return canvas.toDataURL("image/png");
  }, selector);

  if (!dataUrl || !dataUrl.startsWith("data:image/png;base64,")) {
    throw new Error(`Canvas snapshot failed for selector ${selector}`);
  }

  const base64 = dataUrl.slice("data:image/png;base64,".length);
  fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
  return outputPath;
}

function resolveChromiumExecutable(chromium) {
  const defaultPath = typeof chromium.executablePath === "function" ? chromium.executablePath() : null;
  const homeDir = os.homedir();
  const candidates = [
    path.join(
      homeDir,
      "Library/Caches/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-mac-arm64/chrome-headless-shell"
    ),
    path.join(
      homeDir,
      "Library/Caches/ms-playwright/chromium_headless_shell-1194/chrome-headless-shell-mac-arm64/chrome-headless-shell"
    ),
    defaultPath,
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || defaultPath;
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
  await writeCanvasSnapshot({ page, selector: "#game", outputPath: thumbnailPath });
  return thumbnailPath;
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
  await writeCanvasSnapshot({ page: mobilePage, selector: "#game", outputPath: menuScreenshotPath });
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
  await writeCanvasSnapshot({ page: mobilePage, selector: "#game", outputPath: runningScreenshotPath });
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
  await writeCanvasSnapshot({ page: mobilePage, selector: "#game", outputPath: failedScreenshotPath });
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
  const launcherSource = fs.readFileSync(path.join(repoRoot, "community-stages", "registry.js"), "utf8");
  const launcherCount = launcherSource.includes(stageMeta.title) ? 1 : 0;

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: resolveChromiumExecutable(chromium),
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
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
  const directScreenshotPath = path.join(outputDir, `${stageMeta.dir}-direct.png`);
  const thumbnailPath = stageThumbnailPath(repoRoot, stageMeta.dir);
  const mobileChecks = {
    text: null,
    layouts: null,
    screenshotPaths: [],
  };

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

  await browser.close();
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
        host: null,
        screenshots: fs.existsSync(directScreenshotPath)
          ? [path.relative(repoRoot, directScreenshotPath)]
          : [],
        thumbnail: fs.existsSync(thumbnailPath) ? path.relative(repoRoot, thumbnailPath) : null,
      },
      null,
      2
    ) + "\n"
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
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
