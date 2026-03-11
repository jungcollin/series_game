const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const STAGES = window.STAGES || [];
const RELAY_POOL = window.RELAY_POOL || [];
const RELAY_RULES = window.RELAY_RULES || [];
const RELAY_CREATOR_PROMPT = window.RELAY_CREATOR_PROMPT || "";

const relayRulesEl = document.querySelector("#relay-rules");
const relayPickedStageEl = document.querySelector("#relay-picked-stage");
const relayPromptEl = document.querySelector("#relay-prompt");
const copyPromptBtn = document.querySelector("#copy-prompt");
const rerollStageBtn = document.querySelector("#reroll-stage");

const VIEW = { width: canvas.width, height: canvas.height };
const FIXED_DT = 1 / 60;
const MAX_DT = 1 / 20;

const input = {
  left: false,
  right: false,
  jumpHeld: false,
  jumpQueued: false,
};

const state = {
  mode: "menu",
  stageIndex: 0,
  clearedStages: 0,
  relayClears: 0,
  relayStage: null,
  score: 0,
  bestRun: Number(localStorage.getItem("one-life-best-run") || 0),
  bestScore: Number(localStorage.getItem("one-life-best-score") || 0),
  elapsed: 0,
  lastRunTime: 0,
  cameraX: 0,
  player: createPlayer(),
  stageClock: 0,
};

let animationFrame = 0;
let lastTimestamp = 0;

function createPlayer() {
  return {
    x: 0,
    y: 0,
    width: 34,
    height: 46,
    vx: 0,
    vy: 0,
    grounded: false,
    coyoteTime: 0,
    jumpBuffer: 0,
    facing: 1,
  };
}

function cloneStage(index) {
  const src = STAGES[index];
  return {
    ...src,
    hazards: src.hazards.map((hazard) => ({ ...hazard, originX: hazard.x, originY: hazard.y })),
    pickups: src.pickups.map((pickup) => ({ ...pickup, collected: false })),
  };
}

function stage() {
  return state.currentStage;
}

function pickRandomRelayStage(previousId = null) {
  if (!RELAY_POOL.length) {
    return null;
  }
  const candidates =
    RELAY_POOL.length > 1 && previousId
      ? RELAY_POOL.filter((entry) => entry.id !== previousId)
      : RELAY_POOL;
  const source = candidates.length ? candidates : RELAY_POOL;
  return { ...source[Math.floor(Math.random() * source.length)] };
}

function updateRelayPanel() {
  if (relayRulesEl) {
    relayRulesEl.innerHTML = "";
    RELAY_RULES.forEach((rule) => {
      const item = document.createElement("li");
      item.textContent = rule;
      relayRulesEl.appendChild(item);
    });
  }

  if (relayPromptEl) {
    relayPromptEl.textContent = RELAY_CREATOR_PROMPT;
  }

  if (!relayPickedStageEl || !state.relayStage) {
    return;
  }

  relayPickedStageEl.innerHTML = `
    <h2>${state.relayStage.title}</h2>
    <div class="stage-meta">
      <span>by ${state.relayStage.creator}</span>
      <span>${state.relayStage.genre}</span>
    </div>
    <p class="stage-copy">클리어 조건: ${state.relayStage.clearCondition}</p>
    <p class="stage-copy">1목숨 규칙: ${state.relayStage.ruleFocus}</p>
    <p class="stage-note">현재 릴레이 누적 클리어 수: ${state.relayClears}</p>
  `;
}

function assignRelayStage(countAsClear) {
  const previousId = state.relayStage?.id || null;
  if (countAsClear) {
    state.relayClears += 1;
    state.clearedStages += 1;
    state.score += 900;
    persistBest();
  }
  state.relayStage = pickRandomRelayStage(previousId);
  updateRelayPanel();
}

function startRun() {
  state.mode = "playing";
  state.stageIndex = 0;
  state.clearedStages = 0;
  state.relayClears = 0;
  state.score = 0;
  state.elapsed = 0;
  state.lastRunTime = 0;
  state.relayStage = pickRandomRelayStage();
  updateRelayPanel();
  loadStage(0);
}

function restartCurrentRun() {
  startRun();
}

function loadStage(index) {
  state.stageIndex = index;
  state.currentStage = cloneStage(index);
  state.stageClock = 0;
  spawnPlayer();
  centerCamera();
}

function spawnPlayer() {
  const player = createPlayer();
  const current = stage();
  player.x = current.spawn.x;
  player.y = current.spawn.y;
  state.player = player;
}

function centerCamera() {
  const current = stage();
  state.cameraX = clamp(
    state.player.x - VIEW.width * 0.35,
    0,
    Math.max(0, current.width - VIEW.width),
  );
}

function enterRelayMode() {
  state.clearedStages = 1;
  state.lastRunTime = state.elapsed;
  state.score += 1200 + Math.max(0, 400 - Math.floor(state.stageClock * 18));
  persistBest();
  state.mode = "relay";
  assignRelayStage(false);
}

function advanceRelayLoop() {
  if (state.mode !== "relay") {
    return;
  }
  state.lastRunTime = state.elapsed;
  assignRelayStage(true);
}

function loseRun() {
  state.lastRunTime = state.elapsed;
  state.mode = "gameover";
  persistBest();
}

function persistBest() {
  if (state.clearedStages > state.bestRun) {
    state.bestRun = state.clearedStages;
    localStorage.setItem("one-life-best-run", String(state.bestRun));
  }
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
    localStorage.setItem("one-life-best-score", String(state.bestScore));
  }
}

function queueJump() {
  input.jumpQueued = true;
  input.jumpHeld = true;
}

function consumeJump() {
  input.jumpQueued = false;
}

function update(dt) {
  if (state.mode !== "playing") {
    return;
  }

  const player = state.player;
  const current = stage();

  state.elapsed += dt;
  state.stageClock += dt;

  updateHazards(current, state.stageClock);

  const horizontal = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  const runAccel = player.grounded ? 2200 : 1350;
  const maxSpeed = player.grounded ? 290 : 260;

  if (horizontal !== 0) {
    player.vx += horizontal * runAccel * dt;
    player.facing = horizontal;
  } else {
    const drag = player.grounded ? 1800 : 640;
    player.vx = approach(player.vx, 0, drag * dt);
  }

  player.vx = clamp(player.vx, -maxSpeed, maxSpeed);
  player.vy += 1800 * dt;
  player.coyoteTime = Math.max(0, player.coyoteTime - dt);
  player.jumpBuffer = Math.max(0, player.jumpBuffer - dt);

  if (input.jumpQueued) {
    player.jumpBuffer = 0.12;
    consumeJump();
  }

  if (player.jumpBuffer > 0 && (player.grounded || player.coyoteTime > 0)) {
    player.vy = -660;
    player.grounded = false;
    player.coyoteTime = 0;
    player.jumpBuffer = 0;
  }

  if (!input.jumpHeld && player.vy < -220) {
    player.vy += 1600 * dt;
  }

  movePlayerX(player, current, dt);
  movePlayerY(player, current, dt);

  state.cameraX = clamp(
    lerp(state.cameraX, player.x - VIEW.width * 0.35, 0.1),
    0,
    Math.max(0, current.width - VIEW.width),
  );

  handlePickups(player, current.pickups);

  if (hitsHazard(player, current.hazards) || player.y > current.height + 120) {
    loseRun();
  }

  if (rectOverlap(playerRect(player), current.goal)) {
    enterRelayMode();
  }
}

function updateHazards(current, clock) {
  for (const hazard of current.hazards) {
    if (hazard.type !== "saw") {
      continue;
    }
    const offset = Math.sin(clock * hazard.speed * Math.PI) * hazard.range;
    hazard.x = hazard.axis === "x" ? hazard.originX + offset : hazard.originX;
    hazard.y = hazard.axis === "y" ? hazard.originY + offset : hazard.originY;
  }
}

function movePlayerX(player, current, dt) {
  player.x += player.vx * dt;
  const rect = playerRect(player);
  for (const platform of current.platforms) {
    if (!rectOverlap(rect, platform)) {
      continue;
    }
    if (player.vx > 0) {
      player.x = platform.x - player.width;
    } else if (player.vx < 0) {
      player.x = platform.x + platform.w;
    }
    player.vx = 0;
    rect.x = player.x;
  }
  player.x = Math.max(0, player.x);
}

function movePlayerY(player, current, dt) {
  player.grounded = false;
  player.y += player.vy * dt;
  const rect = playerRect(player);
  for (const platform of current.platforms) {
    if (!rectOverlap(rect, platform)) {
      continue;
    }
    if (player.vy > 0) {
      player.y = platform.y - player.height;
      player.vy = 0;
      player.grounded = true;
      player.coyoteTime = 0.09;
    } else if (player.vy < 0) {
      player.y = platform.y + platform.h;
      player.vy = 30;
    }
    rect.y = player.y;
  }
}

function handlePickups(player, pickups) {
  for (const pickup of pickups) {
    if (pickup.collected) {
      continue;
    }
    const box = {
      x: pickup.x - pickup.r,
      y: pickup.y - pickup.r,
      w: pickup.r * 2,
      h: pickup.r * 2,
    };
    if (rectOverlap(playerRect(player), box)) {
      pickup.collected = true;
      state.score += pickup.points;
    }
  }
}

function hitsHazard(player, hazards) {
  const rect = insetRect(playerRect(player), 3);
  return hazards.some((hazard) => {
    if (hazard.type === "spikes") {
      return rectOverlap(rect, { x: hazard.x, y: hazard.y, w: hazard.w, h: 16 });
    }
    return circleRectCollision(
      hazard.x + hazard.w / 2,
      hazard.y + hazard.h / 2,
      hazard.w / 2,
      rect,
    );
  });
}

function render() {
  ctx.clearRect(0, 0, VIEW.width, VIEW.height);
  drawSky();
  drawMountains();
  drawWorld();
  drawOverlay();
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, VIEW.height);
  gradient.addColorStop(0, "#8fd6ff");
  gradient.addColorStop(0.55, "#bfe9ff");
  gradient.addColorStop(1, "#f7d2a2");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}

function drawMountains() {
  const layers = [
    { color: "#5ea0c0", y: 310, bump: 58, width: 180, offset: 0.2 },
    { color: "#40748d", y: 360, bump: 82, width: 220, offset: 0.45 },
  ];
  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    ctx.beginPath();
    ctx.moveTo(0, VIEW.height);
    for (let x = -50; x <= VIEW.width + 80; x += layer.width) {
      const worldX = x + state.cameraX * layer.offset;
      ctx.quadraticCurveTo(
        x + layer.width / 2,
        layer.y - Math.sin(worldX * 0.004) * layer.bump,
        x + layer.width,
        layer.y,
      );
    }
    ctx.lineTo(VIEW.width, VIEW.height);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWorld() {
  if (!state.currentStage) {
    return;
  }
  ctx.save();
  ctx.translate(-state.cameraX, 0);
  drawPlatforms(stage().platforms);
  drawGoal(stage().goal);
  drawPickups(stage().pickups);
  drawHazards(stage().hazards);
  drawPlayer(state.player);
  ctx.restore();
}

function drawPlatforms(platforms) {
  for (const platform of platforms) {
    const base = platform.kind === "ground" ? "#8d6c42" : "#b78645";
    const top = platform.kind === "ground" ? "#caa56c" : "#f2d08b";
    ctx.fillStyle = base;
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    ctx.fillStyle = top;
    ctx.fillRect(platform.x, platform.y, platform.w, Math.min(platform.h, 16));

    if (platform.kind === "ground") {
      ctx.fillStyle = "rgba(56, 97, 41, 0.75)";
      for (let x = platform.x + 6; x < platform.x + platform.w - 6; x += 18) {
        ctx.fillRect(x, platform.y - 6, 12, 6);
      }
    }
  }
}

function drawGoal(goal) {
  ctx.fillStyle = "#2b3a55";
  ctx.fillRect(goal.x + 18, goal.y - 12, 6, goal.h + 12);
  ctx.fillStyle = "#f05d28";
  ctx.beginPath();
  ctx.moveTo(goal.x + 24, goal.y - 8);
  ctx.lineTo(goal.x + goal.w, goal.y + 12);
  ctx.lineTo(goal.x + 24, goal.y + 32);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(goal.x, goal.y, goal.w, goal.h);
  ctx.strokeStyle = "rgba(43, 58, 85, 0.35)";
  ctx.lineWidth = 3;
  ctx.strokeRect(goal.x, goal.y, goal.w, goal.h);
}

function drawHazards(hazards) {
  for (const hazard of hazards) {
    if (hazard.type === "spikes") {
      drawSpikes(hazard);
    } else {
      drawSaw(hazard);
    }
  }
}

function drawSpikes(hazard) {
  ctx.fillStyle = "#c93924";
  ctx.beginPath();
  ctx.moveTo(hazard.x, hazard.y + 12);
  const count = Math.max(1, Math.floor(hazard.w / 18));
  const segment = hazard.w / count;
  for (let i = 0; i < count; i += 1) {
    const x = hazard.x + i * segment;
    ctx.lineTo(x + segment * 0.5, hazard.y - 6);
    ctx.lineTo(x + segment, hazard.y + 12);
  }
  ctx.closePath();
  ctx.fill();
}

function drawSaw(hazard) {
  const cx = hazard.x + hazard.w / 2;
  const cy = hazard.y + hazard.h / 2;
  const radius = hazard.w / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.stageClock * hazard.speed * 4);
  ctx.fillStyle = "#f1f5f9";
  ctx.beginPath();
  for (let i = 0; i < 12; i += 1) {
    const angle = (Math.PI * 2 * i) / 12;
    const outer = i % 2 === 0 ? radius : radius * 0.62;
    const x = Math.cos(angle) * outer;
    const y = Math.sin(angle) * outer;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#64748b";
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPickups(pickups) {
  for (const pickup of pickups) {
    if (pickup.collected) {
      continue;
    }
    const pulse = 1 + Math.sin(state.elapsed * 5 + pickup.x * 0.01) * 0.1;
    ctx.fillStyle = "#fff1a8";
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, pickup.r * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f3b332";
    ctx.beginPath();
    ctx.arc(pickup.x, pickup.y, pickup.r * 0.56, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPlayer(player) {
  ctx.fillStyle = "#24344d";
  ctx.fillRect(player.x + 7, player.y, player.width - 14, 13);
  ctx.fillStyle = "#ffbd80";
  ctx.fillRect(player.x + 7, player.y + 12, player.width - 14, 12);
  ctx.fillStyle = "#d2551d";
  ctx.fillRect(player.x, player.y + 24, player.width, 16);
  ctx.fillStyle = "#2d6fca";
  ctx.fillRect(player.x + 3, player.y + 32, player.width - 6, 14);
  ctx.fillStyle = "#172236";
  ctx.fillRect(player.x + 2, player.y + 44, 11, 6);
  ctx.fillRect(player.x + player.width - 13, player.y + 44, 11, 6);
  ctx.fillStyle = "#111827";
  const eyeX = player.facing === 1 ? player.x + 21 : player.x + 11;
  ctx.fillRect(eyeX, player.y + 16, 4, 4);
}

function drawOverlay() {
  drawHudPanel();

  if (state.mode === "menu") {
    drawCenterCard("ONE LIFE RELAY", [
      "앵커 스테이지는 1개만 직접 만든다.",
      "이걸 깨면 외부 랜덤 스테이지 릴레이로 이어진다.",
      "Enter를 눌러 앵커 스테이지를 시작하세요.",
    ]);
  } else if (state.mode === "gameover") {
    drawCenterCard("RUN OVER", [
      `총 ${state.clearedStages}개 스테이지 클리어`,
      `점수 ${state.score}`,
      "Enter 또는 R로 앵커 스테이지부터 다시 시작하세요.",
    ], "#7f1d1d");
  } else if (state.mode === "relay") {
    drawCenterCard("RELAY CONTINUES", [
      `앵커 스테이지를 돌파했습니다.`,
      `현재 랜덤 선택: ${state.relayStage?.title || "No stage"}`,
      "Enter로 다음 랜덤 스테이지를 계속 시뮬레이션하세요.",
    ], "#14532d");
  }
}

function drawHudPanel() {
  ctx.save();
  ctx.fillStyle = "rgba(17, 24, 39, 0.82)";
  ctx.fillRect(20, 18, 338, 114);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "700 19px Trebuchet MS";
  ctx.fillText("Anchor Stage 1 / 1", 36, 46);
  ctx.font = "600 16px Trebuchet MS";
  ctx.fillText(`Total cleared: ${state.clearedStages}`, 36, 72);
  ctx.fillText(`Relay clears: ${state.relayClears}`, 36, 96);
  const timerLabel = state.mode === "playing" ? state.elapsed : state.lastRunTime;
  ctx.fillText(`Time: ${timerLabel.toFixed(1)}s`, 188, 72);
  ctx.fillText(`Best run: ${state.bestRun}`, 188, 96);
  ctx.restore();
}

function drawCenterCard(title, lines, accent = "#d45500") {
  const width = 560;
  const height = 220;
  const x = (VIEW.width - width) / 2;
  const y = 124;

  ctx.fillStyle = "rgba(255, 250, 240, 0.94)";
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, width, height);

  ctx.fillStyle = accent;
  ctx.font = "700 38px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText(title, VIEW.width / 2, y + 56);
  ctx.fillStyle = "#111827";
  ctx.font = "600 19px Trebuchet MS";
  lines.forEach((line, index) => {
    ctx.fillText(line, VIEW.width / 2, y + 100 + index * 34);
  });
  ctx.textAlign = "left";
}

function playerRect(player) {
  return { x: player.x, y: player.y, w: player.width, h: player.height };
}

function insetRect(rect, inset) {
  return {
    x: rect.x + inset,
    y: rect.y + inset,
    w: rect.w - inset * 2,
    h: rect.h - inset * 2,
  };
}

function rectOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function circleRectCollision(cx, cy, radius, rect) {
  const nearestX = clamp(cx, rect.x, rect.x + rect.w);
  const nearestY = clamp(cy, rect.y, rect.y + rect.h);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function approach(value, target, step) {
  if (value < target) {
    return Math.min(value + step, target);
  }
  return Math.max(value - step, target);
}

function formatVisibleHazards() {
  if (!state.currentStage) {
    return [];
  }
  const viewLeft = state.cameraX - 40;
  const viewRight = state.cameraX + VIEW.width + 40;
  return stage()
    .hazards.filter((hazard) => hazard.x + hazard.w > viewLeft && hazard.x < viewRight)
    .map((hazard) => ({
      type: hazard.type,
      x: round1(hazard.x),
      y: round1(hazard.y),
      w: hazard.w,
      h: hazard.h,
    }));
}

function formatVisiblePlatforms() {
  if (!state.currentStage) {
    return [];
  }
  const viewLeft = state.cameraX - 60;
  const viewRight = state.cameraX + VIEW.width + 60;
  return stage()
    .platforms.filter((platform) => platform.x + platform.w > viewLeft && platform.x < viewRight)
    .slice(0, 8)
    .map((platform) => ({
      x: round1(platform.x),
      y: round1(platform.y),
      w: platform.w,
      h: platform.h,
      kind: platform.kind,
    }));
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function renderGameToText() {
  const payload = {
    coordinate_system: "origin top-left, x right, y down, units in pixels",
    mode: state.mode,
    anchor_stage: stage()
      ? {
          name: stage().name,
          goal: {
            x: round1(stage().goal.x),
            y: round1(stage().goal.y),
            w: stage().goal.w,
            h: stage().goal.h,
          },
        }
      : null,
    relay_stage: state.relayStage
      ? {
          title: state.relayStage.title,
          creator: state.relayStage.creator,
          genre: state.relayStage.genre,
          clear_condition: state.relayStage.clearCondition,
        }
      : null,
    player: {
      x: round1(state.player.x),
      y: round1(state.player.y),
      vx: round1(state.player.vx),
      vy: round1(state.player.vy),
      grounded: state.player.grounded,
    },
    camera_x: round1(state.cameraX),
    score: state.score,
    cleared_stages: state.clearedStages,
    relay_clears: state.relayClears,
    elapsed: round1(state.elapsed),
    visible_platforms: formatVisiblePlatforms(),
    visible_hazards: formatVisibleHazards(),
    visible_pickups: stage()
      ? stage()
          .pickups.filter(
            (pickup) =>
              !pickup.collected &&
              pickup.x > state.cameraX - 40 &&
              pickup.x < state.cameraX + VIEW.width + 40,
          )
          .map((pickup) => ({
            x: round1(pickup.x),
            y: round1(pickup.y),
            points: pickup.points,
          }))
      : [],
  };
  return JSON.stringify(payload);
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    canvas.requestFullscreen?.();
  }
}

function isLeftKey(event) {
  return event.key === "ArrowLeft" || event.key.toLowerCase() === "a" || event.code === "KeyA";
}

function isRightKey(event) {
  return event.key === "ArrowRight" || event.key.toLowerCase() === "d" || event.code === "KeyD";
}

function isJumpKey(event) {
  return (
    event.key === "ArrowUp" ||
    event.key.toLowerCase() === "w" ||
    event.key === " " ||
    event.code === "ArrowUp" ||
    event.code === "KeyW" ||
    event.code === "Space"
  );
}

function onKeyDown(event) {
  const lowerKey = event.key.toLowerCase();

  if (isLeftKey(event)) {
    input.left = true;
  }
  if (isRightKey(event)) {
    input.right = true;
  }
  if (state.mode === "playing" && isJumpKey(event)) {
    event.preventDefault();
    queueJump();
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (state.mode === "menu" || state.mode === "gameover") {
      restartCurrentRun();
    } else if (state.mode === "relay") {
      advanceRelayLoop();
    }
  }
  if (lowerKey === "r") {
    restartCurrentRun();
  }
  if (lowerKey === "f") {
    toggleFullscreen();
  }
}

function onKeyUp(event) {
  if (isLeftKey(event)) {
    input.left = false;
  }
  if (isRightKey(event)) {
    input.right = false;
  }
  if (isJumpKey(event)) {
    input.jumpHeld = false;
  }
}

function copyPrompt() {
  if (!navigator.clipboard) {
    return;
  }
  navigator.clipboard.writeText(RELAY_CREATOR_PROMPT).then(() => {
    copyPromptBtn.textContent = "복사됨";
    window.setTimeout(() => {
      copyPromptBtn.textContent = "프롬프트 복사";
    }, 1200);
  });
}

function rerollPreviewStage() {
  state.relayStage = pickRandomRelayStage(state.relayStage?.id || null);
  updateRelayPanel();
}

function frame(timestamp) {
  const deltaSeconds = lastTimestamp ? Math.min((timestamp - lastTimestamp) / 1000, MAX_DT) : FIXED_DT;
  lastTimestamp = timestamp;
  update(deltaSeconds);
  render();
  animationFrame = requestAnimationFrame(frame);
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms = 16.67) => {
  const steps = Math.max(1, Math.round(ms / (FIXED_DT * 1000)));
  for (let i = 0; i < steps; i += 1) {
    update(FIXED_DT);
  }
  render();
  return renderGameToText();
};
window.resetGame = restartCurrentRun;

document.addEventListener("keydown", onKeyDown);
document.addEventListener("keyup", onKeyUp);
document.addEventListener("fullscreenchange", render);
window.addEventListener("blur", () => {
  input.left = false;
  input.right = false;
  input.jumpHeld = false;
  input.jumpQueued = false;
});

copyPromptBtn?.addEventListener("click", copyPrompt);
rerollStageBtn?.addEventListener("click", rerollPreviewStage);

state.relayStage = pickRandomRelayStage();
updateRelayPanel();
loadStage(0);
render();
animationFrame = requestAnimationFrame(frame);

window.addEventListener("beforeunload", () => cancelAnimationFrame(animationFrame));
