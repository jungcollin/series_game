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

const STAGE_READY_TIMEOUT_MS = 4000;

const promptStepCopyButtons = document.querySelectorAll(".prompt-step-copy");
const openPromptBtn = document.querySelector("#open-prompt");
const closePromptBtn = document.querySelector("#close-prompt");
const promptModalEl = document.querySelector("#prompt-modal");

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
};

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
  document.body.classList.toggle("modal-open", open);
}

function openPromptModal() {
  setPromptModal(true);
}

function closePromptModal() {
  setPromptModal(false);
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
    showOverlay({
      kicker: "Run Complete",
      title: "ALL CLEAR",
      copy: `이번 런에서 총 ${state.clearCount}개 스테이지를 클리어했습니다.`,
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
  state.history = [];
  state.unavailableStageIds = [];
  state.currentStage = null;
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
  state.status = "gameover";
  updateRunHeader();
  const stageTitle = payload.stageTitle || state.currentStage?.title || "현재 스테이지";
  showOverlay({
    kicker: "Run Over",
    title: "GAME OVER",
    copy: `${stageTitle}에서 실패했습니다. 총 ${state.clearCount}개 스테이지를 클리어했습니다.`,
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

promptStepCopyButtons.forEach((button) => {
  button.addEventListener("click", () => copyPromptStep(button));
});
openPromptBtn?.addEventListener("click", openPromptModal);
closePromptBtn?.addEventListener("click", closePromptModal);
promptModalEl?.addEventListener("click", (event) => {
  if (event.target instanceof HTMLElement && event.target.dataset.closePrompt === "true") {
    closePromptModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && promptModalEl?.dataset.open === "true") {
    closePromptModal();
    return;
  }

  if (event.key === "Enter" && !relayOverlayEl.hidden) {
    event.preventDefault();
    performOverlayAction(state.overlayPrimaryAction);
  }
});

startNewRun();
