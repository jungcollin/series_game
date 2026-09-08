(function rankingClientBootstrap() {
  function api() {
    if (!window.RelayApi) {
      return Promise.reject(new Error("Relay API is not loaded"));
    }
    return window.RelayApi;
  }

  function fetchRankings(stageId) {
    return api()
      .request("/v1/stages/" + encodeURIComponent(stageId) + "/rankings?limit=10")
      .then(function (payload) {
        return (payload && payload.rankings) || [];
      });
  }

  window.RankingClient = {
    fetchRankings: fetchRankings,
  };
})();
