(function relayApiClientFactory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelayApiClient = api;
})(typeof window !== "undefined" ? window : null, function createRelayApiClient() {
  "use strict";

  var DEFAULT_TIMEOUT_MS = 8000;
  var IDEMPOTENT = { GET: true, HEAD: true, OPTIONS: true };

  function isIdempotent(method) {
    return Boolean(IDEMPOTENT[String(method || "GET").toUpperCase()]);
  }

  function normalizeHeaders(headers) {
    if (!headers) return {};
    if (typeof Headers !== "undefined" && headers instanceof Headers) {
      var out = {};
      headers.forEach(function (value, key) {
        out[key] = value;
      });
      return out;
    }
    return Object.assign({}, headers);
  }

  function createTimeoutError() {
    var error = new Error("요청 시간이 초과되었습니다.");
    error.code = "timeout";
    error.status = 0;
    return error;
  }

  function createHttpError(status, payload, fallback) {
    var message =
      (payload && (payload.message || payload.error)) ||
      fallback ||
      ("API " + status);
    var error = new Error(typeof message === "string" ? message : "요청에 실패했습니다.");
    error.status = status;
    error.payload = payload;
    error.code = (payload && payload.error) || "http_error";
    return error;
  }

  function parseBody(text) {
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch (error) {
      return { message: text };
    }
  }

  function requestWithTimeout(fetchImpl, url, init, timeoutMs, abortSignal) {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = 0;
    var settled = false;

    function abort() {
      if (controller && !settled) controller.abort();
    }

    if (abortSignal) {
      if (abortSignal.aborted) abort();
      else abortSignal.addEventListener("abort", abort);
    }

    var fetchPromise = fetchImpl(url, Object.assign({}, init, {
      signal: controller ? controller.signal : init.signal,
    }));

    var timeoutPromise = new Promise(function (_, reject) {
      if (!timeoutMs || timeoutMs <= 0) return;
      timer = setTimeout(function () {
        abort();
        reject(createTimeoutError());
      }, timeoutMs);
    });

    return Promise.race([fetchPromise, timeoutPromise]).then(function (response) {
      settled = true;
      if (timer) clearTimeout(timer);
      return response;
    }, function (error) {
      settled = true;
      if (timer) clearTimeout(timer);
      if (error && error.code === "timeout") throw error;
      if (error && (error.name === "AbortError" || error.code === "ABORT_ERR")) {
        throw createTimeoutError();
      }
      throw error;
    });
  }

  function request(url, options) {
    options = options || {};
    var fetchImpl = options.fetch || (typeof fetch === "function" ? fetch : null);
    if (!fetchImpl) {
      return Promise.reject(new Error("fetch를 사용할 수 없습니다."));
    }
    var method = String(options.method || "GET").toUpperCase();
    var timeoutMs = options.timeoutMs == null ? DEFAULT_TIMEOUT_MS : Number(options.timeoutMs);
    var retryOnIdempotent = options.retry === true && isIdempotent(method);
    var headers = normalizeHeaders(options.headers);
    var init = {
      method: method,
      headers: headers,
      body: options.body,
      credentials: options.credentials || "omit",
    };

    function once() {
      return requestWithTimeout(fetchImpl, url, init, timeoutMs, options.signal).then(function (response) {
        return response.text().then(function (text) {
          var payload = parseBody(text);
          if (!response.ok) {
            throw createHttpError(response.status, payload, "API " + response.status);
          }
          return {
            ok: true,
            status: response.status,
            headers: response.headers,
            body: payload,
          };
        });
      });
    }

    return once().catch(function (error) {
      if (!retryOnIdempotent) throw error;
      if (error && error.status && error.status >= 400 && error.status < 500) throw error;
      return once();
    });
  }

  return {
    DEFAULT_TIMEOUT_MS: DEFAULT_TIMEOUT_MS,
    isIdempotent: isIdempotent,
    request: request,
  };
});
