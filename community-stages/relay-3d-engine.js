(function () {
  "use strict";

  var cfg = window.RELAY_3D_CONFIG;
  if (!cfg) throw new Error("RELAY_3D_CONFIG is required");

  var canvas = document.getElementById("game");
  var menu = document.getElementById("menu-card");
  var failCard = document.getElementById("fail-card");
  var clearCard = document.getElementById("clear-card");
  var hud = document.getElementById("hud");
  var progressFill = document.getElementById("progress-fill");
  var progressText = document.getElementById("progress-text");
  var statusText = document.getElementById("status-text");
  var leftButton = document.getElementById("left-button");
  var rightButton = document.getElementById("right-button");
  var actionButton = document.getElementById("action-button");
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var relayContext = window.RelayRuntime?.readContext(cfg.id) || { history: [], clearCount: 0, previousStageId: null };
  var lanes = [-4, 0, 4];
  var FIXED_DT = 1 / 60;
  var state = {
    mode: "menu", elapsed: 0, score: 0, mistakes: 0, lane: 1, playerX: 0,
    spawnClock: 0.7, actionQueued: false, lastResult: ""
  };
  var entities = [];
  var shots = [];
  var visual = null;
  var raf = 0;
  var lastFrame = 0;
  var hostClearSent = false;
  var hostFailSent = false;

  window.relayStageMeta = {
    id: cfg.id, title: cfg.title, creator: cfg.creator, genre: cfg.genre,
    clearCondition: cfg.clearCondition
  };
  window.relayStageResult = { status: "running" };

  function host() {
    try { return window.parent !== window && window.parent.RelayHost; } catch (_) { return null; }
  }
  function showCard(card) {
    [menu, failCard, clearCard].forEach(function (node) { node.classList.remove("visible"); });
    if (card) card.classList.add("visible");
  }
  function updateHud() {
    var target = cfg.mode === "runner" ? cfg.duration : cfg.target;
    var current = cfg.mode === "runner" ? Math.min(cfg.duration, state.elapsed) : state.score;
    var pct = Math.max(0, Math.min(100, current / target * 100));
    progressFill.style.width = pct + "%";
    progressText.textContent = cfg.mode === "runner"
      ? Math.max(0, cfg.duration - state.elapsed).toFixed(1) + "초"
      : state.score + " / " + cfg.target;
    statusText.textContent = cfg.mistakes === 1
      ? "충돌 즉시 실패"
      : "위험 " + state.mistakes + " / " + cfg.mistakes;
  }
  function reset() {
    state.elapsed = 0; state.score = 0; state.mistakes = 0; state.lane = 1;
    state.playerX = 0; state.spawnClock = 0.55; state.actionQueued = false; state.lastResult = "";
    entities.length = 0; shots.length = 0;
    if (visual) visual.reset();
    updateHud();
  }
  function start() {
    if (state.mode === "running") return;
    reset(); state.mode = "running"; window.relayStageResult.status = "running";
    hostClearSent = false; hostFailSent = false; showCard(null); hud.classList.add("visible");
    canvas.focus({ preventScroll: true });
  }
  function clearStage(reason) {
    if (state.mode !== "running") return;
    state.mode = "cleared"; state.lastResult = reason || cfg.clearCondition;
    window.relayStageResult.status = "cleared"; hud.classList.remove("visible");
    document.getElementById("clear-detail").textContent = state.lastResult;
    showCard(clearCard);
    var relayHost = host();
    if (relayHost && !hostClearSent) {
      hostClearSent = true;
      relayHost.onStageCleared?.({ stageId: cfg.id, stageTitle: cfg.title, durationSec: Number(state.elapsed.toFixed(1)), clearCountAfter: relayContext.clearCount + 1 });
    }
  }
  function failStage(reason) {
    if (state.mode !== "running") return;
    state.mode = "failed"; state.lastResult = reason || cfg.failCondition;
    window.relayStageResult.status = "failed"; hud.classList.remove("visible");
    document.getElementById("fail-detail").textContent = state.lastResult;
    showCard(failCard);
    if (visual) visual.impact();
    var relayHost = host();
    if (relayHost && !hostFailSent) {
      hostFailSent = true;
      relayHost.onStageFailed?.({ stageId: cfg.id, stageTitle: cfg.title, reason: state.lastResult, durationSec: Number(state.elapsed.toFixed(1)) });
    }
  }
  function mistake(reason) {
    state.mistakes += 1;
    if (visual) visual.impact();
    if (state.mistakes >= cfg.mistakes) failStage(reason || cfg.failCondition);
    updateHud();
  }
  function move(direction) {
    if (state.mode !== "running") { start(); return; }
    state.lane = Math.max(0, Math.min(2, state.lane + direction));
  }
  function action() {
    if (state.mode !== "running") { start(); return; }
    if (cfg.mode === "shooter") {
      shots.push({ x: state.playerX, z: 0, speed: 44 });
      if (visual) visual.muzzle();
    } else {
      state.actionQueued = true;
      if (visual) visual.pulse();
    }
  }
  function completeOne(label) {
    state.score += 1;
    state.lastResult = label;
    if (visual) visual.reward();
    updateHud();
    if (state.score >= cfg.target) clearStage(cfg.clearCondition);
  }
  function difficultyAt(seconds) {
    var limit = cfg.mode === "runner" ? cfg.duration : (cfg.timeLimit || 30);
    return Math.max(0, Math.min(1, Number(seconds || 0) / Math.max(1, limit)));
  }
  function spawnEntity() {
    var goodChance = cfg.mode === "runner" ? 0 : (cfg.mode === "shooter" ? 0.72 : 0.64);
    var good = Math.random() < goodChance;
    var lane = Math.floor(Math.random() * 3);
    entities.push({
      id: Math.random().toString(36).slice(2), lane: lane, x: lanes[lane], z: -78,
      good: good, speed: cfg.speed * (0.86 + Math.random() * 0.3), spin: Math.random() * 6.28,
      resolved: false, mesh: visual ? visual.entity(good, lane) : null
    });
  }
  function update(dt) {
    if (state.mode !== "running") { if (visual) visual.update(dt, state, entities, shots); return; }
    state.elapsed += dt;
    state.playerX += (lanes[state.lane] - state.playerX) * Math.min(1, dt * 11);
    state.spawnClock -= dt;
    if (state.spawnClock <= 0) {
      spawnEntity();
      state.spawnClock = cfg.spawn * (0.78 + Math.random() * 0.42) * Math.max(0.72, 1 - state.elapsed * 0.006);
    }

    shots.forEach(function (shot) { shot.z -= shot.speed * dt; });
    shots = shots.filter(function (shot) { return shot.z > -90 && !shot.dead; });
    entities.forEach(function (entity) {
      entity.z += entity.speed * dt;
      entity.spin += dt * 2.4;
      if (entity.resolved) return;
      if (cfg.mode === "shooter" && entity.good) {
        var hit = shots.find(function (shot) { return !shot.dead && Math.abs(shot.x - entity.x) < 1.7 && Math.abs(shot.z - entity.z) < 3; });
        if (hit) { hit.dead = true; entity.resolved = true; completeOne(cfg.hitLabel); }
      }
      var sameLane = Math.abs(entity.x - state.playerX) < 1.8;
      if (entity.z > -1.8 && entity.z < 4.8 && sameLane && !entity.resolved) {
        if (cfg.mode === "runner") {
          entity.resolved = true; mistake(cfg.failCondition);
        } else if (cfg.mode === "shooter") {
          if (!entity.good) { entity.resolved = true; mistake(cfg.dangerLabel); }
        } else if (entity.good && (!cfg.requiresAction || state.actionQueued)) {
          entity.resolved = true; state.actionQueued = false; completeOne(cfg.hitLabel);
        } else if (!entity.good) {
          entity.resolved = true; state.actionQueued = false; mistake(cfg.dangerLabel);
        }
      }
      if (entity.z > 7 && !entity.resolved) {
        entity.resolved = true;
        if (cfg.mode === "shooter" && entity.good) mistake(cfg.missLabel);
        if (cfg.mode === "timing" && entity.good) mistake(cfg.missLabel);
      }
    });
    state.actionQueued = false;
    entities = entities.filter(function (entity) {
      var keep = entity.z < 12 && !entity.resolved;
      if (!keep && visual && entity.mesh) visual.remove(entity.mesh);
      return keep;
    });
    if (cfg.mode === "runner" && state.elapsed >= cfg.duration) clearStage(cfg.clearCondition);
    if (cfg.timeLimit && state.elapsed >= cfg.timeLimit && state.score < cfg.target) failStage("제한 시간 안에 목표를 달성하지 못했습니다");
    updateHud();
    if (visual) visual.update(dt, state, entities, shots);
  }

  function buildVisuals() {
    if (typeof THREE === "undefined") return null;
    var originalConsoleError = console.error;
    var renderer;
    try {
      console.error = function () {};
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    } finally {
      console.error = originalConsoleError;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    var scene = new THREE.Scene();
    scene.background = new THREE.Color(cfg.palette.sky);
    scene.fog = new THREE.FogExp2(cfg.palette.fog, cfg.fog || 0.018);
    var camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.1, 220);
    camera.position.set(0, 6.7, 11.5); camera.lookAt(0, 0.4, -20);
    scene.add(new THREE.HemisphereLight(cfg.palette.light, cfg.palette.ground, 1.35));
    var key = new THREE.DirectionalLight(cfg.palette.accent, 2.1);
    key.position.set(-9, 16, 8); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -16; key.shadow.camera.right = 16; key.shadow.camera.top = 24; key.shadow.camera.bottom = -8;
    scene.add(key);
    var rim = new THREE.PointLight(cfg.palette.glow, 18, 55, 2); rim.position.set(7, 7, -10); scene.add(rim);
    var world = new THREE.Group(); scene.add(world);
    var entityGroup = new THREE.Group(); scene.add(entityGroup);
    var shotGroup = new THREE.Group(); scene.add(shotGroup);
    var particleGroup = new THREE.Group(); scene.add(particleGroup);
    var shake = 0; var pulse = 0; var reward = 0; var muzzle = 0;

    function material(color, emissive, metalness, roughness) {
      return new THREE.MeshStandardMaterial({ color: color, emissive: emissive || 0x000000, emissiveIntensity: emissive ? 1.2 : 0, metalness: metalness == null ? 0.5 : metalness, roughness: roughness == null ? 0.35 : roughness });
    }
    var floorMat = material(cfg.palette.floor, cfg.palette.floorGlow, 0.65, 0.28);
    var floor = new THREE.Mesh(new THREE.BoxGeometry(14, 0.45, 190), floorMat);
    floor.position.set(0, -1.05, -68); floor.receiveShadow = true; world.add(floor);
    [-2, 2].forEach(function (x) {
      var strip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.025, 190), new THREE.MeshBasicMaterial({ color: cfg.palette.glow }));
      strip.position.set(x, -0.79, -68); world.add(strip);
    });
    [-7.2, 7.2].forEach(function (x) {
      var rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 190), material(cfg.palette.accent, cfg.palette.glow, 0.8, 0.22));
      rail.position.set(x, -0.45, -68); world.add(rail);
    });

    var decoGeo = cfg.theme === "cavern" ? new THREE.ConeGeometry(1.3, 5, 5) : new THREE.BoxGeometry(2, 2, 2);
    for (var i = 0; i < 46; i += 1) {
      var s = 0.6 + Math.random() * 2.3;
      var deco = new THREE.Mesh(decoGeo, material(i % 4 === 0 ? cfg.palette.accent : cfg.palette.deco, i % 7 === 0 ? cfg.palette.glow : 0, 0.45, 0.5));
      deco.scale.set(s, cfg.theme === "city" ? 2 + Math.random() * 7 : s * (0.8 + Math.random() * 2.4), s);
      deco.position.set((i % 2 ? -1 : 1) * (10 + Math.random() * 20), cfg.theme === "space" ? -2 + Math.random() * 22 : deco.scale.y - 1, -5 - Math.random() * 170);
      deco.rotation.set(Math.random(), Math.random(), Math.random()); world.add(deco);
    }
    var starGeo = new THREE.BufferGeometry(); var points = [];
    for (var p = 0; p < 420; p += 1) points.push((Math.random() - 0.5) * 130, Math.random() * 65 - 8, -Math.random() * 190);
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    var stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: cfg.palette.light, size: cfg.theme === "underwater" ? 0.16 : 0.11, transparent: true, opacity: 0.7 }));
    scene.add(stars);

    function playerMesh() {
      var group = new THREE.Group();
      var bodyGeo = cfg.player === "orb" ? new THREE.SphereGeometry(1.25, 28, 20) : cfg.player === "sub" ? new THREE.CapsuleGeometry(0.85, 2.2, 8, 16) : new THREE.BoxGeometry(2.2, 0.8, 3.1);
      var body = new THREE.Mesh(bodyGeo, material(cfg.palette.player, cfg.palette.playerGlow, 0.85, 0.18));
      body.castShadow = true; group.add(body);
      var core = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 12), new THREE.MeshBasicMaterial({ color: cfg.palette.light }));
      core.position.set(0, 0.25, cfg.player === "orb" ? 1 : -1.55); group.add(core);
      if (cfg.player !== "orb") {
        [-1, 1].forEach(function (side) {
          var wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 1.8), material(cfg.palette.accent, cfg.palette.glow, 0.7, 0.22));
          wing.position.set(side * 1.45, -0.05, 0.15); wing.rotation.z = side * -0.18; group.add(wing);
        });
      }
      group.position.set(0, 0.15, 2); scene.add(group); return group;
    }
    var player = playerMesh();

    function entityMesh(good, lane) {
      var geo;
      if (good) geo = cfg.mode === "shooter" ? new THREE.OctahedronGeometry(1.25, 0) : new THREE.IcosahedronGeometry(1, 1);
      else geo = cfg.theme === "temple" ? new THREE.BoxGeometry(2.6, 3.2, 1.8) : new THREE.TetrahedronGeometry(1.45, 0);
      var color = good ? cfg.palette.good : cfg.palette.danger;
      var mesh = new THREE.Mesh(geo, material(color, color, good ? 0.55 : 0.75, 0.22));
      mesh.castShadow = true; mesh.position.set(lanes[lane], good ? 0.6 : 0.75, -78);
      var ring = new THREE.Mesh(new THREE.TorusGeometry(good ? 1.5 : 1.75, 0.08, 8, 34), new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.75 }));
      ring.rotation.x = Math.PI / 2; mesh.add(ring); entityGroup.add(mesh); return mesh;
    }
    function remove(mesh) { entityGroup.remove(mesh); }
    function burst(color, count) {
      for (var i = 0; i < count; i += 1) {
        var dot = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.08, 6, 4), new THREE.MeshBasicMaterial({ color: color, transparent: true }));
        dot.position.copy(player.position); dot.userData.v = new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 7, (Math.random() - 0.5) * 7); dot.userData.life = 0.75;
        particleGroup.add(dot);
      }
    }
    function resize() {
      var w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
      if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    function resetVisual() {
      while (entityGroup.children.length) entityGroup.remove(entityGroup.children[0]);
      while (shotGroup.children.length) shotGroup.remove(shotGroup.children[0]);
      player.position.x = 0; shake = pulse = reward = muzzle = 0;
    }
    function updateVisual(dt, gameState, gameEntities, gameShots) {
      resize();
      player.position.x = gameState.playerX;
      player.position.y = 0.2 + Math.sin(gameState.elapsed * 5) * (reducedMotion ? 0.01 : 0.1);
      player.rotation.z += ((lanes[gameState.lane] - gameState.playerX) * -0.08 - player.rotation.z) * Math.min(1, dt * 9);
      if (cfg.player === "orb") player.rotation.x -= dt * cfg.speed * 0.15;
      gameEntities.forEach(function (e) { if (e.mesh) { e.mesh.position.z = e.z; e.mesh.rotation.y = e.spin; e.mesh.rotation.x = Math.sin(e.spin * 0.7) * 0.25; } });
      while (shotGroup.children.length > gameShots.length) shotGroup.remove(shotGroup.children[shotGroup.children.length - 1]);
      while (shotGroup.children.length < gameShots.length) {
        var bolt = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 1.1, 4, 8), new THREE.MeshBasicMaterial({ color: cfg.palette.light }));
        bolt.rotation.x = Math.PI / 2; shotGroup.add(bolt);
      }
      gameShots.forEach(function (shot, i) { shotGroup.children[i].position.set(shot.x, 0.35, shot.z); });
      world.position.z = (world.position.z + cfg.speed * dt * 0.22) % 18;
      stars.position.z = (stars.position.z + cfg.speed * dt * 0.035) % 40;
      for (var i = particleGroup.children.length - 1; i >= 0; i -= 1) {
        var dot = particleGroup.children[i]; dot.userData.life -= dt; dot.position.addScaledVector(dot.userData.v, dt); dot.material.opacity = Math.max(0, dot.userData.life / 0.75);
        if (dot.userData.life <= 0) particleGroup.remove(dot);
      }
      shake = Math.max(0, shake - dt); pulse = Math.max(0, pulse - dt); reward = Math.max(0, reward - dt); muzzle = Math.max(0, muzzle - dt);
      camera.position.x = (Math.random() - 0.5) * shake * 0.8;
      camera.position.y = 6.7 + (Math.random() - 0.5) * shake * 0.4;
      rim.intensity = 18 + pulse * 40 + reward * 30 + muzzle * 60;
      renderer.render(scene, camera);
    }
    return {
      reset: resetVisual, entity: entityMesh, remove: remove,
      impact: function () { shake = 0.45; burst(cfg.palette.danger, 24); },
      pulse: function () { pulse = 0.22; }, reward: function () { reward = 0.35; burst(cfg.palette.good, 18); },
      muzzle: function () { muzzle = 0.12; }, update: updateVisual
    };
  }

  function buildFallbackVisuals() {
    var ctx = canvas.getContext("2d");
    if (!ctx) return null;
    var width = 1; var height = 1; var dpr = 1; var shake = 0; var flash = 0;
    var dust = Array.from({ length: 120 }, function (_, index) {
      return { x: ((index * 71) % 997) / 997, y: ((index * 137) % 991) / 991, size: 0.5 + (index % 5) * 0.35, speed: 0.02 + (index % 7) * 0.008 };
    });
    var sparks = [];
    function cssColor(value, alpha) {
      var color = "#" + Number(value || 0).toString(16).padStart(6, "0");
      if (alpha == null) return color;
      var r = (value >> 16) & 255, g = (value >> 8) & 255, b = value & 255;
      return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }
    function resize() {
      width = Math.max(1, canvas.clientWidth); height = Math.max(1, canvas.clientHeight); dpr = Math.min(window.devicePixelRatio || 1, 2);
      var pixelWidth = Math.floor(width * dpr), pixelHeight = Math.floor(height * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    function roundRect(x, y, w, h, radius) {
      ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
    }
    function project(laneX, z) {
      var t = Math.max(0, Math.min(1.08, (z + 80) / 87));
      var horizon = height * 0.29;
      return { x: width * 0.5 + laneX * (width * (0.012 + t * 0.055)), y: horizon + Math.pow(t, 1.58) * height * 0.68, s: 5 + Math.pow(t, 1.75) * Math.min(width, height) * 0.125, t: t };
    }
    function drawBackground(gameState) {
      var bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, cssColor(cfg.palette.sky)); bg.addColorStop(0.46, cssColor(cfg.palette.fog)); bg.addColorStop(1, "#02040b");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
      var aura = ctx.createRadialGradient(width * 0.5, height * 0.26, 4, width * 0.5, height * 0.3, width * 0.55);
      aura.addColorStop(0, cssColor(cfg.palette.accent, 0.54)); aura.addColorStop(0.3, cssColor(cfg.palette.glow, 0.18)); aura.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = aura; ctx.fillRect(0, 0, width, height);
      dust.forEach(function (star) {
        var y = ((star.y + gameState.elapsed * star.speed) % 1) * height;
        ctx.globalAlpha = 0.25 + star.size * 0.17; ctx.fillStyle = cssColor(cfg.palette.light); ctx.beginPath(); ctx.arc(star.x * width, y, star.size, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
      var horizon = height * 0.29;
      if (cfg.theme === "city" || cfg.theme === "temple") {
        for (var i = 0; i < 18; i += 1) {
          var towerW = width * (0.025 + (i % 4) * 0.008), towerH = height * (0.08 + (i % 6) * 0.035);
          var side = i % 2 ? -1 : 1; var tx = width * 0.5 + side * (width * 0.22 + Math.floor(i / 2) * width * 0.025);
          ctx.fillStyle = cssColor(cfg.palette.deco, 0.55); ctx.fillRect(tx - towerW / 2, horizon - towerH, towerW, towerH);
          ctx.fillStyle = cssColor(cfg.palette.glow, 0.34);
          for (var wy = horizon - towerH + 9; wy < horizon - 4; wy += 12) ctx.fillRect(tx - towerW * 0.28, wy, towerW * 0.56, 2);
        }
      } else if (cfg.theme === "cavern" || cfg.theme === "underwater") {
        for (var c = 0; c < 15; c += 1) {
          var sideC = c % 2 ? -1 : 1; var cx = width * 0.5 + sideC * (width * 0.25 + (c % 5) * width * 0.055); var ch = height * (0.1 + (c % 4) * 0.045);
          ctx.fillStyle = cssColor(c % 3 ? cfg.palette.deco : cfg.palette.glow, c % 3 ? 0.5 : 0.34);
          ctx.beginPath(); ctx.moveTo(cx - 18, horizon); ctx.lineTo(cx, horizon - ch); ctx.lineTo(cx + 18, horizon); ctx.fill();
        }
      }
    }
    function drawTrack(gameState) {
      var horizon = height * 0.29;
      var track = ctx.createLinearGradient(0, horizon, 0, height);
      track.addColorStop(0, cssColor(cfg.palette.floor, 0.45)); track.addColorStop(1, cssColor(cfg.palette.floor));
      ctx.fillStyle = track; ctx.beginPath(); ctx.moveTo(width * 0.43, horizon); ctx.lineTo(width * 0.03, height); ctx.lineTo(width * 0.97, height); ctx.lineTo(width * 0.57, horizon); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = cssColor(cfg.palette.glow, 0.82); ctx.shadowColor = cssColor(cfg.palette.glow); ctx.shadowBlur = 12; ctx.lineWidth = 2;
      [-1, 1].forEach(function (line) { ctx.beginPath(); ctx.moveTo(width * 0.5 + line * width * 0.023, horizon); ctx.lineTo(width * 0.5 + line * width * 0.16, height); ctx.stroke(); });
      ctx.shadowBlur = 0;
      for (var g = 0; g < 12; g += 1) {
        var phase = (g / 12 + gameState.elapsed * cfg.speed * 0.012) % 1;
        var gy = horizon + Math.pow(phase, 1.7) * (height - horizon);
        var half = width * (0.07 + phase * 0.43);
        ctx.strokeStyle = cssColor(cfg.palette.accent, 0.12 + phase * 0.35); ctx.lineWidth = 1 + phase * 1.5;
        ctx.beginPath(); ctx.moveTo(width * 0.5 - half, gy); ctx.lineTo(width * 0.5 + half, gy); ctx.stroke();
      }
    }
    function drawEntity(entity) {
      var p = project(entity.x, entity.z); if (p.t <= 0 || p.t > 1.05) return;
      var color = entity.good ? cfg.palette.good : cfg.palette.danger;
      ctx.save(); ctx.translate(p.x, p.y - p.s * 0.5); ctx.rotate(entity.spin * 0.45); ctx.shadowColor = cssColor(color); ctx.shadowBlur = p.s * 0.7;
      ctx.fillStyle = cssColor(color, 0.88); ctx.strokeStyle = cssColor(cfg.palette.light, 0.92); ctx.lineWidth = Math.max(1, p.s * 0.045);
      if (entity.good) {
        ctx.beginPath(); ctx.moveTo(0, -p.s); ctx.lineTo(p.s * 0.72, 0); ctx.lineTo(0, p.s); ctx.lineTo(-p.s * 0.72, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.rotate(-entity.spin * 0.9); ctx.beginPath(); ctx.arc(0, 0, p.s * 1.25, 0, Math.PI * 2); ctx.stroke();
      } else {
        var spikes = 8; ctx.beginPath();
        for (var i = 0; i < spikes * 2; i += 1) { var radius = i % 2 ? p.s * 0.58 : p.s; var angle = i / (spikes * 2) * Math.PI * 2; var x = Math.cos(angle) * radius, y = Math.sin(angle) * radius; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
    function drawPlayer(gameState) {
      var x = width * 0.5 + gameState.playerX * width * 0.055, y = height * 0.79; var size = Math.min(width, height) * 0.075;
      ctx.save(); ctx.translate(x, y); ctx.shadowColor = cssColor(cfg.palette.playerGlow); ctx.shadowBlur = 28; ctx.fillStyle = cssColor(cfg.palette.player); ctx.strokeStyle = cssColor(cfg.palette.light); ctx.lineWidth = 2;
      if (cfg.player === "orb") {
        var orb = ctx.createRadialGradient(-size * 0.28, -size * 0.32, 1, 0, 0, size); orb.addColorStop(0, "#ffffff"); orb.addColorStop(0.35, cssColor(cfg.palette.player)); orb.addColorStop(1, cssColor(cfg.palette.playerGlow)); ctx.fillStyle = orb;
        ctx.beginPath(); ctx.arc(0, 0, size, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.moveTo(0, -size * 1.15); ctx.lineTo(size * 0.48, -size * 0.18); ctx.lineTo(size * 1.25, size * 0.65); ctx.lineTo(size * 0.25, size * 0.38); ctx.lineTo(0, size * 0.92); ctx.lineTo(-size * 0.25, size * 0.38); ctx.lineTo(-size * 1.25, size * 0.65); ctx.lineTo(-size * 0.48, -size * 0.18); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = cssColor(cfg.palette.glow); roundRect(-size * 0.3, -size * 0.26, size * 0.6, size * 0.58, size * 0.18);
      }
      ctx.restore();
    }
    function drawShots(gameShots) {
      gameShots.forEach(function (shot) { var p = project(shot.x, shot.z); ctx.strokeStyle = cssColor(cfg.palette.light); ctx.shadowColor = cssColor(cfg.palette.glow); ctx.shadowBlur = 18; ctx.lineWidth = Math.max(2, p.s * 0.14); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y + p.s * 1.8); ctx.stroke(); }); ctx.shadowBlur = 0;
    }
    function emit(color, count) {
      for (var i = 0; i < count; i += 1) sparks.push({ x: width * 0.5 + state.playerX * width * 0.055, y: height * 0.79, vx: (Math.random() - 0.5) * width * 0.35, vy: (Math.random() - 0.7) * height * 0.35, life: 0.7, color: color });
    }
    function updateFallback(dt, gameState, gameEntities, gameShots) {
      resize(); shake = Math.max(0, shake - dt); flash = Math.max(0, flash - dt);
      ctx.save(); if (shake) ctx.translate((Math.random() - 0.5) * 12 * shake, (Math.random() - 0.5) * 12 * shake);
      drawBackground(gameState); drawTrack(gameState); gameEntities.slice().sort(function (a, b) { return a.z - b.z; }).forEach(drawEntity); drawShots(gameShots); drawPlayer(gameState);
      for (var i = sparks.length - 1; i >= 0; i -= 1) { var spark = sparks[i]; spark.life -= dt; spark.x += spark.vx * dt; spark.y += spark.vy * dt; spark.vy += height * 0.42 * dt; ctx.globalAlpha = Math.max(0, spark.life / 0.7); ctx.fillStyle = cssColor(spark.color); ctx.beginPath(); ctx.arc(spark.x, spark.y, 2 + spark.life * 4, 0, Math.PI * 2); ctx.fill(); if (spark.life <= 0) sparks.splice(i, 1); }
      ctx.globalAlpha = 1; if (flash) { ctx.fillStyle = cssColor(cfg.palette.light, flash * 0.22); ctx.fillRect(0, 0, width, height); } ctx.restore();
    }
    return {
      reset: function () { sparks.length = 0; shake = flash = 0; }, entity: function () { return {}; }, remove: function () {},
      impact: function () { shake = 0.75; emit(cfg.palette.danger, 28); }, pulse: function () { flash = 0.22; },
      reward: function () { flash = 0.28; emit(cfg.palette.good, 24); }, muzzle: function () { flash = 0.12; emit(cfg.palette.light, 8); }, update: updateFallback
    };
  }

  try { visual = buildVisuals(); } catch (error) {
    document.body.classList.add("webgl-fallback");
    visual = buildFallbackVisuals();
  }

  function press(button, fn) {
    button.addEventListener("pointerdown", function (event) {
      event.preventDefault(); button.dataset.active = "true"; fn();
      if (button.setPointerCapture) button.setPointerCapture(event.pointerId);
    });
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(function (name) {
      button.addEventListener(name, function () { button.dataset.active = "false"; });
    });
  }
  press(leftButton, function () { move(-1); });
  press(rightButton, function () { move(1); });
  press(actionButton, action);
  if (!cfg.actionLabel) actionButton.hidden = true;
  else { actionButton.textContent = cfg.actionLabel; actionButton.setAttribute("aria-label", cfg.actionLabel); }
  canvas.addEventListener("pointerdown", function (event) {
    if (state.mode !== "running") { event.preventDefault(); start(); }
  });
  canvas.addEventListener("touchstart", function (event) {
    if (state.mode !== "running") { event.preventDefault(); start(); }
  }, { passive: false });
  [menu, failCard, clearCard].forEach(function (card) {
    card.addEventListener("pointerdown", function (event) { event.preventDefault(); start(); });
  });
  window.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && state.mode !== "running") { event.preventDefault(); start(); }
    else if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") { event.preventDefault(); move(-1); }
    else if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") { event.preventDefault(); move(1); }
    else if (event.code === "Space") { event.preventDefault(); action(); }
  });

  window.render_game_to_text = function () {
    return JSON.stringify({
      mode: state.mode, result: window.relayStageResult.status, elapsed: Number(state.elapsed.toFixed(2)),
      phase: cfg.mode.toUpperCase(),
      lane: state.lane, score: state.score, target: cfg.mode === "runner" ? cfg.duration : cfg.target,
      difficulty: Number(difficultyAt(state.elapsed).toFixed(4)),
      mistakes: state.mistakes, nearby_entities: entities.filter(function (e) { return e.z > -28; }).map(function (e) { return { lane: e.lane, distance: Number(Math.abs(e.z).toFixed(1)), kind: e.good ? "objective" : "danger" }; }),
      relay_context: { previous_stage_id: relayContext.previousStageId, clear_count_before_this_stage: relayContext.clearCount }
    });
  };
  window.advanceTime = function (ms) {
    var steps = Math.max(1, Math.round((ms || 16.67) / (FIXED_DT * 1000)));
    for (var i = 0; i < steps; i += 1) update(FIXED_DT);
    return window.render_game_to_text();
  };
  window.relayStageDebug = {
    difficultyAt: difficultyAt,
    forceClear: function () { if (state.mode !== "running") start(); clearStage("디버그 클리어"); },
    forceFail: function () { if (state.mode !== "running") start(); failStage("디버그 실패"); }
  };
  var relayHost = host(); if (relayHost) relayHost.onStageReady?.(window.relayStageMeta);
  function frame(now) {
    var dt = lastFrame ? Math.min(0.05, (now - lastFrame) / 1000) : FIXED_DT; lastFrame = now;
    update(dt); raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  window.addEventListener("beforeunload", function () { cancelAnimationFrame(raf); });
})();
