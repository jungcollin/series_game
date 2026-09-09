(function relaySdkLegacyAdapterFactory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelaySdkLegacyAdapter = api;
})(typeof window !== "undefined" ? window : null, function createRelaySdkLegacyAdapter() {
  "use strict";

  function install(options) {
    options = options || {};
    var sdk = options.sdk || (typeof window !== "undefined" ? window.RelaySdkV2 : null);
    var legacy = options.legacy || (typeof window !== "undefined" ? window.RelayStageHost : null);
    if (!sdk || !legacy) return null;
    var host = sdk.createHost({
      stageId: options.stageId,
      token: options.token,
      instanceId: options.instanceId,
      target: options.target,
    });
    var started = false;
    var original = {
      onStageReady: legacy.onStageReady,
      onStageCleared: legacy.onStageCleared,
      onStageFailed: legacy.onStageFailed,
    };

    legacy.onStageReady = function (meta) {
      if (!started) {
        host.ready(meta || {});
        host.start((meta && meta.seed) || null);
        started = true;
      }
      if (typeof original.onStageReady === "function") original.onStageReady(meta);
    };
    legacy.onStageCleared = function (payload) {
      host.result("clear", payload || {});
      if (typeof original.onStageCleared === "function") original.onStageCleared(payload);
    };
    legacy.onStageFailed = function (payload) {
      host.result("fail", payload || {});
      if (typeof original.onStageFailed === "function") original.onStageFailed(payload);
    };

    return {
      host: host,
      restore: function () {
        legacy.onStageReady = original.onStageReady;
        legacy.onStageCleared = original.onStageCleared;
        legacy.onStageFailed = original.onStageFailed;
        host.dispose();
      },
    };
  }

  return { install: install };
});
