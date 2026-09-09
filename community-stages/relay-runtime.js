(function relayRuntimeBootstrap() {
  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function parseList(value) {
    if (!value) {
      return [];
    }
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function readContext(currentStageId = null) {
    const params = new URLSearchParams(window.location.search);
    const history = parseList(params.get("history"));
    return {
      runId: params.get("run") || `run-${Date.now()}`,
      clearCount: Number(params.get("clearCount") || 0),
      previousStageId: params.get("previous") || null,
      history,
      currentStageId,
      relayToken: params.get("relayToken") || null,
    };
  }

  function buildStageUrl(path, context, nextStageId) {
    const history = [...context.history];
    const params = new URLSearchParams();
    params.set("run", context.runId);
    params.set("clearCount", String(context.clearCount));
    if (history.length) {
      params.set("history", history.join(","));
    }
    if (context.previousStageId) {
      params.set("previous", context.previousStageId);
    }
    if (context.relayToken) {
      params.set("relayToken", context.relayToken);
    }
    return `${path}?${params.toString()}`;
  }

  function buildNextContext(context, currentStageId) {
    const history = context.history.includes(currentStageId)
      ? [...context.history]
      : [...context.history, currentStageId];
    return {
      runId: context.runId,
      clearCount: context.clearCount + 1,
      previousStageId: currentStageId,
      history,
    };
  }

  function getAvailableStages(registry, context) {
    const excluded = new Set(context.history);
    if (context.currentStageId) {
      excluded.add(context.currentStageId);
    }
    return registry.filter((entry) => !excluded.has(entry.id));
  }

  function pickSecureRandomIndex(length) {
    if (length <= 0) {
      return -1;
    }

    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      const maxUint32 = 0x100000000;
      const threshold = maxUint32 - (maxUint32 % length);
      const buffer = new Uint32Array(1);

      do {
        window.crypto.getRandomValues(buffer);
      } while (buffer[0] >= threshold);

      return buffer[0] % length;
    }

    return Math.floor(Math.random() * length);
  }

  function pickRandomNext(registry, context) {
    const candidates = getAvailableStages(registry, context);
    if (!candidates.length) {
      return null;
    }
    return candidates[pickSecureRandomIndex(candidates.length)];
  }

  function goToRandomNext(registry, currentStageId) {
    const context = readContext(currentStageId);
    const nextContext = buildNextContext(context, currentStageId);
    const nextStage = pickRandomNext(registry, {
      ...nextContext,
      currentStageId,
    });

    if (!nextStage) {
      const params = new URLSearchParams();
      params.set("run", nextContext.runId);
      params.set("clearCount", String(nextContext.clearCount));
      params.set("history", nextContext.history.join(","));
      params.set("finished", "1");
      window.location.href = `../index.html?${params.toString()}`;
      return;
    }

    window.location.href = buildStageUrl(nextStage.path, nextContext, currentStageId);
  }

  function normalizeCreator(creator) {
    if (typeof creator === "string") {
      return { name: creator, avatar: null, github: null };
    }
    if (!creator) {
      return { name: "Unknown", avatar: null, github: null };
    }
    return {
      name: creator.name || "Unknown",
      avatar: creator.avatar || null,
      github: creator.github || null,
    };
  }

  function getCreatorAvatarUrl(creator) {
    var normalized = normalizeCreator(creator);
    if (normalized.avatar) {
      return normalized.avatar;
    }
    if (normalized.github) {
      return "https://github.com/" + normalized.github + ".png?size=80";
    }
    return null;
  }

  function decorateRegistryLinks(registry, listEl) {
    const context = readContext();
    const played = new Set(context.history);
    listEl.replaceChildren();
    registry.forEach((entry) => {
        const creator = normalizeCreator(entry.creator);
        const hasPlayed = played.has(entry.id);
        const href = buildStageUrl(entry.path, context, context.previousStageId);
        const card = document.createElement(hasPlayed ? "article" : "a");
        card.className = hasPlayed ? "stage-card stage-card-played" : "stage-card";
        if (hasPlayed) card.setAttribute("aria-disabled", "true");
        else {
          card.href = href;
          card.setAttribute("aria-label", `${entry.title} 플레이하기`);
        }
        const label = document.createElement("p"); label.className = "card-label"; label.textContent = entry.genre;
        const title = document.createElement("h2"); title.textContent = entry.title;
        const meta = document.createElement("p"); meta.className = "card-meta"; meta.textContent = `by ${creator.name}`;
        const copy = document.createElement("p"); copy.className = "card-copy"; copy.textContent = entry.clearCondition;
        const footer = document.createElement("div"); footer.className = "card-footer";
        const action = document.createElement("span");
        action.className = hasPlayed ? "card-link card-link-disabled" : "card-link";
        action.textContent = hasPlayed ? "이미 진행함" : "플레이하기";
        footer.append(action);
        if (hasPlayed) {
          const badge = document.createElement("span"); badge.className = "card-status"; badge.textContent = "진행함";
          footer.append(badge);
        }
        card.append(label, title, meta, copy, footer);
        listEl.append(card);
      });
  }

  const stageContext = readContext();
  window.RelayStageHost = {
    onStageReady(payload) { postStageEvent("ready", payload); },
    onStageCleared(payload) { postStageEvent("cleared", payload); },
    onStageFailed(payload) { postStageEvent("failed", payload); },
  };

  function postStageEvent(type, payload) {
    if (window.parent === window || !stageContext.relayToken) return;
    window.parent.postMessage({
      channel: "one-life-relay-stage",
      type,
      token: stageContext.relayToken,
      payload: payload && typeof payload === "object" ? payload : {},
    }, "*");
  }

  window.RelayRuntime = {
    escapeHtml,
    readContext,
    pickRandomNext,
    goToRandomNext,
    decorateRegistryLinks,
    buildStageUrl,
    normalizeCreator,
    getCreatorAvatarUrl,
  };
})();
