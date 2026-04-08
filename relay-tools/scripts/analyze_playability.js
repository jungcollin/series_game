#!/usr/bin/env node

const path = require("path");
const { execFileSync } = require("child_process");
const { loadAllStageMetas } = require("./stage_metadata");
const {
  buildAgentProfile,
  extractSecondsFromText,
  listAgentProfiles,
} = require("./playability_profiles");

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

async function launchBrowser(chromium) {
  const attempts = [
    { headless: true, channel: "chrome", args: ["--disable-gpu"] },
    { headless: true, args: ["--disable-gpu"] },
  ];

  const errors = [];
  for (const options of attempts) {
    let browser = null;
    try {
      browser = await chromium.launch(options);
      return browser;
    } catch (error) {
      errors.push(error.message);
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  throw new Error(`Failed to launch Playwright browser: ${errors.join(" | ")}`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeMode(mode, relayStatus) {
  const raw = String(mode || relayStatus || "").trim().toLowerCase();
  if (!raw) {
    return "unknown";
  }
  if (raw.includes("clear")) {
    return "cleared";
  }
  if (raw.includes("fail") || raw.includes("over")) {
    return "failed";
  }
  if (raw.includes("menu") || raw.includes("ready")) {
    return "menu";
  }
  if (raw.includes("run")) {
    return "running";
  }
  return raw;
}

function readStageSecondsFromMeta(meta) {
  if (Number.isFinite(meta?.estimatedSeconds) && meta.estimatedSeconds > 0) {
    return Number(meta.estimatedSeconds);
  }
  const clearSeconds = extractSecondsFromText(meta?.clearCondition);
  if (clearSeconds) {
    return clearSeconds;
  }
  const failSeconds = extractSecondsFromText(meta?.failCondition);
  if (failSeconds) {
    return failSeconds;
  }
  return 20;
}

function computeQuickRisk(quickResult, quickSeconds) {
  let score = 0;
  if (quickResult.navigationError) {
    score += 120;
  }
  score += (quickResult.runtimeErrors?.length || 0) * 45;
  score += (quickResult.consoleErrors?.length || 0) * 18;

  if (quickResult.finalMode === "failed") {
    score += quickResult.finishedSeconds <= quickSeconds * 0.6 ? 34 : 20;
  } else if (quickResult.finalMode === "menu") {
    score += 24;
  } else if (quickResult.finalMode === "running") {
    score += 12;
  }

  return score;
}

function classifyFailureSignal(run, targetSeconds) {
  const safeTargetSeconds = Math.max(1, Number(targetSeconds) || 20);
  const finishedSeconds = Number.isFinite(run?.finishedSeconds) ? run.finishedSeconds : 0;
  const ratio = finishedSeconds / safeTargetSeconds;

  const issue =
    run.navigationError
      ? "navigation_error"
      : (run.runtimeErrors?.length || 0) > 0
        ? "runtime_error"
        : (run.consoleErrors?.length || 0) > 0
          ? "console_error"
          : (run.parseErrors?.length || 0) > 0
            ? "snapshot_error"
            : run.finalMode === "failed"
              ? "gameplay_fail"
              : run.finalMode === "menu"
                ? "stuck_menu"
                : run.finalMode === "running"
                  ? "timed_out"
                  : run.finalMode === "cleared"
                    ? "cleared"
                    : "unknown";

  if (run.finalMode !== "failed") {
    return {
      issue,
      earlyFail: false,
      catastrophicFail: false,
      failWindow: "none",
    };
  }

  const catastrophicThreshold = Math.min(4, safeTargetSeconds * 0.25);
  if (finishedSeconds <= catastrophicThreshold) {
    return {
      issue,
      earlyFail: true,
      catastrophicFail: true,
      failWindow: "catastrophic",
    };
  }
  if (ratio < 0.5) {
    return {
      issue,
      earlyFail: true,
      catastrophicFail: false,
      failWindow: "early",
    };
  }
  if (ratio < 0.85) {
    return {
      issue,
      earlyFail: false,
      catastrophicFail: false,
      failWindow: "mid",
    };
  }
  return {
    issue,
    earlyFail: false,
    catastrophicFail: false,
    failWindow: "late",
  };
}

function summarizeProfileRuns(runs, targetSeconds = 20) {
  const attempts = runs.length;
  const clears = runs.filter((run) => run.finalMode === "cleared").length;
  const fails = runs.filter((run) => run.finalMode === "failed").length;
  const stuck = runs.filter(
    (run) => run.finalMode !== "cleared" && run.finalMode !== "failed"
  ).length;
  const parseErrors = runs.reduce((sum, run) => sum + (run.parseErrors?.length || 0), 0);
  const totalErrors = runs.reduce((sum, run) => {
    return (
      sum +
      (run.runtimeErrors?.length || 0) +
      (run.consoleErrors?.length || 0) +
      (run.parseErrors?.length || 0)
    );
  }, 0);

  const clearFinishes = runs
    .filter((run) => run.finalMode === "cleared")
    .map((run) => run.finishedSeconds);
  const failFinishes = runs
    .filter((run) => run.finalMode === "failed")
    .map((run) => run.finishedSeconds);

  const avg = (values) => {
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const issueCounts = {};
  let earlyFails = 0;
  let catastrophicFails = 0;
  for (const run of runs) {
    const signal = classifyFailureSignal(run, targetSeconds);
    issueCounts[signal.issue] = (issueCounts[signal.issue] || 0) + 1;
    if (signal.earlyFail) {
      earlyFails += 1;
    }
    if (signal.catastrophicFail) {
      catastrophicFails += 1;
    }
  }

  return {
    attempts,
    clears,
    fails,
    stuck,
    clearRate: attempts ? clears / attempts : 0,
    failRate: attempts ? fails / attempts : 0,
    avgClearSeconds: avg(clearFinishes),
    avgFailSeconds: avg(failFinishes),
    earlyFails,
    catastrophicFails,
    earlyFailRate: attempts ? earlyFails / attempts : 0,
    catastrophicFailRate: attempts ? catastrophicFails / attempts : 0,
    issueCounts,
    parseErrors,
    totalErrors,
  };
}

function classifyDifficulty(stageSummary) {
  if (stageSummary.totalErrors > 0) {
    return "broken";
  }
  if (stageSummary.noviceClearRate >= 0.55) {
    return "appropriate";
  }
  if (stageSummary.noviceClearRate >= 0.3 && stageSummary.noviceEarlyFailRate < 0.55) {
    return "hard";
  }
  return "very-hard";
}

function resolveStageTargets(metas, stageArg) {
  if (!stageArg) {
    return metas;
  }

  const candidates = String(stageArg)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!candidates.length) {
    return metas;
  }

  const selected = [];
  for (const candidate of candidates) {
    const found = metas.find((meta) => meta.id === candidate || meta.dir === candidate);
    if (!found) {
      throw new Error(`Unknown stage id or dir: ${candidate}`);
    }
    if (!selected.includes(found)) {
      selected.push(found);
    }
  }
  return selected;
}

async function readStageSnapshot(page) {
  const snapshot = await page.evaluate(() => {
    let raw = null;
    let parsed = null;
    let parseError = null;

    try {
      if (typeof window.render_game_to_text === "function") {
        raw = window.render_game_to_text();
      }
    } catch (error) {
      parseError = `render_game_to_text error: ${error.message}`;
    }

    if (typeof raw === "string") {
      try {
        parsed = JSON.parse(raw);
      } catch (error) {
        parseError = `render_game_to_text parse error: ${error.message}`;
      }
    } else if (raw && typeof raw === "object") {
      parsed = raw;
      raw = JSON.stringify(raw);
    }

    const relayStatus =
      window.relayStageResult && typeof window.relayStageResult.status === "string"
        ? window.relayStageResult.status
        : null;

    return {
      raw,
      parsed,
      parseError,
      relayStatus,
      hasAdvanceTime: typeof window.advanceTime === "function",
      hasRenderGameToText: typeof window.render_game_to_text === "function",
    };
  });

  return {
    ...snapshot,
    mode: normalizeMode(snapshot.parsed?.mode, snapshot.relayStatus),
  };
}

async function stepStage(page, stepMs) {
  const hasAdvanceTime = await page.evaluate(() => typeof window.advanceTime === "function");
  if (hasAdvanceTime) {
    await page.evaluate((ms) => {
      try {
        window.advanceTime(ms);
      } catch (error) {
        // The attempt summary captures downstream snapshot errors.
      }
    }, stepMs);
    return readStageSnapshot(page);
  }

  await page.waitForTimeout(stepMs);
  return readStageSnapshot(page);
}

async function getCanvasBox(page) {
  const box = await page.evaluate(() => {
    const canvas = document.querySelector("#game, canvas");
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      width: rect.width,
      height: rect.height,
      left: rect.left,
      top: rect.top,
    };
  });
  return box;
}

function createInputState() {
  return {
    moveKey: null,
    moveHoldTicksRemaining: 0,
    moveDirectionIndex: 0,
    jumpKeyIndex: 0,
    shootHoldTicksRemaining: 0,
    lastFlightFlapTick: -9999,
  };
}

async function releaseInputState(page, inputState) {
  if (!inputState) {
    return;
  }
  if (inputState.moveKey) {
    await page.keyboard.up(inputState.moveKey).catch(() => {});
    inputState.moveKey = null;
  }
  if (inputState.shootHoldTicksRemaining > 0) {
    await page.keyboard.up("Space").catch(() => {});
    inputState.shootHoldTicksRemaining = 0;
  }
}

async function startStage(page, canvasBox, profile) {
  const repeats = Math.max(1, Math.floor(profile?.startTapRepeats || 1));
  await page.evaluate(() => {
    const canvas = document.querySelector("#game, canvas");
    canvas?.focus?.();
  });
  await page.keyboard.press("Enter").catch(() => {});
  await page.keyboard.press("Space").catch(() => {});
  if (canvasBox) {
    for (let index = 0; index < repeats; index += 1) {
      await tapCanvas(page, canvasBox, index);
      await dispatchSyntheticTouchTap(page, canvasBox, index);
    }
  }
}

const TAP_PATTERN = [
  { x: 0.25, y: 0.65 },
  { x: 0.75, y: 0.65 },
  { x: 0.5, y: 0.35 },
  { x: 0.5, y: 0.75 },
];

const SWIPE_PATTERN = [
  { sx: 0.2, sy: 0.66, ex: 0.82, ey: 0.66 },
  { sx: 0.82, sy: 0.66, ex: 0.2, ey: 0.66 },
  { sx: 0.5, sy: 0.82, ex: 0.5, ey: 0.22 },
  { sx: 0.5, sy: 0.22, ex: 0.5, ey: 0.82 },
];

function resolveTapPoint(canvasBox, patternIndex) {
  if (!canvasBox) {
    return null;
  }
  const point = TAP_PATTERN[patternIndex % TAP_PATTERN.length];
  return {
    x: canvasBox.left + canvasBox.width * point.x,
    y: canvasBox.top + canvasBox.height * point.y,
  };
}

function resolveSwipePoints(canvasBox, patternIndex) {
  if (!canvasBox) {
    return null;
  }
  const point = SWIPE_PATTERN[patternIndex % SWIPE_PATTERN.length];
  return {
    startX: canvasBox.left + canvasBox.width * point.sx,
    startY: canvasBox.top + canvasBox.height * point.sy,
    endX: canvasBox.left + canvasBox.width * point.ex,
    endY: canvasBox.top + canvasBox.height * point.ey,
  };
}

async function tapCanvas(page, canvasBox, patternIndex) {
  const point = resolveTapPoint(canvasBox, patternIndex);
  if (!point) {
    return;
  }
  await page.mouse.click(point.x, point.y).catch(() => {});
}

async function dispatchSyntheticTouchTap(page, canvasBox, patternIndex) {
  const point = resolveTapPoint(canvasBox, patternIndex);
  if (!point) {
    return;
  }
  await page
    .evaluate(({ x, y }) => {
      const canvas = document.querySelector("#game, canvas");
      if (!canvas) {
        return;
      }
      const pointerInit = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        pointerType: "touch",
        isPrimary: true,
      };
      canvas.dispatchEvent(new PointerEvent("pointerdown", pointerInit));
      canvas.dispatchEvent(new PointerEvent("pointerup", pointerInit));
      canvas.dispatchEvent(new MouseEvent("mousedown", pointerInit));
      canvas.dispatchEvent(new MouseEvent("mouseup", pointerInit));
      canvas.dispatchEvent(new MouseEvent("click", pointerInit));
    }, point)
    .catch(() => {});
}

async function dragCanvas(page, canvasBox, patternIndex, syntheticTouch) {
  const points = resolveSwipePoints(canvasBox, patternIndex);
  if (!points) {
    return;
  }

  try {
    await page.mouse.move(points.startX, points.startY);
    await page.mouse.down();
    await page.mouse.move(points.endX, points.endY, { steps: 5 });
    await page.mouse.up();
  } catch (error) {
    // Ignore flaky drag errors per-attempt and continue.
  }

  if (syntheticTouch) {
    await page
      .evaluate(({ startX, startY, endX, endY }) => {
        const canvas = document.querySelector("#game, canvas");
        if (!canvas) {
          return;
        }
        const pointerDown = {
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          isPrimary: true,
          clientX: startX,
          clientY: startY,
        };
        canvas.dispatchEvent(new PointerEvent("pointerdown", pointerDown));
        canvas.dispatchEvent(
          new PointerEvent("pointermove", {
            ...pointerDown,
            clientX: (startX + endX) / 2,
            clientY: (startY + endY) / 2,
          })
        );
        canvas.dispatchEvent(
          new PointerEvent("pointerup", {
            ...pointerDown,
            clientX: endX,
            clientY: endY,
          })
        );
      }, points)
      .catch(() => {});
  }
}

async function applyAgentInputs(page, profile, tickIndex, canvasBox, inputState, snapshot) {
  if (!profile.activityScale || profile.activityScale <= 0) {
    return;
  }

  if (inputState.moveHoldTicksRemaining > 0) {
    inputState.moveHoldTicksRemaining -= 1;
    if (inputState.moveHoldTicksRemaining <= 0 && inputState.moveKey) {
      await page.keyboard.up(inputState.moveKey).catch(() => {});
      inputState.moveKey = null;
    }
  }

  if (inputState.shootHoldTicksRemaining > 0) {
    inputState.shootHoldTicksRemaining -= 1;
    if (inputState.shootHoldTicksRemaining <= 0) {
      await page.keyboard.up("Space").catch(() => {});
    }
  }

  if (profile.moveEveryTicks > 0 && tickIndex % profile.moveEveryTicks === 0) {
    const keys = profile.horizontalKeys || [];
    if (keys.length) {
      const key = keys[inputState.moveDirectionIndex % keys.length];
      inputState.moveDirectionIndex += 1;

      if (inputState.moveKey && inputState.moveKey !== key) {
        await page.keyboard.up(inputState.moveKey).catch(() => {});
      }
      if (inputState.moveKey !== key) {
        await page.keyboard.down(key).catch(() => {});
      }
      inputState.moveKey = key;
      inputState.moveHoldTicksRemaining = Math.max(1, profile.moveHoldTicks || 1);
    }
  }

  if (profile.archetype === "flight") {
    const parsed = snapshot?.parsed || {};
    const birdY = Number(parsed.bird_y);
    const birdVelocity = Number(parsed.bird_velocity);
    const viewHeight = Number(parsed.view_height) || 540;
    const lowerBand = viewHeight * 0.62;
    const middleBand = viewHeight * 0.52;

    let shouldFlap = false;
    if (Number.isFinite(birdY)) {
      if (birdY >= lowerBand) {
        shouldFlap = true;
      } else if (birdY >= middleBand && Number.isFinite(birdVelocity) && birdVelocity > 120) {
        shouldFlap = true;
      }
    }

    if (shouldFlap && tickIndex - inputState.lastFlightFlapTick >= 1) {
      const keys = profile.jumpKeys || ["Space"];
      const key = keys[inputState.jumpKeyIndex % keys.length];
      inputState.jumpKeyIndex += 1;
      await page.keyboard.press(key).catch(() => {});
      if (profile.preferTouch) {
        await tapCanvas(page, canvasBox, tickIndex);
        await dispatchSyntheticTouchTap(page, canvasBox, tickIndex);
      }
      inputState.lastFlightFlapTick = tickIndex;
    }
  }

  if (
    profile.jumpEveryTicks > 0 &&
    tickIndex % profile.jumpEveryTicks === 0 &&
    profile.archetype !== "flight"
  ) {
    const keys = profile.jumpKeys || [];
    if (keys.length) {
      const key = keys[inputState.jumpKeyIndex % keys.length];
      inputState.jumpKeyIndex += 1;
      await page.keyboard.press(key).catch(() => {});
    }
  }

  if (profile.shootEveryTicks > 0 && tickIndex % profile.shootEveryTicks === 0) {
    const holdTicks = Math.max(1, profile.shootHoldTicks || 1);
    if (holdTicks > 1) {
      await page.keyboard.down("Space").catch(() => {});
      inputState.shootHoldTicksRemaining = holdTicks;
    } else {
      await page.keyboard.press("Space").catch(() => {});
    }
  }

  if (profile.tapEveryTicks > 0 && tickIndex % profile.tapEveryTicks === 0) {
    await tapCanvas(page, canvasBox, tickIndex);
    if (profile.preferTouch) {
      await dispatchSyntheticTouchTap(page, canvasBox, tickIndex);
    }
  }

  if (profile.dragEveryTicks > 0 && tickIndex % profile.dragEveryTicks === 0) {
    await dragCanvas(page, canvasBox, tickIndex, profile.preferTouch);
  }

  if (profile.swipeEveryTicks > 0 && tickIndex % profile.swipeEveryTicks === 0) {
    await dragCanvas(page, canvasBox, tickIndex + 1, profile.preferTouch);
  }
}

async function runSingleAttempt({
  browser,
  baseUrl,
  meta,
  profile,
  runSeconds,
  navigationTimeoutMs,
}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const inputState = createInputState();
  const runtimeErrors = [];
  const consoleErrors = [];
  let navigationError = null;

  page.on("pageerror", (error) => {
    runtimeErrors.push(String(error.message || error));
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  const stageUrl = `${baseUrl.replace(/\/$/, "")}/community-stages/${meta.dir}/index.html`;
  try {
    await page.goto(stageUrl, {
      waitUntil: "domcontentloaded",
      timeout: navigationTimeoutMs,
    });
  } catch (error) {
    navigationError = error.message;
  }

  let firstMode = "unknown";
  let finalMode = "unknown";
  let finishedSeconds = 0;
  let hasAdvanceTime = false;
  let hasRenderGameToText = false;
  let parseErrors = [];

  if (!navigationError) {
    const canvasBox = await getCanvasBox(page);
    await startStage(page, canvasBox, profile);

    const initialSnapshot = await readStageSnapshot(page);
    firstMode = initialSnapshot.mode;
    hasAdvanceTime = initialSnapshot.hasAdvanceTime;
    hasRenderGameToText = initialSnapshot.hasRenderGameToText;
    if (initialSnapshot.parseError) {
      parseErrors.push(initialSnapshot.parseError);
    }

    const stepMs = profile.stepMs;
    const maxSimulatedMs = Math.max(1000, Math.round(runSeconds * 1000));
    let simulatedMs = 0;
    let tickIndex = 0;
    let snapshot = initialSnapshot;

    while (simulatedMs < maxSimulatedMs) {
      if (snapshot.mode === "menu" && tickIndex < 5) {
        await startStage(page, canvasBox, profile);
      } else {
        await applyAgentInputs(page, profile, tickIndex, canvasBox, inputState, snapshot);
      }

      snapshot = await stepStage(page, stepMs);
      if (snapshot.parseError) {
        parseErrors.push(snapshot.parseError);
      }
      simulatedMs += stepMs;
      tickIndex += 1;

      if (snapshot.mode === "cleared" || snapshot.mode === "failed") {
        break;
      }
    }

    finalMode = snapshot.mode;
    finishedSeconds = Number((simulatedMs / 1000).toFixed(2));
  }

  await releaseInputState(page, inputState).catch(() => {});
  await page.close().catch(() => {});
  await context.close().catch(() => {});

  return {
    stageId: meta.id,
    stageDir: meta.dir,
    profileId: profile.id,
    runSeconds,
    url: stageUrl,
    firstMode,
    finalMode,
    finishedSeconds,
    navigationError,
    runtimeErrors,
    consoleErrors,
    parseErrors,
    hasAdvanceTime,
    hasRenderGameToText,
  };
}

function buildStageSummary(meta, profileRuns, options = {}) {
  const profileSummaries = {};
  let totalErrors = 0;
  const targetSeconds = readStageSecondsFromMeta(meta);
  const noviceTargetRate = Number.isFinite(options.noviceTargetRate)
    ? Math.max(0, Math.min(1, options.noviceTargetRate))
    : 0.55;
  const noviceMinAttempts = Number.isFinite(options.noviceMinAttempts)
    ? Math.max(1, Math.floor(options.noviceMinAttempts))
    : 1;

  for (const [profileId, runs] of Object.entries(profileRuns)) {
    const summary = summarizeProfileRuns(runs, targetSeconds);
    totalErrors += summary.totalErrors;
    profileSummaries[profileId] = summary;
  }

  const noviceSummary = profileSummaries.novice || {
    clearRate: 0,
    avgClearSeconds: null,
    avgFailSeconds: null,
    attempts: 0,
    earlyFailRate: 0,
    catastrophicFailRate: 0,
    issueCounts: {},
  };

  const difficultyTag = classifyDifficulty({
    noviceClearRate: noviceSummary.clearRate,
    noviceEarlyFailRate: noviceSummary.earlyFailRate,
    totalErrors,
  });

  let timeFit = "unknown";
  if (noviceSummary.clearRate >= noviceTargetRate && noviceSummary.avgClearSeconds !== null) {
    timeFit =
      noviceSummary.avgClearSeconds <= targetSeconds * 1.25 ? "fit" : "longer-than-expected";
  } else if (noviceSummary.earlyFailRate >= 0.5) {
    timeFit = "fails-too-early";
  } else if (noviceSummary.avgFailSeconds !== null) {
    timeFit =
      noviceSummary.avgFailSeconds < targetSeconds * 0.45 ? "fails-too-early" : "needs-practice";
  } else if (difficultyTag === "broken") {
    timeFit = "broken";
  }

  const acceptancePassed =
    noviceSummary.attempts >= noviceMinAttempts && noviceSummary.clearRate >= noviceTargetRate;

  return {
    stageId: meta.id,
    stageDir: meta.dir,
    title: meta.title,
    targetSeconds,
    estimatedSeconds: meta.estimatedSeconds,
    quickDifficulty: difficultyTag,
    timeFit,
    noviceClearRate: noviceSummary.clearRate,
    noviceEarlyFailRate: noviceSummary.earlyFailRate,
    noviceCatastrophicFailRate: noviceSummary.catastrophicFailRate,
    noviceIssueBreakdown: noviceSummary.issueCounts,
    totalErrors,
    acceptance: {
      noviceTargetRate,
      noviceMinAttempts,
      passed: acceptancePassed,
    },
    profileSummaries,
  };
}

async function runAnalysis(args) {
  const repoRoot = path.resolve(__dirname, "../..");
  const baseUrl = args["base-url"] || "http://127.0.0.1:4173";
  const quickSeconds = toNumber(args["quick-seconds"], 8);
  const deepLimit = Math.max(1, Math.floor(toNumber(args["deep-limit"], 10)));
  const attempts = Math.max(1, Math.floor(toNumber(args.attempts, 1)));
  const noviceTargetRate = Math.max(
    0,
    Math.min(1, toNumber(args["novice-target-rate"], 0.55))
  );
  const noviceMinAttempts = Math.max(
    1,
    Math.floor(toNumber(args["novice-min-attempts"], attempts))
  );
  const runSecondsOverride = toNumber(args["run-seconds"], null);
  const navigationTimeoutMs = Math.max(3000, toNumber(args["timeout-ms"], 12000));
  const explicitStages = Boolean(args.stage);
  const metas = resolveStageTargets(loadAllStageMetas(repoRoot), args.stage);
  const profileIds = (args.profiles ? String(args.profiles) : listAgentProfiles().join(","))
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const { chromium } = loadPlaywright();
  const browser = await launchBrowser(chromium);

  const quickRuns = [];
  try {
    for (const meta of metas) {
      const observer = buildAgentProfile(meta, "observer");
      const attempt = await runSingleAttempt({
        browser,
        baseUrl,
        meta,
        profile: observer,
        runSeconds: quickSeconds,
        navigationTimeoutMs,
      });
      const riskScore = computeQuickRisk(attempt, quickSeconds);
      quickRuns.push({
        ...attempt,
        riskScore,
      });
    }

    const deepCandidates = explicitStages
      ? quickRuns
      : [...quickRuns]
          .sort((left, right) => right.riskScore - left.riskScore)
          .slice(0, Math.min(deepLimit, quickRuns.length));

    const stageSummaries = [];
    for (const candidate of deepCandidates) {
      const meta = metas.find((entry) => entry.id === candidate.stageId);
      if (!meta) {
        continue;
      }

      const profileRuns = {};
      for (const profileId of profileIds) {
        const profile = buildAgentProfile(meta, profileId);
        const runSeconds = Number.isFinite(runSecondsOverride)
          ? runSecondsOverride
          : profile.runSeconds;
        profileRuns[profileId] = [];

        for (let index = 0; index < attempts; index += 1) {
          const attemptResult = await runSingleAttempt({
            browser,
            baseUrl,
            meta,
            profile,
            runSeconds,
            navigationTimeoutMs,
          });
          profileRuns[profileId].push(attemptResult);
        }
      }

      stageSummaries.push(
        buildStageSummary(meta, profileRuns, {
          noviceTargetRate,
          noviceMinAttempts,
        })
      );
    }

    const riskyTop = [...quickRuns]
      .sort((left, right) => right.riskScore - left.riskScore)
      .slice(0, Math.min(10, quickRuns.length))
      .map((entry) => ({
        stageId: entry.stageId,
        stageDir: entry.stageDir,
        riskScore: entry.riskScore,
        finalMode: entry.finalMode,
        runtimeErrors: entry.runtimeErrors.length,
        consoleErrors: entry.consoleErrors.length,
      }));

    const acceptancePassedCount = stageSummaries.filter((summary) => summary.acceptance?.passed)
      .length;

    return {
      generatedAt: new Date().toISOString(),
      baseUrl,
      profileIds,
      quickSeconds,
      attempts,
      noviceTargetRate,
      noviceMinAttempts,
      quickScanCount: quickRuns.length,
      deepScanCount: stageSummaries.length,
      acceptanceGate: {
        passedCount: acceptancePassedCount,
        total: stageSummaries.length,
        allPassed: stageSummaries.length > 0 && acceptancePassedCount === stageSummaries.length,
      },
      riskyTop,
      stageSummaries,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await runAnalysis(args);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    process.stdout.write(
      `${JSON.stringify(
        {
          ok: false,
          error: error.message,
        },
        null,
        2
      )}\n`
    );
    process.exit(1);
  });
}

module.exports = {
  classifyFailureSignal,
  classifyDifficulty,
  computeQuickRisk,
  normalizeMode,
  parseArgs,
  readStageSecondsFromMeta,
  resolveStageTargets,
  summarizeProfileRuns,
};
