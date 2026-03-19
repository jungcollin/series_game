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
const rankingSaveFormEl = document.querySelector("#ranking-save-form");
const rankingPlayerNameEl = document.querySelector("#ranking-player-name");
const rankingSaveStatusEl = document.querySelector("#ranking-save-status");
const rankingSaveButtonEl = document.querySelector("#ranking-save-button");

const STAGE_READY_TIMEOUT_MS = 4000;
const SUPABASE_URL = "https://ikrhlbwsrahnswuhuyka.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrcmhsYndzcmFobnN3dWh1eWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MDA3OTgsImV4cCI6MjA4OTQ3Njc5OH0.Gg9sjaq-Mwv0sqOm1G4u0sIyMmkUtTccW5nL-TuMDnk";
const SUPABASE_TABLE = "leaderboard_runs";
const LEADERBOARD_LIMIT = 10;
const LEADERBOARD_FETCH_LIMIT = 50;
const PLAYER_NAME_STORAGE_KEY = "one-life-relay-player-name";

const promptStepCopyButtons = document.querySelectorAll(".prompt-step-copy");
const openPromptBtn = document.querySelector("#open-prompt");
const closePromptBtn = document.querySelector("#close-prompt");
const promptModalEl = document.querySelector("#prompt-modal");
const openLeaderboardBtn = document.querySelector("#open-leaderboard");
const closeLeaderboardBtn = document.querySelector("#close-leaderboard");
const leaderboardModalEl = document.querySelector("#leaderboard-modal");

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
  saveState: "idle",
};

function getSavedPlayerName() {
  try {
    return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || "";
  } catch (error) {
    return "";
  }
}

function persistPlayerName(name) {
  try {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name);
  } catch (error) {
    // Keep ranking usable even if storage is unavailable.
  }
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

async function supabaseRequest(path, options = {}) {
  const response = await window.fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error_description || `Supabase ${response.status}`);
  }
  return payload;
}

async function loadLeaderboard() {
  setLeaderboardStatus("랭킹을 불러오는 중...");
  try {
    const rows = await supabaseRequest(
      `${SUPABASE_TABLE}?select=player_name,clear_count,duration_sec,finished_all_clear,created_at&limit=${LEADERBOARD_FETCH_LIMIT}`
    );
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
    setLeaderboardStatus("랭킹을 불러오지 못했습니다. Supabase 테이블과 RLS 정책을 확인해 주세요.");
  }
}

function hideRankingSavePanel() {
  if (rankingSaveFormEl) {
    rankingSaveFormEl.hidden = true;
  }
  if (rankingSaveStatusEl) {
    rankingSaveStatusEl.textContent = "";
  }
  if (rankingSaveButtonEl) {
    rankingSaveButtonEl.disabled = false;
    rankingSaveButtonEl.textContent = "랭킹 저장";
  }
}

function showRankingSavePanel() {
  if (!rankingSaveFormEl || !rankingPlayerNameEl) {
    return;
  }
  rankingSaveFormEl.hidden = false;
  rankingPlayerNameEl.value = getSavedPlayerName();
  if (rankingSaveButtonEl) {
    rankingSaveButtonEl.disabled = state.saveState === "saved";
    rankingSaveButtonEl.textContent = state.saveState === "saved" ? "저장 완료" : "랭킹 저장";
  }
  if (rankingSaveStatusEl) {
    rankingSaveStatusEl.textContent = state.saveState === "saved"
      ? "이 런 기록은 이미 저장했습니다."
      : "런 종료 후 닉네임으로 기록을 저장할 수 있습니다.";
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
  state.saveState = "idle";
  showRankingSavePanel();
}

function normalizePlayerName(value) {
  return value.replace(/\s+/g, " ").trim().slice(0, 24);
}

async function saveCurrentRunToLeaderboard(event) {
  event.preventDefault();
  if (!state.lastRunResult || !rankingPlayerNameEl) {
    return;
  }

  const playerName = normalizePlayerName(rankingPlayerNameEl.value || "");
  if (playerName.length < 2) {
    if (rankingSaveStatusEl) {
      rankingSaveStatusEl.textContent = "닉네임은 2자 이상으로 입력해 주세요.";
    }
    rankingPlayerNameEl.focus();
    return;
  }

  if (state.saveState === "saving" || state.saveState === "saved") {
    return;
  }

  state.saveState = "saving";
  if (rankingSaveButtonEl) {
    rankingSaveButtonEl.disabled = true;
    rankingSaveButtonEl.textContent = "저장 중...";
  }
  if (rankingSaveStatusEl) {
    rankingSaveStatusEl.textContent = "랭킹에 기록을 저장하는 중...";
  }

  try {
    await supabaseRequest(SUPABASE_TABLE, {
      method: "POST",
      headers: {
        Prefer: "return=representation",
      },
      body: {
        run_id: state.lastRunResult.runId,
        player_name: playerName,
        clear_count: state.lastRunResult.clearCount,
        duration_sec: state.lastRunResult.durationSec,
        finished_all_clear: state.lastRunResult.finishedAllClear,
        stages: state.lastRunResult.stages,
      },
    });
    persistPlayerName(playerName);
    state.saveState = "saved";
    if (rankingSaveButtonEl) {
      rankingSaveButtonEl.disabled = true;
      rankingSaveButtonEl.textContent = "저장 완료";
    }
    if (rankingSaveStatusEl) {
      rankingSaveStatusEl.textContent = "랭킹 저장이 완료되었습니다.";
    }
    await loadLeaderboard();
  } catch (error) {
    state.saveState = "idle";
    if (rankingSaveButtonEl) {
      rankingSaveButtonEl.disabled = false;
      rankingSaveButtonEl.textContent = "랭킹 저장";
    }
    if (rankingSaveStatusEl) {
      rankingSaveStatusEl.textContent =
        "랭킹 저장에 실패했습니다. Supabase 테이블과 anon insert 정책을 확인해 주세요.";
    }
  }
}

function accumulateRunDuration(durationSec) {
  if (!Number.isFinite(durationSec) || durationSec < 0) {
    return;
  }
  state.runDurationSec = Number((state.runDurationSec + durationSec).toFixed(1));
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

function setPromptModal(open) {
  if (!promptModalEl) {
    return;
  }
  promptModalEl.dataset.open = open ? "true" : "false";
  promptModalEl.setAttribute("aria-hidden", open ? "false" : "true");
  syncModalBodyState();
}

function setLeaderboardModal(open) {
  if (!leaderboardModalEl) {
    return;
  }
  leaderboardModalEl.dataset.open = open ? "true" : "false";
  leaderboardModalEl.setAttribute("aria-hidden", open ? "false" : "true");
  syncModalBodyState();
}

function syncModalBodyState() {
  const promptOpen = promptModalEl?.dataset.open === "true";
  const leaderboardOpen = leaderboardModalEl?.dataset.open === "true";
  document.body.classList.toggle("modal-open", Boolean(promptOpen || leaderboardOpen));
}

function openPromptModal() {
  setLeaderboardModal(false);
  setPromptModal(true);
}

function closePromptModal() {
  setPromptModal(false);
}

function openLeaderboardModal() {
  setPromptModal(false);
  setLeaderboardModal(true);
}

function closeLeaderboardModal() {
  setLeaderboardModal(false);
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
  hideRankingSavePanel();
  if (relaySecondaryActionBtn) {
    relaySecondaryActionBtn.hidden = true;
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
    } else {
      relaySecondaryActionBtn.hidden = true;
      relaySecondaryActionBtn.textContent = "";
    }
  }
  relayOverlayEl.hidden = false;
}

function updateRunHeader() {
  runClearCountEl.textContent = `${state.clearCount}개 클리어`;

  if (state.status === "loading") {
    runStageTitleEl.textContent = "랜덤 스테이지를 불러오는 중...";
    return;
  }

  if (state.status === "load-error") {
    runStageTitleEl.textContent = "스테이지 로드 실패";
    return;
  }

  if (state.status === "gameover") {
    runStageTitleEl.textContent = "런 종료";
    return;
  }

  if (state.status === "complete") {
    runStageTitleEl.textContent = "이번 런의 모든 미플레이 스테이지를 완료했습니다";
    return;
  }

  if (state.currentStage) {
    runStageTitleEl.textContent = state.currentStage.title;
    return;
  }

  runStageTitleEl.textContent = "랜덤 스테이지를 고르는 중...";
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

function markStageUnavailable(stageId) {
  if (!stageId || state.history.includes(stageId) || state.unavailableStageIds.includes(stageId)) {
    return;
  }
  state.unavailableStageIds.push(stageId);
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
  });
}

function pickNextStage() {
  if (!COMMUNITY_STAGE_REGISTRY.length) {
    return null;
  }

  const excluded = new Set([...state.history, ...state.unavailableStageIds]);

  if (!window.RelayRuntime) {
    const candidates = COMMUNITY_STAGE_REGISTRY.filter((entry) => !excluded.has(entry.id));
    if (!candidates.length) {
      return null;
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  return window.RelayRuntime.pickRandomNext(COMMUNITY_STAGE_REGISTRY, {
    history: Array.from(excluded),
    currentStageId: state.currentStage?.id || null,
  });
}

function handleStageLoadTimeout() {
  if (!state.currentStage || state.status !== "loading") {
    return;
  }

  clearReadyTimer();
  state.status = "load-error";
  markStageUnavailable(state.currentStage.id);
  updateRunHeader();
  showOverlay({
    kicker: "Stage Error",
    title: "LOAD FAILED",
    copy: `${state.currentStage.title} 스테이지가 준비 신호를 보내지 못했습니다. 이번 런에서는 제외하고 다음 스테이지로 건너뛸 수 있습니다.`,
    buttonLabel: "다음 스테이지로",
    buttonAction: "skip-stage",
    secondaryButtonLabel: "처음부터 다시",
    secondaryButtonAction: "restart",
  });
}

function loadStage(stage) {
  clearReadyTimer();
  state.currentStage = stage;
  state.status = "loading";
  hideOverlay();
  updateRunHeader();
  relayFrameEl.src = buildStageUrl(stage);
  state.readyTimer = window.setTimeout(() => {
    handleStageLoadTimeout();
  }, STAGE_READY_TIMEOUT_MS);
}

function startNextRandomStage() {
  const nextStage = pickNextStage();
  if (!nextStage) {
    state.currentStage = null;
    state.status = "complete";
    updateRunHeader();
    updateRunResult("all-clear");
    showOverlay({
      kicker: "Run Complete",
      title: "ALL CLEAR",
      copy: `이번 런에서 총 ${state.clearCount}개 스테이지를 클리어했고, 누적 플레이 시간은 ${formatDurationLabel(state.runDurationSec)}입니다.`,
      buttonLabel: "처음부터 다시",
    });
    return;
  }

  loadStage(nextStage);
}

function startNewRun() {
  clearTransitionTimer();
  clearReadyTimer();
  state.runId = makeRunId();
  state.clearCount = 0;
  state.runDurationSec = 0;
  state.history = [];
  state.unavailableStageIds = [];
  state.currentStage = null;
  state.lastRunResult = null;
  state.saveState = "idle";
  state.status = "loading";
  hideOverlay();
  updateRunHeader();
  startNextRandomStage();
}

function markCurrentStageCleared() {
  if (!state.currentStage) {
    return;
  }
  if (!state.history.includes(state.currentStage.id)) {
    state.history.push(state.currentStage.id);
    state.clearCount = state.history.length;
  }
}

function handleStageCleared(payload = {}) {
  if (state.status === "gameover" || state.status === "complete") {
    return;
  }
  clearReadyTimer();
  accumulateRunDuration(Number(payload.durationSec || 0));
  markCurrentStageCleared();
  state.status = "transition";
  if (payload.stageTitle) {
    runStageTitleEl.textContent = `${payload.stageTitle} 클리어`;
  } else {
    updateRunHeader();
  }
  clearTransitionTimer();
  state.transitionTimer = window.setTimeout(() => {
    startNextRandomStage();
  }, 260);
}

function handleStageFailed(payload = {}) {
  clearTransitionTimer();
  clearReadyTimer();
  accumulateRunDuration(Number(payload.durationSec || 0));
  state.status = "gameover";
  updateRunHeader();
  const stageTitle = payload.stageTitle || state.currentStage?.title || "현재 스테이지";
  updateRunResult("failed", {
    failedStageTitle: stageTitle,
  });
  showOverlay({
    kicker: "Run Over",
    title: "GAME OVER",
    copy: `${stageTitle}에서 실패했습니다. 총 ${state.clearCount}개 스테이지를 클리어했고, 누적 플레이 시간은 ${formatDurationLabel(state.runDurationSec)}입니다.`,
    buttonLabel: "처음부터 다시",
    buttonAction: "restart",
  });
}

function performOverlayAction(action) {
  if (action === "skip-stage") {
    clearTransitionTimer();
    clearReadyTimer();
    startNextRandomStage();
    return;
  }

  startNewRun();
}

window.RelayHost = {
  onStageReady(meta = {}) {
    if (state.status === "loading" && meta.title && state.currentStage && meta.id === state.currentStage.id) {
      clearReadyTimer();
      state.currentStage = { ...state.currentStage, ...meta };
      state.status = "playing";
      updateRunHeader();
    }
  },
  onStageCleared(payload = {}) {
    handleStageCleared(payload);
  },
  onStageFailed(payload = {}) {
    handleStageFailed(payload);
  },
};

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
rankingSaveFormEl?.addEventListener("submit", saveCurrentRunToLeaderboard);

promptStepCopyButtons.forEach((button) => {
  button.addEventListener("click", () => copyPromptStep(button));
});
openPromptBtn?.addEventListener("click", openPromptModal);
closePromptBtn?.addEventListener("click", closePromptModal);
openLeaderboardBtn?.addEventListener("click", openLeaderboardModal);
closeLeaderboardBtn?.addEventListener("click", closeLeaderboardModal);
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
  if (event.key === "Escape" && promptModalEl?.dataset.open === "true") {
    closePromptModal();
    return;
  }

  if (event.key === "Escape" && leaderboardModalEl?.dataset.open === "true") {
    closeLeaderboardModal();
    return;
  }

  if (event.key === "Enter" && !relayOverlayEl.hidden) {
    event.preventDefault();
    performOverlayAction(state.overlayPrimaryAction);
  }
});

loadLeaderboard();
startNewRun();
