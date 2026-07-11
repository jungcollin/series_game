(function dailyRelayFactory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DailyRelay = api;
})(typeof window !== "undefined" ? window : null, function createDailyRelay() {
  "use strict";

  var CURATED_STAGE_IDS = [
    "galaxy-boss",
    "slither-worm",
    "lightning-dodge",
    "wrong-way-runner",
    "neon-shield",
  ];

  function getKstDateKey(now) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now || new Date());
  }

  function hashSeed(value) {
    var hash = 2166136261;
    for (var i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    var value = seed >>> 0;
    return function random() {
      value += 0x6D2B79F5;
      var result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildRoute(registry, dateKey, size) {
    var byId = new Map((registry || []).map(function mapEntry(entry) { return [entry.id, entry]; }));
    var pool = CURATED_STAGE_IDS.map(function getEntry(id) { return byId.get(id); }).filter(Boolean);
    var fallback = (registry || []).filter(function notCurated(entry) { return !CURATED_STAGE_IDS.includes(entry.id); });
    var candidates = pool.length >= (size || 5) ? pool : pool.concat(fallback);
    var random = seededRandom(hashSeed(dateKey || getKstDateKey()));
    for (var i = candidates.length - 1; i > 0; i -= 1) {
      var j = Math.floor(random() * (i + 1));
      var tmp = candidates[i];
      candidates[i] = candidates[j];
      candidates[j] = tmp;
    }
    return candidates.slice(0, Math.min(size || 5, candidates.length));
  }

  return { CURATED_STAGE_IDS: CURATED_STAGE_IDS, getKstDateKey: getKstDateKey, buildRoute: buildRoute };
});
