(function votesClientBootstrap() {
  var VOTES_CACHE_KEY = "one-life-relay-votes";

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

  function fetchMyVotes() {
    return api()
      .request("/v1/votes/me", { auth: true })
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
    return api()
      .request("/v1/votes", {
        method: "PUT",
        auth: true,
        body: { stage_id: stageId, vote: vote },
      })
      .then(function () {
        setCachedVote(stageId, vote);
      });
  }

  function removeVote(stageId) {
    return api()
      .request("/v1/votes?stage_id=" + encodeURIComponent(stageId), { method: "DELETE", auth: true })
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
    getCachedVotes: getCachedVotes,
    fetchVoteScores: fetchVoteScores,
    fetchMyVotes: fetchMyVotes,
    submitVote: submitVote,
    removeVote: removeVote,
    castVote: castVote,
    fetchLikeCounts: fetchLikeCounts,
  };
})();
