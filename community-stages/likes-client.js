(function votesClientBootstrap() {
  var SUPABASE_URL = "https://ikrhlbwsrahnswuhuyka.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrcmhsYndzcmFobnN3dWh1eWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MDA3OTgsImV4cCI6MjA4OTQ3Njc5OH0.Gg9sjaq-Mwv0sqOm1G4u0sIyMmkUtTccW5nL-TuMDnk";
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

  // Cache stores { stageId: 1 | -1 }
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

  function supabaseRequest(path, options) {
    options = options || {};
    return window
      .fetch(SUPABASE_URL + "/rest/v1/" + path, {
        method: options.method || "GET",
        headers: Object.assign(
          {
            apikey: SUPABASE_ANON_KEY,
            Authorization: "Bearer " + SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          options.headers || {}
        ),
        body: options.body ? JSON.stringify(options.body) : undefined,
      })
      .then(function (response) {
        return response.text().then(function (text) {
          var payload = text ? JSON.parse(text) : null;
          if (!response.ok) {
            var err = new Error(
              (payload && (payload.message || payload.error_description)) ||
                "Supabase " + response.status
            );
            err.status = response.status;
            throw err;
          }
          return payload;
        });
      });
  }

  // Returns Map<stageId, { score, upvotes, downvotes }>
  function fetchVoteScores() {
    return supabaseRequest(
      "stage_vote_scores?select=stage_id,score,upvotes,downvotes"
    ).then(function (rows) {
      var scores = new Map();
      if (rows) {
        rows.forEach(function (row) {
          scores.set(row.stage_id, {
            score: row.score,
            upvotes: row.upvotes,
            downvotes: row.downvotes,
          });
        });
      }
      return scores;
    });
  }

  // Returns { stageId: 1 | -1 }
  function fetchMyVotes(visitorId) {
    return supabaseRequest(
      "stage_votes?visitor_id=eq." +
        encodeURIComponent(visitorId) +
        "&select=stage_id,vote"
    ).then(function (rows) {
      var votes = {};
      if (rows) {
        rows.forEach(function (row) {
          votes[row.stage_id] = row.vote;
        });
      }
      saveCachedVotes(votes);
      return votes;
    });
  }

  function submitVote(stageId, vote) {
    var visitorId = getVisitorId();
    return supabaseRequest("stage_votes?on_conflict=stage_id,visitor_id", {
      method: "POST",
      headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      body: { stage_id: stageId, visitor_id: visitorId, vote: vote },
    }).then(function () {
      setCachedVote(stageId, vote);
    });
  }

  function removeVote(stageId) {
    var visitorId = getVisitorId();
    return supabaseRequest(
      "stage_votes?stage_id=eq." +
        encodeURIComponent(stageId) +
        "&visitor_id=eq." +
        encodeURIComponent(visitorId),
      { method: "DELETE" }
    ).then(function () {
      removeCachedVote(stageId);
    });
  }

  var pending = {};

  // vote: 1 (upvote) or -1 (downvote)
  // If same vote already cast, removes it (toggle off)
  // If different vote, switches it
  function castVote(stageId, vote) {
    if (pending[stageId]) return Promise.resolve(null);
    pending[stageId] = true;

    var currentVote = getCachedVotes()[stageId] || 0;
    var action;

    if (currentVote === vote) {
      // Toggle off: remove vote
      action = removeVote(stageId);
    } else {
      // New vote or switch
      action = submitVote(stageId, vote);
    }

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

  // Backward compat alias
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
