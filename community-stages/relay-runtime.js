(function relayRuntimeBootstrap() {
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

  function pickRandomNext(registry, context) {
    const excluded = new Set(context.history);
    if (context.currentStageId) {
      excluded.add(context.currentStageId);
    }
    const candidates = registry.filter((entry) => !excluded.has(entry.id));
    if (!candidates.length) {
      return null;
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
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

  function decorateRegistryLinks(registry, listEl) {
    const context = readContext();
    const played = new Set(context.history);
    listEl.innerHTML = registry
      .map((entry) => {
        const playedBadge = played.has(entry.id) ? `<span class="card-status">Played</span>` : "";
        const href = buildStageUrl(entry.path, context, context.previousStageId);
        return `
          <a class="stage-card" href="${href}">
            <p class="card-label">${entry.genre}</p>
            <h2>${entry.title}</h2>
            <p class="card-meta">by ${entry.creator}</p>
            <p class="card-copy">${entry.clearCondition}</p>
            <div class="card-footer">
              <span class="card-link">플레이하기</span>
              ${playedBadge}
            </div>
          </a>
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
  };
})();
