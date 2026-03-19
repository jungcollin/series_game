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
    listEl.innerHTML = registry
      .map((entry) => {
        const creator = normalizeCreator(entry.creator);
        const hasPlayed = played.has(entry.id);
        const playedBadge = hasPlayed ? `<span class="card-status">진행함</span>` : "";
        const href = buildStageUrl(entry.path, context, context.previousStageId);
        const wrapperTag = hasPlayed ? "article" : "a";
        const wrapperAttrs = hasPlayed
          ? `class="stage-card stage-card-played" aria-disabled="true"`
          : `class="stage-card" href="${href}" aria-label="${escapeHtml(entry.title)} 플레이하기"`;
        const actionLabel = hasPlayed ? "이미 진행함" : "플레이하기";
        const actionClass = hasPlayed ? "card-link card-link-disabled" : "card-link";
        return `
          <${wrapperTag} ${wrapperAttrs}>
            <p class="card-label">${escapeHtml(entry.genre)}</p>
            <h2>${escapeHtml(entry.title)}</h2>
            <p class="card-meta">by ${escapeHtml(creator.name)}</p>
            <p class="card-copy">${escapeHtml(entry.clearCondition)}</p>
            <div class="card-footer">
              <span class="${actionClass}">${actionLabel}</span>
              ${playedBadge}
            </div>
          </${wrapperTag}>
        `;
      })
      .join("");
  }

  window.RelayRuntime = {
    readContext,
    pickRandomNext,
    goToRandomNext,
    decorateRegistryLinks,
    buildStageUrl,
    normalizeCreator,
    getCreatorAvatarUrl,
  };
})();
