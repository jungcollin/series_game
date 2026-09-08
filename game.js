const COMMUNITY_STAGE_REGISTRY = window.COMMUNITY_STAGE_REGISTRY || [];
const relayFrameEl = document.querySelector("#relay-frame");
const runStageTitleEl = document.querySelector("#run-stage-title");
const runClearCountEl = document.querySelector("#run-clear-count");
const relayOverlayEl = document.querySelector("#relay-overlay");
const relayOverlayKickerEl = document.querySelector("#relay-overlay-kicker");
const relayOverlayTitleEl = document.querySelector("#relay-overlay-title");
const relayOverlayCopyEl = document.querySelector("#relay-overlay-copy");
const relayRestartBtn = document.querySelector("#relay-restart");
const relaySecondaryActionBtn = document.querySelector("#relay-secondary-action");
const leaderboardRefreshBtn = document.querySelector("#leaderboard-refresh");
const leaderboardStatusEl = document.querySelector("#leaderboard-status");
const leaderboardListEl = document.querySelector("#leaderboard-list");
const dailySeedEl = document.querySelector("#daily-seed");
const dailyRouteListEl = document.querySelector("#daily-route-list");
const startRelayBtn = document.querySelector("#start-relay");

const STAGE_READY_TIMEOUT_MS = 4000;
const LEADERBOARD_LIMIT = 10;
const LEADERBOARD_FETCH_LIMIT = 50;

const promptStepCopyButtons = document.querySelectorAll(".prompt-step-copy");
const openPromptBtn = document.querySelector("#open-prompt");
const closePromptBtn = document.querySelector("#close-prompt");
const promptModalEl = document.querySelector("#prompt-modal");
const openLeaderboardBtn = document.querySelector("#open-leaderboard");
const closeLeaderboardBtn = document.querySelector("#close-leaderboard");
const leaderboardModalEl = document.querySelector("#leaderboard-modal");
const modalFocusState = {
  prompt: null,
  leaderboard: null,
};

const state = {
  runId: "",
  clearCount: 0,
  history: [],
  unavailableStageIds: [],
  currentStage: null,
  status: "idle",
  transitionTimer: 0,
  readyTimer: 0,
  overlayPrimaryAction: "restart",
  overlaySecondaryAction: "",
  runDurationSec: 0,
  leaderboardEntries: [],
  lastRunResult: null,
  stageMessageToken: "",
  likeCounts: new Map(),
  likeCountsLoaded: false,
  dailyDateKey: "",
  dailyRoute: [],
  focusRequested: false,
  outcome: null,
  failedStageTitle: "",
};

function renderDailyRoute() {
  if (dailySeedEl) {
    dailySeedEl.textContent = state.dailyDateKey.replaceAll("-", ".");
  }
  if (!dailyRouteListEl) return;
  dailyRouteListEl.innerHTML = state.dailyRoute.map((stage, index) => {
    const normalizedThumb = normalizeStagePath(stage.thumbnail || "");
    const status = state.history.includes(stage.id)
      ? "CLEARED"
      : state.currentStage?.id === stage.id
        ? "PLAYING"
        : "LOCKED";
    return `
      <li class="route-card" data-status="${status.toLowerCase()}">
        <span class="route-index">0${index + 1}</span>
        <img src="${escapeHtml(normalizedThumb)}" alt="" loading="lazy" />
        <div><strong>${escapeHtml(stage.title)}</strong><span>${status}</span></div>
      </li>
    `;
  }).join("");
}

function prepareDailyRoute() {
  state.dailyDateKey = window.DailyRelay?.getKstDateKey() || "KST DAILY";
  state.dailyRoute = window.DailyRelay?.buildRoute(COMMUNITY_STAGE_REGISTRY, state.dailyDateKey, 5)
    || COMMUNITY_STAGE_REGISTRY.slice(0, 5);
  renderDailyRoute();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;",
    };
    return replacements[char] || char;
  });
}

function formatDurationLabel(durationSec) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return "0.0초";
  }
  return `${durationSec.toFixed(1)}초`;
}

function formatDateLabel(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function setLeaderboardStatus(text) {
  if (leaderboardStatusEl) {
    leaderboardStatusEl.textContent = text;
  }
  if (leaderboardListEl) {
    leaderboardListEl.setAttribute("aria-busy", text.includes("불러오는 중") ? "true" : "false");
  }
}

function renderLeaderboard(entries = []) {
  if (!leaderboardListEl) {
    return;
  }

  if (!entries.length) {
    leaderboardListEl.innerHTML = '<li class="leaderboard-empty">아직 저장된 기록이 없습니다.</li>';
    return;
  }

  leaderboardListEl.innerHTML = entries
    .map((entry, index) => {
      const name = escapeHtml(entry.player_name || "익명");
      const score = `${entry.clear_count}개 클리어`;
      const detail = entry.finished_all_clear
        ? `ALL CLEAR · ${formatDurationLabel(entry.duration_sec)}`
        : formatDurationLabel(entry.duration_sec);
      const dateLabel = escapeHtml(formatDateLabel(entry.created_at));
      return `
        <li class="leaderboard-item">
          <span class="leaderboard-rank">${index + 1}</span>
          <div class="leaderboard-main">
            <p class="leaderboard-name">${name}</p>
            <p class="leaderboard-score">${score}</p>
          </div>
          <div class="leaderboard-meta">
            <span>${escapeHtml(detail)}</span>
            <span>${dateLabel}</span>
          </div>
        </li>
      `;
    })
    .join("");
}

function sortLeaderboardEntries(entries) {
  return [...entries].sort((left, right) => {
    if (right.clear_count !== left.clear_count) {
      return right.clear_count - left.clear_count;
    }
    if (Number(Boolean(right.finished_all_clear)) !== Number(Boolean(left.finished_all_clear))) {
      return Number(Boolean(right.finished_all_clear)) - Number(Boolean(left.finished_all_clear));
    }
    const leftDuration = Number.isFinite(left.duration_sec) ? left.duration_sec : Number.POSITIVE_INFINITY;
    const rightDuration = Number.isFinite(right.duration_sec) ? right.duration_sec : Number.POSITIVE_INFINITY;
    if (leftDuration !== rightDuration) {
      return leftDuration - rightDuration;
    }
    return new Date(left.created_at || 0).getTime() - new Date(right.created_at || 0).getTime();
  });
}

async function relayApiRequest(path, options = {}) {
  if (!window.RelayApi) {
    throw new Error("Relay API is not loaded");
  }
  return window.RelayApi.request(path, options);
}

async function loadLeaderboard() {
  setLeaderboardStatus("랭킹을 불러오는 중…");
  try {
    const payload = await relayApiRequest(
      `/v1/leaderboard?limit=${LEADERBOARD_FETCH_LIMIT}`
    );
    const rows = Array.isArray(payload?.entries) ? payload.entries : [];
    const entries = sortLeaderboardEntries(rows).slice(0, LEADERBOARD_LIMIT);
    state.leaderboardEntries = entries;
    renderLeaderboard(entries);
    setLeaderboardStatus(
      entries.length
        ? "저장된 상위 기록입니다."
        : "아직 저장된 기록이 없습니다. 첫 번째 기록을 남겨보세요."
    );
  } catch (error) {
    renderLeaderboard([]);
    setLeaderboardStatus("지금은 랭킹 연결이 잠시 불안정합니다. 게임은 정상적으로 플레이할 수 있습니다.");
  }
}

function updateRunResult(outcome, extra = {}) {
  state.lastRunResult = {
    runId: state.runId,
    clearCount: state.clearCount,
    durationSec: Number(state.runDurationSec.toFixed(1)),
    stages: [...state.history],
    finishedAllClear: outcome === "all-clear",
    outcome,
    ...extra,
  };
}

function makeRunId() {
  return `run-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function normalizeStagePath(path) {
  if (!path) {
    return "./community-stages/";
  }
  return path.startsWith("./")
    ? `./community-stages/${path.slice(2)}`
    : path.startsWith("community-stages/")
      ? `./${path}`
      : `./community-stages/${path}`;
}

function getModalSheet(modalEl) {
  return modalEl?.querySelector('[role="dialog"]') || null;
}

function getFocusableElements(container) {
  if (!container) {
    return [];
  }

  return Array.from(
    container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

function trapFocusInModal(event, modalEl) {
  const sheet = getModalSheet(modalEl);
  const focusable = getFocusableElements(sheet);
  if (!sheet || !focusable.length) {
    event.preventDefault();
    sheet?.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (!sheet.contains(active)) {
    event.preventDefault();
    first.focus();
    return;
  }

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function setPromptModal(open, options = {}) {
  const { restoreFocus = true, triggerEl = null } = options;
  if (!promptModalEl) {
    return;
  }
  if (open) {
    modalFocusState.prompt = triggerEl || document.activeElement;
  }
  promptModalEl.dataset.open = open ? "true" : "false";
  promptModalEl.setAttribute("aria-hidden", open ? "false" : "true");
  syncModalBodyState();
  const sheet = getModalSheet(promptModalEl);
  if (open) {
    window.requestAnimationFrame(() => {
      const focusable = getFocusableElements(sheet);
      (focusable[0] || sheet)?.focus();
    });
  } else if (restoreFocus && modalFocusState.prompt instanceof HTMLElement) {
    modalFocusState.prompt.focus();
    modalFocusState.prompt = null;
  } else if (!open) {
    modalFocusState.prompt = null;
  }
}

function setLeaderboardModal(open, options = {}) {
  const { restoreFocus = true, triggerEl = null } = options;
  if (!leaderboardModalEl) {
    return;
  }
  if (open) {
    modalFocusState.leaderboard = triggerEl || document.activeElement;
  }
  leaderboardModalEl.dataset.open = open ? "true" : "false";
  leaderboardModalEl.setAttribute("aria-hidden", open ? "false" : "true");
  syncModalBodyState();
  const sheet = getModalSheet(leaderboardModalEl);
  if (open) {
    window.requestAnimationFrame(() => {
      const focusable = getFocusableElements(sheet);
      (focusable[0] || sheet)?.focus();
    });
  } else if (restoreFocus && modalFocusState.leaderboard instanceof HTMLElement) {
    modalFocusState.leaderboard.focus();
    modalFocusState.leaderboard = null;
  } else if (!open) {
    modalFocusState.leaderboard = null;
  }
}

function syncModalBodyState() {
  const promptOpen = promptModalEl?.dataset.open === "true";
  const leaderboardOpen = leaderboardModalEl?.dataset.open === "true";
  document.body.classList.toggle("modal-open", Boolean(promptOpen || leaderboardOpen));
}

function setNavActive(el) {
  document.querySelectorAll(".navbar-actions .nav-link, .navbar-actions .nav-btn").forEach(function (n) {
    n.classList.remove("nav-link--active");
  });
  if (el) el.classList.add("nav-link--active");
}

function openPromptModal() {
  setLeaderboardModal(false, { restoreFocus: false });
  setPromptModal(true, { triggerEl: openPromptBtn });
  setNavActive(openPromptBtn);
}

function closePromptModal() {
  setPromptModal(false);
  setNavActive(null);
}

function openLeaderboardModal() {
  setPromptModal(false, { restoreFocus: false });
  setLeaderboardModal(true, { triggerEl: openLeaderboardBtn });
  setNavActive(openLeaderboardBtn);
}

function closeLeaderboardModal() {
  setLeaderboardModal(false);
  setNavActive(null);
}

function copyPromptStep(button) {
  if (!navigator.clipboard || !button) {
    return;
  }
  const targetId = button.dataset.copyTarget;
  if (!targetId) {
    return;
  }
  const targetEl = document.getElementById(targetId);
  if (!targetEl) {
    return;
  }
  const text = targetEl.textContent || "";
  if (!text.trim()) {
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    button.textContent = "복사됨";
    window.setTimeout(() => {
      button.textContent = "복사";
    }, 1200);
  });
}

function hideOverlay() {
  state.overlayPrimaryAction = "restart";
  state.overlaySecondaryAction = "";
  if (relaySecondaryActionBtn) {
    relaySecondaryActionBtn.hidden = true;
    relaySecondaryActionBtn.style.display = "none";
    relaySecondaryActionBtn.setAttribute("aria-hidden", "true");
    relaySecondaryActionBtn.textContent = "";
  }
  relayOverlayEl.hidden = true;
}

function showOverlay({
  kicker,
  title,
  copy,
  buttonLabel = "다시 시작",
  buttonAction = "restart",
  secondaryButtonLabel = "",
  secondaryButtonAction = "",
}) {
  state.overlayPrimaryAction = buttonAction;
  state.overlaySecondaryAction = secondaryButtonAction;
  relayOverlayKickerEl.textContent = kicker;
  relayOverlayTitleEl.textContent = title;
  relayOverlayCopyEl.textContent = copy;
  relayRestartBtn.textContent = buttonLabel;
  if (relaySecondaryActionBtn) {
    if (secondaryButtonLabel) {
      relaySecondaryActionBtn.textContent = secondaryButtonLabel;
      relaySecondaryActionBtn.hidden = false;
      relaySecondaryActionBtn.style.display = "";
      relaySecondaryActionBtn.setAttribute("aria-hidden", "false");
    } else {
      relaySecondaryActionBtn.hidden = true;
      relaySecondaryActionBtn.style.display = "none";
      relaySecondaryActionBtn.setAttribute("aria-hidden", "true");
      relaySecondaryActionBtn.textContent = "";
    }
  }
  relayOverlayEl.hidden = false;
  if (window.matchMedia("(max-width: 820px)").matches) {
    window.requestAnimationFrame(() => {
      relayOverlayEl.scrollIntoView({ behavior: "instant", block: "center" });
    });
  }
}

function updateRunHeader() {
  runClearCountEl.textContent = `${state.clearCount} / ${state.dailyRoute.length || 5}`;
  renderDailyRoute();

  if (state.status === "loading") {
    runStageTitleEl.textContent = "오늘의 스테이지를 불러오는 중…";
    return;
  }

  if (state.status === "load-error") {
    runStageTitleEl.textContent = "스테이지 로드 실패";
    return;
  }

  if (state.status === "gameover") {
    runStageTitleEl.textContent = "플레이 종료";
    return;
  }

  if (state.status === "complete") {
    runStageTitleEl.textContent = "오늘의 릴레이를 완주했습니다";
    return;
  }

  if (state.status === "incomplete") {
    runStageTitleEl.textContent = "완주로 치지 않습니다";
    return;
  }

  if (state.currentStage) {
    runStageTitleEl.textContent = state.currentStage.title;
    return;
  }

  runStageTitleEl.textContent = "도전 시작을 누르면 첫 게임이 준비됩니다";
}

function clearTransitionTimer() {
  if (state.transitionTimer) {
    window.clearTimeout(state.transitionTimer);
    state.transitionTimer = 0;
  }
}

function clearReadyTimer() {
  if (state.readyTimer) {
    window.clearTimeout(state.readyTimer);
    state.readyTimer = 0;
  }
}

function applyRunEvent(event) {
  const next = window.RelayRunState.reduce({
    dailyRoute: state.dailyRoute,
    runId: state.runId,
    status: state.status,
    clearCount: state.clearCount,
    history: state.history,
    unavailableStageIds: state.unavailableStageIds,
    currentStage: state.currentStage,
    runDurationSec: state.runDurationSec,
    outcome: state.outcome,
    failedStageTitle: state.failedStageTitle,
  }, event);
  state.runId = next.runId;
  state.status = next.status;
  state.clearCount = next.clearCount;
  state.history = next.history;
  state.unavailableStageIds = next.unavailableStageIds;
  state.currentStage = next.currentStage;
  state.runDurationSec = next.runDurationSec;
  state.outcome = next.outcome;
  state.failedStageTitle = next.failedStageTitle;
  return next;
}

function showTerminalOverlay() {
  if (state.status === "complete") {
    updateRunResult("all-clear");
    showOverlay({
      kicker: "Run Complete",
      title: "ALL CLEAR",
      copy: `이번 플레이에서 총 ${state.clearCount}개 스테이지를 클리어했고, 누적 플레이 시간은 ${formatDurationLabel(state.runDurationSec)}입니다.`,
      buttonLabel: "처음부터 다시",
    });
    return;
  }

  if (state.status === "incomplete") {
    updateRunResult("incomplete");
    showOverlay({
      kicker: "Run Stopped",
      title: "ROUTE BLOCKED",
      copy: `클리어 ${state.clearCount}개. 나머지 스테이지는 준비되지 않아 완주로 치지 않습니다. 누적 플레이 시간은 ${formatDurationLabel(state.runDurationSec)}입니다.`,
      buttonLabel: "처음부터 다시",
    });
    return;
  }

  if (state.status === "gameover") {
    updateRunResult("failed", { failedStageTitle: state.failedStageTitle });
    showOverlay({
      kicker: "Run Over",
      title: "GAME OVER",
      copy: `${state.failedStageTitle || "현재 스테이지"}에서 실패했습니다. 이번 런은 끝났지만 처음부터 다시 도전할 수 있습니다. 총 ${state.clearCount}개 스테이지를 클리어했고, 누적 플레이 시간은 ${formatDurationLabel(state.runDurationSec)}입니다.`,
      buttonLabel: "처음부터 다시",
      buttonAction: "restart",
    });
  }
}

function continueCurrentRun() {
  applyRunEvent({ type: "continue" });
  updateRunHeader();
  if (state.status === "loading" && state.currentStage) {
    loadStage(state.currentStage);
    return;
  }
  showTerminalOverlay();
}

function buildStageUrl(stage) {
  const basePath = normalizeStagePath(stage.path);
  if (!window.RelayRuntime) {
    return basePath;
  }
  return window.RelayRuntime.buildStageUrl(basePath, {
    runId: state.runId,
    clearCount: state.clearCount,
    history: state.history,
    previousStageId: state.history[state.history.length - 1] || null,
    relayToken: state.stageMessageToken,
  });
}

function handleStageLoadTimeout() {
  if (!state.currentStage || state.status !== "loading") {
    return;
  }

  clearReadyTimer();
  applyRunEvent({ type: "load-failed", stageId: state.currentStage.id });
  updateRunHeader();
  showOverlay({
    kicker: "Stage Error",
    title: "LOAD FAILED",
    copy: `${state.currentStage.title} 스테이지가 준비 신호를 보내지 못했습니다. 이번 플레이에서는 제외하고 다음 스테이지로 건너뛸 수 있습니다.`,
    buttonLabel: "다음 스테이지로",
    buttonAction: "skip-stage",
    secondaryButtonLabel: "처음부터 다시",
    secondaryButtonAction: "restart",
  });
}

function loadStage(stage) {
  clearReadyTimer();
  hideOverlay();
  updateRunHeader();
  state.stageMessageToken = makeStageMessageToken();
  relayFrameEl.src = buildStageUrl(stage);
  state.readyTimer = window.setTimeout(() => {
    handleStageLoadTimeout();
  }, STAGE_READY_TIMEOUT_MS);
}

function showIdlePrompt() {
  clearTransitionTimer();
  clearReadyTimer();
  showOverlay({
    kicker: "Today's Relay",
    title: "READY",
    copy: "실패하면 이번 도전이 끝납니다. 처음부터 다시 도전할 수 있습니다.",
    buttonLabel: "도전 시작",
    buttonAction: "start",
  });
  updateRunHeader();
}

function startNewRun() {
  clearTransitionTimer();
  clearReadyTimer();
  state.lastRunResult = null;
  state.stageMessageToken = "";
  if (!state.dailyRoute.length) prepareDailyRoute();
  applyRunEvent({ type: "begin-run", runId: makeRunId() });
  hideOverlay();
  updateRunHeader();
  if (state.status === "loading" && state.currentStage) {
    loadStage(state.currentStage);
    return;
  }
  showTerminalOverlay();
}

function handleStageCleared(payload = {}) {
  const stageId = state.currentStage?.id;
  applyRunEvent({
    type: "stage-cleared",
    stageId,
    durationSec: payload.durationSec,
    stageTitle: payload.stageTitle,
  });
  if (state.status !== "await-advance") {
    return;
  }
  clearReadyTimer();
  if (payload.stageTitle) {
    runStageTitleEl.textContent = `${payload.stageTitle} 클리어`;
  } else {
    updateRunHeader();
  }
  clearTransitionTimer();
  state.transitionTimer = window.setTimeout(() => {
    continueCurrentRun();
  }, 260);
}

function handleStageFailed(payload = {}) {
  applyRunEvent({
    type: "stage-failed",
    stageId: state.currentStage?.id,
    durationSec: payload.durationSec,
    stageTitle: payload.stageTitle || state.currentStage?.title,
  });
  if (state.status !== "gameover") {
    return;
  }
  clearTransitionTimer();
  clearReadyTimer();
  updateRunHeader();
  showTerminalOverlay();
}

function performOverlayAction(action) {
  if (action === "skip-stage") {
    clearTransitionTimer();
    clearReadyTimer();
    continueCurrentRun();
    return;
  }

  startNewRun();
}

function makeStageMessageToken() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(24);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

const stageMessageHandlers = {
  ready(meta = {}) {
    applyRunEvent({ type: "stage-ready", stageId: meta.id, meta });
    if (state.status !== "playing") {
      return;
    }
    clearReadyTimer();
    updateRunHeader();
    window.setTimeout(() => {
      if (state.focusRequested) {
        relayFrameEl?.scrollIntoView({ behavior: "smooth", block: "center" });
        relayFrameEl?.focus({ preventScroll: true });
        state.focusRequested = false;
      } else if (state.clearCount === 0) {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    }, 80);
  },
  cleared(payload = {}) {
    handleStageCleared(payload);
  },
  failed(payload = {}) {
    handleStageFailed(payload);
  },
};

window.addEventListener("message", (event) => {
  const message = event.data;
  if (
    event.source !== relayFrameEl?.contentWindow ||
    !message ||
    message.token !== state.stageMessageToken
  ) return;
  if (!window.RelayRunState.isCurrentStageMessage({
    currentStage: state.currentStage,
  }, message, state.stageMessageToken)) return;
  stageMessageHandlers[message.type]?.(message.payload);
});

window.__relayHostDebug = {
  startNewRun,
  handleStageCleared,
  handleStageFailed,
  handleStageLoadTimeout,
};

relayFrameEl?.addEventListener("load", () => {
  updateRunHeader();
});
relayFrameEl?.addEventListener("error", handleStageLoadTimeout);

relayRestartBtn?.addEventListener("click", () => performOverlayAction(state.overlayPrimaryAction));
relaySecondaryActionBtn?.addEventListener("click", () => {
  performOverlayAction(state.overlaySecondaryAction || "restart");
});
leaderboardRefreshBtn?.addEventListener("click", loadLeaderboard);
startRelayBtn?.addEventListener("click", () => {
  state.focusRequested = true;
  startNewRun();
});

window.addEventListener("keydown", (e) => {
  // 32: Space, 37: Left, 38: Up, 39: Right, 40: Down
  if ([32, 37, 38, 39, 40].includes(e.keyCode)) {
    const active = document.activeElement;
    if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
      return; // Allow typing
    }
    // Prevent the parent page from scrolling while playing
    e.preventDefault();
  }
}, { capture: false });

promptStepCopyButtons.forEach((button) => {
  button.addEventListener("click", () => copyPromptStep(button));
});
openPromptBtn?.addEventListener("click", openPromptModal);
closePromptBtn?.addEventListener("click", closePromptModal);
openLeaderboardBtn?.addEventListener("click", openLeaderboardModal);
closeLeaderboardBtn?.addEventListener("click", closeLeaderboardModal);
if (location.hash === "#leaderboard") {
  openLeaderboardModal();
  history.replaceState(null, "", location.pathname + location.search);
}
promptModalEl?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.dataset.closePrompt === "true") {
    closePromptModal();
  }
});
leaderboardModalEl?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.dataset.closeLeaderboard === "true") {
    closeLeaderboardModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Tab" && promptModalEl?.dataset.open === "true") {
    trapFocusInModal(event, promptModalEl);
    return;
  }

  if (event.key === "Tab" && leaderboardModalEl?.dataset.open === "true") {
    trapFocusInModal(event, leaderboardModalEl);
    return;
  }

  if (event.key === "Escape" && promptModalEl?.dataset.open === "true") {
    closePromptModal();
    return;
  }

  if (event.key === "Escape" && leaderboardModalEl?.dataset.open === "true") {
    closeLeaderboardModal();
    return;
  }

  if (event.key === "Enter" && window.RelayRunState.shouldAcceptOverlayShortcut({
    overlayHidden: Boolean(relayOverlayEl?.hidden),
    modalOpen: promptModalEl?.dataset.open === "true" || leaderboardModalEl?.dataset.open === "true",
    target: event.target,
  })) {
    event.preventDefault();
    performOverlayAction(state.overlayPrimaryAction);
  }
});

async function loadLikeCounts() {
  if (!window.LikesClient) {
    return;
  }
  try {
    state.likeCounts = await window.LikesClient.fetchLikeCounts();
    state.likeCountsLoaded = true;
  } catch (error) {
    state.likeCounts = new Map();
    state.likeCountsLoaded = false;
  }
}

prepareDailyRoute();
showIdlePrompt();
loadLeaderboard();
loadLikeCounts().then(renderDailyRoute);
