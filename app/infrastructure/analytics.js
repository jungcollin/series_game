(function relayAnalyticsFactory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelayAnalytics = api;
})(typeof window !== "undefined" ? window : null, function createRelayAnalytics() {
  "use strict";

  var NAMES = {
    run_start: true,
    stage_ready: true,
    stage_clear: true,
    stage_fail: true,
    stage_invalid: true,
    run_retry: true,
  };

  var METRICS = {
    start_rate: { numerator: ["run_start"], denominator: ["run_start"], notes: "분모는 노출이 아니라 실제 시작 수다." },
    clear_rate: { numerator: ["stage_clear"], denominator: ["stage_ready"], notes: "기술 오류는 분모에서 제외한다." },
    fail_rate: { numerator: ["stage_fail"], denominator: ["stage_ready"], notes: "난이도 실패만 포함한다." },
    invalid_rate: { numerator: ["stage_invalid"], denominator: ["run_start"], notes: "로드 실패·무효는 난이도 실패와 섞지 않는다." },
    retry_rate: { numerator: ["run_retry"], denominator: ["run_start"], notes: "같은 코스 재시작." },
  };

  function isAllowedName(name) {
    return Boolean(NAMES[name]);
  }

  function normalizeEvent(event) {
    event = event || {};
    if (!isAllowedName(event.name)) return null;
    return {
      name: event.name,
      stage_id: typeof event.stage_id === "string" ? event.stage_id : undefined,
      challenge_id: typeof event.challenge_id === "string" ? event.challenge_id : undefined,
      outcome: typeof event.outcome === "string" ? event.outcome : undefined,
      technical: event.technical === true,
    };
  }

  function shouldSend(event, options) {
    options = options || {};
    if (options.optOut) return false;
    if (options.internalTest) return false;
    return Boolean(normalizeEvent(event));
  }

  function compute(metricsName, events) {
    var spec = METRICS[metricsName];
    if (!spec) return { numerator: 0, denominator: 0, value: null };
    var rows = (events || []).filter(function (event) {
      return event && !event.internalTest;
    });
    var numerator = rows.filter(function (event) { return spec.numerator.indexOf(event.name) !== -1; }).length;
    var denominator;
    if (metricsName === "clear_rate" || metricsName === "fail_rate") {
      var ready = rows.filter(function (event) { return event.name === "stage_ready"; }).length;
      var invalid = rows.filter(function (event) { return event.name === "stage_invalid"; }).length;
      denominator = Math.max(0, ready - invalid);
    } else {
      denominator = rows.filter(function (event) { return spec.denominator.indexOf(event.name) !== -1; }).length;
    }
    return {
      numerator: numerator,
      denominator: denominator,
      value: denominator ? numerator / denominator : null,
    };
  }

  return {
    NAMES: Object.keys(NAMES),
    METRICS: METRICS,
    isAllowedName: isAllowedName,
    normalizeEvent: normalizeEvent,
    shouldSend: shouldSend,
    compute: compute,
  };
});
