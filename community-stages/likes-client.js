(function votesClientBootstrap() {
  var VISITOR_ID_KEY = "one-life-relay-visitor-id";
  var VOTES_CACHE_KEY = "one-life-relay-votes";

  function getVisitorId() {
    try {
      var existing = window.localStorage.getItem(VISITOR_ID_KEY);
      if (existing) return existing;
      var id = window.crypto.randomUUID();
      window.localStorage.setItem(VISITOR_ID_KEY, id);
      return id;
    } catch (error) {
      return "anon-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
    }
  }

  function getCachedVotes() {
    try {
      var raw = window.localStorage.getItem(VOTES_CACHE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (error) {
      return {};
    }
  }

  function saveCachedVotes(votes) {
    try {
      window.localStorage.setItem(VOTES_CACHE_KEY, JSON.stringify(votes));
    } catch (error) {}
  }

  function setCachedVote(stageId, vote) {
    var votes = getCachedVotes();
    votes[stageId] = vote;
    saveCachedVotes(votes);
  }

  function removeCachedVote(stageId) {
    var votes = getCachedVotes();
    delete votes[stageId];
    saveCachedVotes(votes);
  }

  function api() {
    if (!window.RelayApi) {
      return Promise.reject(new Error("Relay API is not loaded"));
    }
    return window.RelayApi;
  }

  function fetchVoteScores() {
    return api().request("/v1/votes").then(function (payload) {
      var scores = new Map();
      var rows = (payload && payload.scores) || [];
      rows.forEach(function (row) {
        scores.set(row.stage_id, {
          score: row.score,
          upvotes: row.upvotes,
          downvotes: row.downvotes,
        });
      });
      return scores;
    });
  }

  function fetchMyVotes(visitorId) {
    return api()
      .request("/v1/votes/me?visitor_id=" + encodeURIComponent(visitorId))
      .then(function (payload) {
        var votes = {};
        var rows = (payload && payload.votes) || [];
        rows.forEach(function (row) {
          votes[row.stage_id] = row.vote;
        });
        saveCachedVotes(votes);
        return votes;
      });
  }

  function submitVote(stageId, vote) {
    var visitorId = getVisitorId();
    return api()
      .request("/v1/votes", {
        method: "PUT",
        body: { stage_id: stageId, visitor_id: visitorId, vote: vote },
      })
      .then(function () {
        setCachedVote(stageId, vote);
      });
  }

  function removeVote(stageId) {
    var visitorId = getVisitorId();
    return api()
      .request(
        "/v1/votes?stage_id=" +
          encodeURIComponent(stageId) +
          "&visitor_id=" +
          encodeURIComponent(visitorId),
        { method: "DELETE" }
      )
      .then(function () {
        removeCachedVote(stageId);
      });
  }

  var pending = {};

  function castVote(stageId, vote) {
    if (pending[stageId]) return Promise.resolve(null);
    pending[stageId] = true;

    var currentVote = getCachedVotes()[stageId] || 0;
    var action = currentVote === vote ? removeVote(stageId) : submitVote(stageId, vote);

    return action
      .then(function () {
        pending[stageId] = false;
        return { vote: currentVote === vote ? 0 : vote };
      })
      .catch(function (err) {
        pending[stageId] = false;
        throw err;
      });
  }

  function fetchLikeCounts() {
    return fetchVoteScores().then(function (scores) {
      var counts = new Map();
      scores.forEach(function (val, key) {
        counts.set(key, val.score);
      });
      return counts;
    });
  }

  window.LikesClient = {
    getVisitorId: getVisitorId,
    getCachedVotes: getCachedVotes,
    fetchVoteScores: fetchVoteScores,
    fetchMyVotes: fetchMyVotes,
    submitVote: submitVote,
    removeVote: removeVote,
    castVote: castVote,
    fetchLikeCounts: fetchLikeCounts,
  };
})();
