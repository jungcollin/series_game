(function relayLocalStoreFactory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelayLocalStore = api;
})(typeof window !== "undefined" ? window : null, function createRelayLocalStore() {
  "use strict";

  var FAVORITES_KEY = "olr-favorites-v1";
  var RECENT_KEY = "olr-recent-plays-v1";
  var ANALYTICS_OPT_OUT_KEY = "olr-analytics-opt-out";
  var MAX_RECENT = 24;

  function memoryFallback() {
    var data = {};
    return {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
      setItem: function (key, value) { data[key] = String(value); },
      removeItem: function (key) { delete data[key]; },
    };
  }

  function getStorage(storage) {
    if (storage) return storage;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.getItem("olr-storage-probe");
        return window.localStorage;
      }
    } catch (error) {
      return memoryFallback();
    }
    return memoryFallback();
  }

  function readJson(storage, key, fallback) {
    try {
      var raw = storage.getItem(key);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(storage, key, value) {
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function normalizeId(value) {
    if (typeof value !== "string") return "";
    return value.trim();
  }

  function readFavorites(storage) {
    var parsed = readJson(getStorage(storage), FAVORITES_KEY, []);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeId).filter(Boolean);
  }

  function toggleFavorite(stageId, storage) {
    var id = normalizeId(stageId);
    if (!id) return { ids: readFavorites(storage), saved: false };
    var store = getStorage(storage);
    var ids = readFavorites(store);
    var next = ids.indexOf(id) === -1
      ? ids.concat([id])
      : ids.filter(function (entry) { return entry !== id; });
    return { ids: next, saved: writeJson(store, FAVORITES_KEY, next), active: next.indexOf(id) !== -1 };
  }

  function isFavorite(stageId, storage) {
    return readFavorites(storage).indexOf(normalizeId(stageId)) !== -1;
  }

  function readRecent(storage) {
    var parsed = readJson(getStorage(storage), RECENT_KEY, []);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(function (entry) {
        if (!entry || typeof entry !== "object") return null;
        var id = normalizeId(entry.id);
        if (!id) return null;
        return { id: id, at: Number(entry.at) || 0 };
      })
      .filter(Boolean);
  }

  function recordRecent(stageId, at, storage) {
    var id = normalizeId(stageId);
    if (!id) return { items: readRecent(storage), saved: false };
    var store = getStorage(storage);
    var next = [{ id: id, at: Number(at) || Date.now() }]
      .concat(readRecent(store).filter(function (entry) { return entry.id !== id; }))
      .slice(0, MAX_RECENT);
    return { items: next, saved: writeJson(store, RECENT_KEY, next) };
  }

  function dropMissing(items, knownIds) {
    var known = new Set(knownIds || []);
    return (items || []).filter(function (item) {
      var id = typeof item === "string" ? item : item && item.id;
      return known.has(id);
    });
  }

  function isAnalyticsOptedOut(storage) {
    var store = getStorage(storage);
    try {
      return store.getItem(ANALYTICS_OPT_OUT_KEY) === "1";
    } catch (error) {
      return false;
    }
  }

  function setAnalyticsOptOut(optOut, storage) {
    var store = getStorage(storage);
    try {
      if (optOut) store.setItem(ANALYTICS_OPT_OUT_KEY, "1");
      else store.removeItem(ANALYTICS_OPT_OUT_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  return {
    FAVORITES_KEY: FAVORITES_KEY,
    RECENT_KEY: RECENT_KEY,
    ANALYTICS_OPT_OUT_KEY: ANALYTICS_OPT_OUT_KEY,
    readFavorites: readFavorites,
    toggleFavorite: toggleFavorite,
    isFavorite: isFavorite,
    readRecent: readRecent,
    recordRecent: recordRecent,
    dropMissing: dropMissing,
    isAnalyticsOptedOut: isAnalyticsOptedOut,
    setAnalyticsOptOut: setAnalyticsOptOut,
  };
});
