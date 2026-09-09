(function relaySdkV2Factory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelaySdkV2 = api;
})(typeof window !== "undefined" ? window : null, function createRelaySdkV2() {
  "use strict";

  var CHANNEL = "one-life-relay-stage-v2";

  function randomId() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return "inst-" + Date.now() + "-" + Math.floor(Math.random() * 1e6);
  }

  function createHost(options) {
    options = options || {};
    var stageId = options.stageId || "";
    var token = options.token || "";
    var instanceId = options.instanceId || randomId();
    var disposed = false;
    var started = false;
    var target = options.target || (typeof window !== "undefined" ? window.parent : null);

    function post(type, payload) {
      if (disposed || !target || typeof target.postMessage !== "function") return;
      target.postMessage({
        channel: CHANNEL,
        type: type,
        token: token,
        instanceId: instanceId,
        payload: payload || {},
      }, "*");
    }

    return {
      instanceId: instanceId,
      ready: function (meta) {
        if (disposed) return;
        post("ready", Object.assign({ id: stageId }, meta || {}));
      },
      start: function (seed) {
        if (disposed) return;
        started = true;
        post("start", { id: stageId, seed: seed || null });
      },
      result: function (outcome, extra) {
        if (disposed || !started) return;
        extra = extra || {};
        var type = outcome === "clear" ? "cleared" : outcome === "fail" ? "failed" : "invalid";
        post(type, Object.assign({
          stageId: stageId,
          outcome: outcome,
        }, extra));
      },
      dispose: function () {
        if (disposed) return;
        post("dispose", { id: stageId, instanceId: instanceId });
        disposed = true;
      },
      get disposed() {
        return disposed;
      },
    };
  }

  function acceptHostMessage(message, expected) {
    expected = expected || {};
    if (!message || message.channel !== CHANNEL) return false;
    if (expected.token && message.token !== expected.token) return false;
    if (expected.instanceId && message.instanceId !== expected.instanceId) return false;
    return true;
  }

  return {
    CHANNEL: CHANNEL,
    createHost: createHost,
    acceptHostMessage: acceptHostMessage,
  };
});
