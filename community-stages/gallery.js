(function galleryBootstrap() {
  var entries = window.COMMUNITY_STAGE_REGISTRY || [];
  var gridEl = document.querySelector("#gallery-grid");
  var feedbackEl = document.querySelector("#gallery-feedback");
  var sortButtons = document.querySelectorAll(".sort-btn[data-sort]");
  var searchEl = document.querySelector("#gallery-search");
  var genreEl = document.querySelector("#gallery-genre");
  var genEl = document.querySelector("#gallery-generation");
  var favOnlyBtn = document.querySelector("#gallery-fav-only");
  var eventOnlyBtn = document.querySelector("#gallery-event-only");
  var voteScores = new Map(); // stageId -> { score, upvotes, downvotes }
  var myVotes = {}; // stageId -> 1 | -1
  var SORT_STORAGE_KEY = "olr-gallery-sort";
  var SCROLL_STORAGE_KEY = "olr-gallery-scroll";
  var urlState = window.RelayGalleryFilter
    ? window.RelayGalleryFilter.readSearchParams(window.location.search)
    : { q: "", genre: "", gen: "", sort: "", fav: false };
  var savedSort = urlState.sort || localStorage.getItem(SORT_STORAGE_KEY);
  var currentSort =
    savedSort === "popular" || savedSort === "newest" || savedSort === "name"
      ? savedSort
      : "popular";
  var currentQuery = urlState.q || "";
  var currentGenre = urlState.genre || "";
  var currentGen = urlState.gen || "";
  var favOnly = Boolean(urlState.fav);
  var eventOnly = Boolean(urlState.event);
  var activeEventStageIds = null;
  var hasLoadedVoteScores = false;

  var GENRE_STYLES = {
    "Luck & Speed": { bg: "#f3c677", icon: "\uD83C\uDFB0" },
    "Arcade survival": { bg: "#7bc8f6", icon: "\u26A1" },
    Platformer: { bg: "#7be0a8", icon: "\uD83C\uDFC3" },
    "Arcade shooter": { bg: "#b57bef", icon: "\uD83D\uDE80" },
    "Math quiz": { bg: "#f7a07b", icon: "\uD83E\uDDEE" },
  };
  var DEFAULT_GENRE = { bg: "#c4c4c4", icon: "\uD83C\uDFAE" };

  function normalizeCreator(creator) {
    if (window.RelayRuntime && window.RelayRuntime.normalizeCreator) {
      return window.RelayRuntime.normalizeCreator(creator);
    }
    if (typeof creator === "string")
      return { name: creator, avatar: null, github: null };
    if (!creator) return { name: "Unknown", avatar: null, github: null };
    return {
      name: creator.name || "Unknown",
      avatar: creator.avatar || null,
      github: creator.github || null,
    };
  }

  function getAvatarUrl(creator) {
    if (window.RelayRuntime && window.RelayRuntime.getCreatorAvatarUrl) {
      return window.RelayRuntime.getCreatorAvatarUrl(creator);
    }
    var c = normalizeCreator(creator);
    if (c.avatar) return c.avatar;
    if (c.github) return "https://github.com/" + c.github + ".png?size=80";
    return null;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getGenreStyle(genre) {
    return GENRE_STYLES[genre] || DEFAULT_GENRE;
  }

  function generationLabel(generation) {
    return generation === "v2" ? "정식" : "클래식";
  }

  function getStageThumbnailUrl(entry) {
    if (!entry || !entry.thumbnail) {
      return null;
    }
    var url = String(entry.thumbnail).trim();
    return url || null;
  }

  function renderCreatorAvatar(creator) {
    var c = normalizeCreator(creator);
    var url = getAvatarUrl(creator);
    if (url) {
      return (
        '<img class="creator-avatar" src="' +
        escapeHtml(url) +
        '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'" />' +
        '<span class="creator-avatar-placeholder" style="display:none">' +
        escapeHtml(c.name.charAt(0).toUpperCase()) +
        "</span>"
      );
    }
    return (
      '<span class="creator-avatar-placeholder">' +
      escapeHtml(c.name.charAt(0).toUpperCase()) +
      "</span>"
    );
  }

  function getScore(stageId) {
    var s = voteScores.get(stageId);
    return s ? s.score : 0;
  }

  function getScoreState(score) {
    if (score <= -5) return "negative-strong";
    if (score < 0) return "negative";
    if (score >= 10) return "positive-strong";
    if (score > 0) return "positive";
    return "neutral";
  }

  function getScoreHeartIcon(score) {
    var state = getScoreState(score);
    if (state === "negative" || state === "negative-strong")
      return "\uD83D\uDDA4";
    if (state === "neutral") return "\uD83E\uDD0D";
    return "\u2764\uFE0F";
  }

  function setScoreVisual(el, score) {
    if (!el) return;
    el.dataset.scoreState = getScoreState(score);
    var iconEl = el.querySelector(".heart-icon");
    if (iconEl) {
      iconEl.textContent = getScoreHeartIcon(score);
    }
    el.setAttribute("aria-label", "좋아요 점수 " + score);
  }

  function announceFeedback(message) {
    if (feedbackEl) {
      feedbackEl.textContent = message || "";
    }
  }

  function renderCard(entry) {
    var creator = normalizeCreator(entry.creator);
    var genre = getGenreStyle(entry.genre);
    var thumbnailUrl = getStageThumbnailUrl(entry);
    var score = getScore(entry.id);
    var myVote = myVotes[entry.id] || 0;
    var scoreState = getScoreState(score);
    var heartIcon = getScoreHeartIcon(score);
    var playHref = "./play.html?stage=" + encodeURIComponent(entry.id);
    var thumbnailMarkup = thumbnailUrl
      ? '<img class="stage-card-thumb-image" src="' +
        escapeHtml(thumbnailUrl) +
        '" alt="" loading="lazy" decoding="async" onerror="this.remove()" />'
      : "";
    var genreIconMarkup = thumbnailUrl
      ? ""
      : '<span class="stage-card-thumb-icon">' + genre.icon + "</span>";

    return (
      '<article class="stage-card tilt-card reveal-up glow-target" data-stage-id="' +
      escapeHtml(entry.id) +
      '">' +
      '<a class="stage-card-media-link" href="' +
      playHref +
      '" aria-label="' +
      escapeHtml(entry.title) +
      ' 플레이 페이지로 이동">' +
      '<div class="stage-card-thumb" data-has-image="' +
      (thumbnailUrl ? "true" : "false") +
      '" style="background:' +
      genre.bg +
      '">' +
      thumbnailMarkup +
      genreIconMarkup +
      '<span class="stage-card-genre">' +
      escapeHtml(entry.genre) +
      "</span>" +
      '<span class="stage-card-gen" aria-label="' +
      escapeHtml(generationLabel(entry.generation)) +
      '">' +
      escapeHtml(generationLabel(entry.generation)) +
      "</span>" +
      '<span class="stage-card-heart" data-stage-id="' +
      escapeHtml(entry.id) +
      '" data-score-state="' +
      scoreState +
      '" aria-label="좋아요 점수 ' +
      score +
      '"><span class="heart-icon" aria-hidden="true">' +
      heartIcon +
      '</span> <span class="vote-score">' +
      score +
      "</span></span>" +
      "</div>" +
      "</a>" +
      '<div class="stage-card-body">' +
      '<h3 class="stage-card-title"><a class="stage-card-title-link" href="' +
      playHref +
      '">' +
      escapeHtml(entry.title) +
      "</a></h3>" +
      '<p class="stage-card-condition">' +
      escapeHtml(entry.clearCondition) +
      "</p>" +
      '<div class="stage-card-creator">' +
      renderCreatorAvatar(entry.creator) +
      (creator.github
        ? '<a class="creator-name" href="./creators.html?github=' +
          encodeURIComponent(creator.github) +
          '">' +
          escapeHtml(creator.name) +
          "</a>"
        : '<span class="creator-name">' +
          escapeHtml(creator.name) +
          "</span>") +
      "</div>" +
      '<div class="stage-card-actions">' +
      '<div class="vote-group">' +
      '<button class="vote-btn vote-up magnetic-btn" data-stage-id="' +
      escapeHtml(entry.id) +
      '" data-vote="1" data-active="' +
      (myVote === 1) +
      '" type="button" aria-label="좋아요">+</button>' +
      '<button class="vote-btn vote-down magnetic-btn" data-stage-id="' +
      escapeHtml(entry.id) +
      '" data-vote="-1" data-active="' +
      (myVote === -1) +
      '" type="button" aria-label="싫어요">−</button>' +
      "</div>" +
      '<button class="fav-btn magnetic-btn" type="button" data-stage-id="' +
      escapeHtml(entry.id) +
      '" aria-pressed="' +
      (window.RelayLocalStore && window.RelayLocalStore.isFavorite(entry.id)
        ? "true"
        : "false") +
      '" aria-label="즐겨찾기">' +
      (window.RelayLocalStore && window.RelayLocalStore.isFavorite(entry.id)
        ? "저장됨"
        : "저장") +
      "</button>" +
      '<a class="play-link magnetic-btn" href="./play.html?stage=' +
      encodeURIComponent(entry.id) +
      '">플레이</a>' +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function syncUrl() {
    if (
      !window.RelayGalleryFilter ||
      !window.history ||
      !window.history.replaceState
    )
      return;
    var query = window.RelayGalleryFilter.writeSearchParams({
      q: currentQuery,
      genre: currentGenre,
      gen: currentGen,
      sort: currentSort,
      fav: favOnly,
      event: eventOnly && activeEventStageIds ? true : false,
    });
    window.history.replaceState(null, "", window.location.pathname + query);
  }

  function getSortedEntries() {
    var scores = {};
    voteScores.forEach((value, key) => {
      scores[key] = value.score;
    });
    var favorites = window.RelayLocalStore
      ? window.RelayLocalStore.readFavorites()
      : [];
    if (window.RelayGalleryFilter) {
      return window.RelayGalleryFilter.applyFilters(entries, {
        q: currentQuery,
        genre: currentGenre,
        gen: currentGen,
        sort: currentSort,
        fav: favOnly,
        event: eventOnly,
        eventIds: activeEventStageIds || [],
        favorites: favorites,
        scores: scores,
      });
    }
    var sorted = entries.slice();
    if (currentSort === "popular") {
      sorted.sort((a, b) => getScore(b.id) - getScore(a.id));
    } else if (currentSort === "name") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    if (currentSort === "newest") sorted.reverse();
    return sorted;
  }

  function renderGrid() {
    if (!gridEl) return;
    if (currentSort === "popular" && !hasLoadedVoteScores) {
      // pi-lens-ignore: no-inner-html-js, no-inner-html
      gridEl.innerHTML =
        '<p class="gallery-status" role="status">인기순을 불러오는 중…</p>';
      return;
    }
    var sorted = getSortedEntries();
    if (!sorted.length) {
      // pi-lens-ignore: no-inner-html-js, no-inner-html
      gridEl.innerHTML =
        '<p class="gallery-empty">조건에 맞는 스테이지가 없습니다. 검색어나 필터를 바꿔 보세요.</p>';
      return;
    }
    // pi-lens-ignore: no-inner-html-js, no-inner-html, ts-xss-dom-sink
    gridEl.innerHTML = sorted.map(renderCard).join("");
  }

  function handleVoteClick(event) {
    var favBtn = event.target.closest(".fav-btn");
    if (favBtn && window.RelayLocalStore) {
      event.preventDefault();
      var favId = favBtn.dataset.stageId;
      var result = window.RelayLocalStore.toggleFavorite(favId);
      favBtn.setAttribute("aria-pressed", result.active ? "true" : "false");
      favBtn.textContent = result.active ? "저장됨" : "저장";
      if (favOnly) renderGrid();
      return;
    }
    var btn = event.target.closest(".vote-btn");
    if (!btn || btn.disabled) return;

    event.preventDefault();
    event.stopPropagation();

    var stageId = btn.dataset.stageId;
    var voteValue = parseInt(btn.dataset.vote, 10);
    if (!stageId) return;

    // Find sibling buttons and score (score is in card thumb area)
    var card = btn.closest(".stage-card");
    var group = btn.closest(".vote-group");
    var upBtn = group.querySelector(".vote-up");
    var downBtn = group.querySelector(".vote-down");
    var scoreEl = card.querySelector(".vote-score");
    var heartEl = card.querySelector(".stage-card-heart");
    var oldScore = parseInt(scoreEl.textContent, 10) || 0;
    var oldVote = myVotes[stageId] || 0;

    // Disable during request
    upBtn.disabled = true;
    downBtn.disabled = true;

    // Optimistic UI
    var newVote;
    var newScore;
    if (oldVote === voteValue) {
      // Toggle off
      newVote = 0;
      newScore = oldScore - voteValue;
    } else {
      // New or switch
      newVote = voteValue;
      newScore = oldScore - oldVote + voteValue;
    }

    myVotes[stageId] = newVote;
    scoreEl.textContent = newScore;
    setScoreVisual(heartEl, newScore);
    upBtn.dataset.active = (newVote === 1).toString();
    downBtn.dataset.active = (newVote === -1).toString();

    // Update scores map
    var s = voteScores.get(stageId) || { score: 0, upvotes: 0, downvotes: 0 };
    s.score = newScore;
    voteScores.set(stageId, s);

    window.LikesClient.castVote(stageId, voteValue)
      .then(() => {
        announceFeedback("");
        upBtn.disabled = false;
        downBtn.disabled = false;
      })
      .catch(() => {
        // Rollback
        myVotes[stageId] = oldVote;
        scoreEl.textContent = oldScore;
        setScoreVisual(heartEl, oldScore);
        upBtn.dataset.active = (oldVote === 1).toString();
        downBtn.dataset.active = (oldVote === -1).toString();
        s.score = oldScore;
        voteScores.set(stageId, s);
        announceFeedback(
          "투표를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
        upBtn.disabled = false;
        downBtn.disabled = false;
      });
  }

  function handleSortClick(event) {
    var btn = event.target.closest(".sort-btn");
    if (!btn) return;
    var sort = btn.dataset.sort;
    if (sort === currentSort) return;
    currentSort = sort;
    localStorage.setItem(SORT_STORAGE_KEY, sort);
    syncUrl();
    sortButtons.forEach((b) => {
      var isActive = b.dataset.sort === sort;
      b.dataset.active = isActive ? "true" : "false";
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    renderGrid();
  }

  if (gridEl) {
    gridEl.addEventListener("click", handleVoteClick);
  }
  sortButtons.forEach((btn) => {
    btn.addEventListener("click", handleSortClick);
  });

  if (searchEl) {
    searchEl.value = currentQuery;
    searchEl.addEventListener("input", () => {
      currentQuery = searchEl.value;
      syncUrl();
      renderGrid();
    });
  }
  if (genreEl) {
    var genres = window.RelayGalleryFilter
      ? window.RelayGalleryFilter.uniqueValues(entries, (entry) => entry.genre)
      : [];
    genres.forEach((genre) => {
      var option = document.createElement("option");
      option.value = genre;
      option.textContent = genre;
      genreEl.appendChild(option);
    });
    genreEl.value = currentGenre;
    genreEl.addEventListener("change", () => {
      currentGenre = genreEl.value;
      syncUrl();
      renderGrid();
    });
  }
  if (genEl) {
    genEl.value = currentGen;
    genEl.addEventListener("change", () => {
      currentGen = genEl.value;
      syncUrl();
      renderGrid();
    });
  }
  if (favOnlyBtn) {
    favOnlyBtn.setAttribute("aria-pressed", favOnly ? "true" : "false");
    favOnlyBtn.dataset.active = favOnly ? "true" : "false";
    favOnlyBtn.addEventListener("click", () => {
      favOnly = !favOnly;
      favOnlyBtn.setAttribute("aria-pressed", favOnly ? "true" : "false");
      favOnlyBtn.dataset.active = favOnly ? "true" : "false";
      syncUrl();
      renderGrid();
    });
  }

  if (eventOnlyBtn) {
    eventOnlyBtn.addEventListener("click", () => {
      if (!activeEventStageIds) return;
      eventOnly = !eventOnly;
      eventOnlyBtn.setAttribute("aria-pressed", eventOnly ? "true" : "false");
      eventOnlyBtn.dataset.active = eventOnly ? "true" : "false";
      syncUrl();
      renderGrid();
    });
  }

  fetch("../content/events.json")
    .then((response) => response.ok ? response.json() : null)
    .then((eventsData) => {
      if (!window.RelayEvents) return;
      var activeEvent = window.RelayEvents.selectActiveEvent(eventsData);
      if (!activeEvent) return;
      activeEventStageIds = Array.from(window.RelayEvents.stageIdSet(activeEvent));
      if (eventOnlyBtn) {
        eventOnlyBtn.hidden = false;
        eventOnlyBtn.setAttribute("aria-pressed", eventOnly ? "true" : "false");
        eventOnlyBtn.dataset.active = eventOnly ? "true" : "false";
        if (activeEvent.title) {
          eventOnlyBtn.title = activeEvent.title;
        }
      }
      if (eventOnly) renderGrid();
    })
    .catch(() => {});

  fetch("../content/catalog.json")
    .then((response) => response.ok ? response.json() : null)
    .then((catalog) => {
      if (!catalog || !catalog.entries) return;
      var byId = new Map(
        catalog.entries.map((entry) => [entry.id, entry]),
      );
      entries = entries.map((entry) => {
        var extra = byId.get(entry.id);
        if (!extra) return entry;
        return Object.assign({}, entry, {
          publishedAt: extra.publishedAt,
          generation: extra.generation,
          review: extra.review,
          description: extra.description,
        });
      });
      renderGrid();
    })
    .catch(() => {});

  // Apply saved sort to button states
  sortButtons.forEach((b) => {
    var isActive = b.dataset.sort === currentSort;
    b.dataset.active = isActive ? "true" : "false";
    b.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  // Save scroll position before navigating away
  window.addEventListener("beforeunload", () => {
    sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
  });
  // Also save when clicking play links (same-origin navigation)
  document.addEventListener("click", (e) => {
    var link = e.target.closest("a[href]");
    if (link && link.href && link.href.indexOf("play.html") !== -1) {
      sessionStorage.setItem(SCROLL_STORAGE_KEY, String(window.scrollY));
    }
  });

  // Load cached votes for immediate render
  myVotes = window.LikesClient.getCachedVotes();
  renderGrid();

  // Fetch fresh data
  Promise.all([
    window.LikesClient.fetchVoteScores().catch(() => new Map()),
    window.LikesClient.fetchMyVotes().catch(() => ({})),
  ]).then((results) => {
    hasLoadedVoteScores = true;
    voteScores = results[0];
    myVotes = results[1];
    renderGrid();
    // Restore scroll position after grid is rendered
    var savedScroll = sessionStorage.getItem(SCROLL_STORAGE_KEY);
    if (savedScroll) {
      requestAnimationFrame(() => {
        window.scrollTo(0, parseInt(savedScroll, 10) || 0);
      });
      sessionStorage.removeItem(SCROLL_STORAGE_KEY);
    }
  });
})();
