const PROFILE_PRESETS = {
  observer: {
    id: "observer",
    label: "Observer Agent",
    description: "Starts the stage and watches with no additional input.",
    activityScale: 0,
    stepMs: 240,
  },
  novice: {
    id: "novice",
    label: "Novice Agent",
    description: "Slow, forgiving input cadence intended to mimic first-time players.",
    activityScale: 1,
    stepMs: 220,
  },
  challenger: {
    id: "challenger",
    label: "Challenger Agent",
    description: "Higher APM stress profile to probe control responsiveness and edge pacing.",
    activityScale: 1.5,
    stepMs: 180,
  },
};

const ARCHETYPE_RULES = {
  shooter: {
    horizontalKeys: ["ArrowLeft", "ArrowRight"],
    jumpKeys: [],
    moveEveryTicks: 2,
    moveHoldTicks: 3,
    jumpEveryTicks: 0,
    shootEveryTicks: 2,
    shootHoldTicks: 1,
    tapEveryTicks: 8,
    dragEveryTicks: 0,
    swipeEveryTicks: 0,
    startTapRepeats: 2,
    preferTouch: false,
  },
  runner: {
    horizontalKeys: ["ArrowLeft", "ArrowRight"],
    jumpKeys: [],
    moveEveryTicks: 3,
    moveHoldTicks: 4,
    jumpEveryTicks: 0,
    shootEveryTicks: 0,
    shootHoldTicks: 0,
    tapEveryTicks: 10,
    dragEveryTicks: 0,
    swipeEveryTicks: 10,
    startTapRepeats: 2,
    preferTouch: false,
  },
  platformer: {
    horizontalKeys: ["ArrowLeft", "ArrowRight"],
    jumpKeys: ["Space", "ArrowUp"],
    moveEveryTicks: 3,
    moveHoldTicks: 3,
    jumpEveryTicks: 4,
    shootEveryTicks: 0,
    shootHoldTicks: 0,
    tapEveryTicks: 8,
    dragEveryTicks: 0,
    swipeEveryTicks: 0,
    startTapRepeats: 2,
    preferTouch: false,
  },
  dodger: {
    horizontalKeys: ["ArrowLeft", "ArrowRight"],
    jumpKeys: [],
    moveEveryTicks: 2,
    moveHoldTicks: 3,
    jumpEveryTicks: 0,
    shootEveryTicks: 0,
    shootHoldTicks: 0,
    tapEveryTicks: 7,
    dragEveryTicks: 0,
    swipeEveryTicks: 7,
    startTapRepeats: 2,
    preferTouch: false,
  },
  puzzle: {
    horizontalKeys: [],
    jumpKeys: [],
    moveEveryTicks: 0,
    moveHoldTicks: 0,
    jumpEveryTicks: 0,
    shootEveryTicks: 0,
    shootHoldTicks: 0,
    tapEveryTicks: 4,
    dragEveryTicks: 3,
    swipeEveryTicks: 3,
    startTapRepeats: 3,
    preferTouch: true,
  },
  flight: {
    horizontalKeys: [],
    jumpKeys: ["Space", "ArrowUp"],
    moveEveryTicks: 0,
    moveHoldTicks: 0,
    jumpEveryTicks: 0,
    shootEveryTicks: 0,
    shootHoldTicks: 0,
    tapEveryTicks: 0,
    dragEveryTicks: 0,
    swipeEveryTicks: 0,
    startTapRepeats: 3,
    preferTouch: true,
  },
  survival: {
    horizontalKeys: ["ArrowLeft", "ArrowRight"],
    jumpKeys: ["Space"],
    moveEveryTicks: 3,
    moveHoldTicks: 3,
    jumpEveryTicks: 8,
    shootEveryTicks: 0,
    shootHoldTicks: 0,
    tapEveryTicks: 8,
    dragEveryTicks: 0,
    swipeEveryTicks: 0,
    startTapRepeats: 2,
    preferTouch: false,
  },
};

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function extractSecondsFromText(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return null;
  }
  const match = normalized.match(/(\d+(?:\.\d+)?)\s*초/);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? seconds : null;
}

function inferGameArchetype(meta) {
  const combined = normalizeText(
    [
      meta?.genre,
      meta?.controls,
      meta?.title,
      meta?.description,
      meta?.clearCondition,
      meta?.failCondition,
    ].join(" ")
  );

  if (/(shooter|총|발사|boss|보스|bullet|탄)/.test(combined)) {
    return "shooter";
  }
  if (/(runner|역주행|lane|차선|race|racing)/.test(combined)) {
    return "runner";
  }
  if (/(platform|jump|점프|hurdle)/.test(combined)) {
    return "platformer";
  }
  if (/(dodger|dodge|피하|낙뢰|lightning|meteor|shape)/.test(combined)) {
    return "dodger";
  }
  if (/(puzzle|gravity|tilt|기울|shield|방패|조합)/.test(combined)) {
    return "puzzle";
  }
  if (/(bird|plane|flick|비행|fly)/.test(combined)) {
    return "flight";
  }
  return "survival";
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function recommendedRunSeconds(meta, options = {}) {
  const minSeconds = Number.isFinite(options.minSeconds) ? options.minSeconds : 12;
  const maxSeconds = Number.isFinite(options.maxSeconds) ? options.maxSeconds : 60;
  const multiplier = Number.isFinite(options.multiplier) ? options.multiplier : 1.25;
  const paddingSeconds = Number.isFinite(options.paddingSeconds) ? options.paddingSeconds : 4;

  let base = null;
  if (Number.isFinite(meta?.estimatedSeconds) && meta.estimatedSeconds > 0) {
    base = Number(meta.estimatedSeconds);
  }
  if (base === null) {
    const clearSeconds = extractSecondsFromText(meta?.clearCondition);
    const failSeconds = extractSecondsFromText(meta?.failCondition);
    base = clearSeconds || failSeconds || 20;
  }

  const runSeconds = Math.ceil(base * multiplier + paddingSeconds);
  return clamp(runSeconds, minSeconds, maxSeconds);
}

function scaleInterval(interval, activityScale) {
  if (!interval || !Number.isFinite(interval) || interval <= 0) {
    return 0;
  }
  if (!Number.isFinite(activityScale) || activityScale <= 0) {
    return 0;
  }
  return Math.max(1, Math.round(interval / activityScale));
}

function scaleHoldTicks(holdTicks, activityScale) {
  if (!holdTicks || !Number.isFinite(holdTicks) || holdTicks <= 0) {
    return 0;
  }
  if (!Number.isFinite(activityScale) || activityScale <= 0) {
    return Math.max(1, Math.round(holdTicks));
  }
  return Math.max(1, Math.round(holdTicks / Math.max(1, activityScale * 0.85)));
}

function listAgentProfiles() {
  return Object.keys(PROFILE_PRESETS);
}

function buildAgentProfile(meta, profileId) {
  const preset = PROFILE_PRESETS[profileId];
  if (!preset) {
    throw new Error(`Unknown playability profile: ${profileId}`);
  }

  const archetype = inferGameArchetype(meta);
  const rule = ARCHETYPE_RULES[archetype] || ARCHETYPE_RULES.survival;
  const runSeconds = recommendedRunSeconds(meta);

  if (preset.activityScale <= 0) {
    return {
      ...preset,
      archetype,
      runSeconds,
      horizontalKeys: [],
      jumpKeys: [],
      moveEveryTicks: 0,
      moveHoldTicks: 0,
      jumpEveryTicks: 0,
      shootEveryTicks: 0,
      shootHoldTicks: 0,
      tapEveryTicks: 0,
      dragEveryTicks: 0,
      swipeEveryTicks: 0,
      startTapRepeats: 1,
      preferTouch: false,
    };
  }

  return {
    ...preset,
    archetype,
    runSeconds,
    horizontalKeys: rule.horizontalKeys.slice(),
    jumpKeys: rule.jumpKeys.slice(),
    moveEveryTicks: scaleInterval(rule.moveEveryTicks, preset.activityScale),
    moveHoldTicks: scaleHoldTicks(rule.moveHoldTicks, preset.activityScale),
    jumpEveryTicks: scaleInterval(rule.jumpEveryTicks, preset.activityScale),
    shootEveryTicks: scaleInterval(rule.shootEveryTicks, preset.activityScale),
    shootHoldTicks: scaleHoldTicks(rule.shootHoldTicks, preset.activityScale),
    tapEveryTicks: scaleInterval(rule.tapEveryTicks, preset.activityScale),
    dragEveryTicks: scaleInterval(rule.dragEveryTicks, preset.activityScale),
    swipeEveryTicks: scaleInterval(rule.swipeEveryTicks, preset.activityScale),
    startTapRepeats: Math.max(1, Math.round(rule.startTapRepeats || 1)),
    preferTouch: Boolean(rule.preferTouch),
  };
}

module.exports = {
  PROFILE_PRESETS,
  buildAgentProfile,
  extractSecondsFromText,
  inferGameArchetype,
  listAgentProfiles,
  recommendedRunSeconds,
};
