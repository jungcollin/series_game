(function relayApiBootstrap() {
  var BASE_URL = "https://relay-api.collinworks.dev";

  function request(path, options) {
    options = options || {};
    var headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    if (options.body !== undefined && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return window.fetch(BASE_URL + path, {
      method: options.method || "GET",
      headers: headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    }).then(function (response) {
      return response.text().then(function (text) {
        var payload = text ? JSON.parse(text) : null;
        if (!response.ok) {
          var message =
            (payload && (payload.message || payload.error)) ||
            "API " + response.status;
          var err = new Error(typeof message === "string" ? message : "요청에 실패했습니다.");
          err.status = response.status;
          throw err;
        }
        return payload;
      });
    });
  }

  window.RelayApi = {
    baseUrl: BASE_URL,
    request: request,
  };
})();
