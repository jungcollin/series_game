(function galleryBootstrap() {
  var entries = window.COMMUNITY_STAGE_REGISTRY || [];
  var gridEl = document.querySelector("#gallery-grid");
  var feedbackEl = document.querySelector("#gallery-feedback");
  var sortButtons = document.querySelectorAll(".sort-btn");
  var voteScores = new Map(); // stageId -> { score, upvotes, downvotes }
  var myVotes = {}; // stageId -> 1 | -1
  var currentSort = "popular";
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
    if (typeof creator === "string") return { name: creator, avatar: null, github: null };
    if (!creator) return { name: "Unknown", avatar: null, github: null };
    return { name: creator.name || "Unknown", avatar: creator.avatar || null, github: creator.github || null };
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
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function getGenreStyle(genre) {
    return GENRE_STYLES[genre] || DEFAULT_GENRE;
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
      return '<img class="creator-avatar" src="' + escapeHtml(url) + '" alt="" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'grid\'" />' +
        '<span class="creator-avatar-placeholder" style="display:none">' + escapeHtml(c.name.charAt(0).toUpperCase()) + "</span>";
    }
    return '<span class="creator-avatar-placeholder">' + escapeHtml(c.name.charAt(0).toUpperCase()) + "</span>";
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
    if (state === "negative" || state === "negative-strong") return "\uD83D\uDDA4";
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
      ? '<img class="stage-card-thumb-image" src="' + escapeHtml(thumbnailUrl) + '" alt="" loading="lazy" decoding="async" onerror="this.remove()" />'
      : "";
    var genreIconMarkup = thumbnailUrl
      ? ""
      : '<span class="stage-card-thumb-icon">' + genre.icon + "</span>";

    return (
      '<article class="stage-card" data-stage-id="' + escapeHtml(entry.id) + '">' +
      '<a class="stage-card-media-link" href="' + playHref + '" aria-label="' + escapeHtml(entry.title) + ' 플레이 페이지로 이동">' +
      '<div class="stage-card-thumb" data-has-image="' + (thumbnailUrl ? "true" : "false") + '" style="background:' + genre.bg + '">' +
      thumbnailMarkup +
      genreIconMarkup +
      '<span class="stage-card-genre">' + escapeHtml(entry.genre) + "</span>" +
      '<span class="stage-card-heart" data-stage-id="' + escapeHtml(entry.id) + '" data-score-state="' + scoreState + '" aria-label="좋아요 점수 ' + score + '"><span class="heart-icon" aria-hidden="true">' + heartIcon + '</span> <span class="vote-score">' + score + "</span></span>" +
      "</div>" +
      "</a>" +
      '<div class="stage-card-body">' +
      '<h3 class="stage-card-title"><a class="stage-card-title-link" href="' + playHref + '">' + escapeHtml(entry.title) + "</a></h3>" +
      '<p class="stage-card-condition">' + escapeHtml(entry.clearCondition) + "</p>" +
      '<div class="stage-card-creator">' +
      renderCreatorAvatar(entry.creator) +
      '<span class="creator-name">' + escapeHtml(creator.name) + "</span>" +
      "</div>" +
      '<div class="stage-card-actions">' +
      '<div class="vote-group">' +
      '<button class="vote-btn vote-up" data-stage-id="' + escapeHtml(entry.id) + '" data-vote="1" data-active="' + (myVote === 1) + '" type="button" aria-label="좋아요">\uD83D\uDC4D</button>' +
      '<button class="vote-btn vote-down" data-stage-id="' + escapeHtml(entry.id) + '" data-vote="-1" data-active="' + (myVote === -1) + '" type="button" aria-label="싫어요">\uD83D\uDC4E</button>' +
      "</div>" +
      '<a class="play-link" href="./play.html?stage=' + encodeURIComponent(entry.id) + '">플레이</a>' +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function getSortedEntries() {
    var sorted = entries.slice();
    if (currentSort === "popular") {
      sorted.sort(function (a, b) { return getScore(b.id) - getScore(a.id); });
    } else if (currentSort === "name") {
      sorted.sort(function (a, b) { return a.title.localeCompare(b.title); });
    }
    if (currentSort === "newest") sorted.reverse();
    return sorted;
  }

  function renderGrid() {
    if (!gridEl) return;
    if (currentSort === "popular" && !hasLoadedVoteScores) {
      gridEl.innerHTML = '<p class="gallery-status" role="status">인기순을 불러오는 중…</p>';
      return;
    }
    var sorted = getSortedEntries();
    if (!sorted.length) {
      gridEl.innerHTML = '<p class="gallery-empty">등록된 스테이지가 없습니다.</p>';
      return;
    }
    gridEl.innerHTML = sorted.map(renderCard).join("");
  }

  function handleVoteClick(event) {
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
      .then(function () {
        announceFeedback("");
        upBtn.disabled = false;
        downBtn.disabled = false;
      })
      .catch(function () {
        // Rollback
        myVotes[stageId] = oldVote;
        scoreEl.textContent = oldScore;
        setScoreVisual(heartEl, oldScore);
        upBtn.dataset.active = (oldVote === 1).toString();
        downBtn.dataset.active = (oldVote === -1).toString();
        s.score = oldScore;
        voteScores.set(stageId, s);
        announceFeedback("투표를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
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
    sortButtons.forEach(function (b) {
      var isActive = b.dataset.sort === sort;
      b.dataset.active = isActive ? "true" : "false";
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
    renderGrid();
  }

  if (gridEl) {
    gridEl.addEventListener("click", handleVoteClick);
  }
  sortButtons.forEach(function (btn) { btn.addEventListener("click", handleSortClick); });

  // Load cached votes for immediate render
  myVotes = window.LikesClient.getCachedVotes();
  renderGrid();

  // Fetch fresh data
  var visitorId = window.LikesClient.getVisitorId();
  Promise.all([
    window.LikesClient.fetchVoteScores().catch(function () { return new Map(); }),
    window.LikesClient.fetchMyVotes(visitorId).catch(function () { return {}; }),
  ]).then(function (results) {
    hasLoadedVoteScores = true;
    voteScores = results[0];
    myVotes = results[1];
    renderGrid();
  });
})();
