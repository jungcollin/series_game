(function rankingClientBootstrap() {
  var SUPABASE_URL = "https://ikrhlbwsrahnswuhuyka.supabase.co";
  var SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlrcmhsYndzcmFobnN3dWh1eWthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MDA3OTgsImV4cCI6MjA4OTQ3Njc5OH0.Gg9sjaq-Mwv0sqOm1G4u0sIyMmkUtTccW5nL-TuMDnk";

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

  function fetchRankings(stageId) {
    return supabaseRequest(
      "stage_rankings?stage_id=eq." +
        encodeURIComponent(stageId) +
        "&select=player_name,duration_sec,visitor_id,updated_at" +
        "&order=duration_sec.asc&limit=10"
    ).then(function (rows) {
      return rows || [];
    });
  }

  function saveRanking(stageId, playerName, durationSec) {
    var visitorId = window.LikesClient.getVisitorId();
    return supabaseRequest("stage_rankings?on_conflict=stage_id,visitor_id", {
      method: "POST",
      headers: { Prefer: "return=representation,resolution=merge-duplicates" },
      body: {
        stage_id: stageId,
        visitor_id: visitorId,
        player_name: playerName,
        duration_sec: durationSec,
        updated_at: "now()",
      },
    });
  }

  window.RankingClient = {
    fetchRankings: fetchRankings,
    saveRanking: saveRanking,
  };
})();
