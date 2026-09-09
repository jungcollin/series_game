(function relayApiBootstrap() {
  var BASE_URL = "https://relay-api.collinworks.dev";
  var SESSION_KEY = "one-life-relay-session-v1";
  var WRITE_METHODS = { POST: true, PUT: true, PATCH: true, DELETE: true };

  function loadSessionToken() {
    try { return window.localStorage.getItem(SESSION_KEY) || ""; } catch (error) { return ""; }
  }

  function saveSessionToken(token) {
    try { window.localStorage.setItem(SESSION_KEY, token); } catch (error) {}
  }

  function clearSessionToken() {
    try { window.localStorage.removeItem(SESSION_KEY); } catch (error) {}
  }

  function client() {
    return window.RelayApiClient;
  }

  function ensureSession() {
    var existing = loadSessionToken();
    if (existing) return Promise.resolve(existing);
    return request("/v1/session", { method: "POST" }).then(function (payload) {
      var token = payload && payload.token;
      if (!token) throw new Error("인증 세션을 만들지 못했습니다.");
      saveSessionToken(token);
      return token;
    });
  }

  function revokeSession() {
    return request("/v1/session/revoke", { method: "POST", auth: true }).then(function () {
      clearSessionToken();
    }).catch(function (error) {
      clearSessionToken();
      throw error;
    });
  }

  function request(path, options) {
    options = options || {};
    var method = String(options.method || "GET").toUpperCase();
    if (options.auth) {
      return ensureSession().then(function (token) {
        var authenticated = Object.assign({}, options, { auth: false });
        authenticated.headers = Object.assign({}, options.headers || {}, { Authorization: "Bearer " + token });
        return request(path, authenticated).catch(function (error) {
          if (error.status !== 401) throw error;
          clearSessionToken();
          return ensureSession().then(function (freshToken) {
            authenticated.headers.Authorization = "Bearer " + freshToken;
            return request(path, authenticated);
          });
        });
      });
    }
    var headers = Object.assign({ Accept: "application/json" }, options.headers || {});
    if (options.body !== undefined && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    var fetchImpl = client();
    var init = {
      method: method,
      headers: headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      timeoutMs: options.timeoutMs,
      retry: options.retry === true && !WRITE_METHODS[method],
      signal: options.signal,
    };
    var pending = fetchImpl && fetchImpl.request
      ? fetchImpl.request(BASE_URL + path, init).then(function (result) { return result.body; })
      : fallbackFetch(BASE_URL + path, init);
    return pending;
  }

  function fallbackFetch(url, options) {
    return window.fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
    }).then(function (response) {
      return response.text().then(function (text) {
        var payload = text ? JSON.parse(text) : null;
        if (!response.ok) {
          var message = (payload && (payload.message || payload.error)) || ("API " + response.status);
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
    features: { events: false },
    ensureSession: ensureSession,
    revokeSession: revokeSession,
    request: request,
  };
})();
