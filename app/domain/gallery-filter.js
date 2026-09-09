(function relayGalleryFilterFactory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelayGalleryFilter = api;
})(
  typeof window !== "undefined" ? window : null,
  function createRelayGalleryFilter() {
    "use strict";

    function normalize(value) {
      return String(value || "")
        .trim()
        .toLowerCase();
    }

    function readSearchParams(search) {
      var params = new URLSearchParams(
        typeof search === "string" ? search.replace(/^\?/, "") : "",
      );
      return {
        q: params.get("q") || "",
        genre: params.get("genre") || "",
        mechanic: params.get("mechanic") || "",
        gen: params.get("gen") || "",
        sort: params.get("sort") || "",
        fav: params.get("fav") === "1",
        event: params.get("event") === "1",
      };
    }

    function writeSearchParams(state) {
      var params = new URLSearchParams();
      if (state.q) params.set("q", state.q);
      if (state.genre) params.set("genre", state.genre);
      if (state.mechanic) params.set("mechanic", state.mechanic);
      if (state.gen) params.set("gen", state.gen);
      if (state.sort && state.sort !== "popular")
        params.set("sort", state.sort);
      if (state.fav) params.set("fav", "1");
      if (state.event) params.set("event", "1");
      var query = params.toString();
      return query ? "?" + query : "";
    }

    function matchesQuery(entry, query) {
      var q = normalize(query);
      if (!q) return true;
      var creator =
        entry.creator && entry.creator.name ? entry.creator.name : "";
      var haystack = [
        entry.id,
        entry.title,
        entry.genre,
        entry.clearCondition,
        creator,
        entry.review && entry.review.mechanic,
      ]
        .map(normalize)
        .join(" ");
      return haystack.indexOf(q) !== -1;
    }

    function publishedMs(entry) {
      if (!entry || !entry.publishedAt) return 0;
      var value = Date.parse(entry.publishedAt);
      return Number.isFinite(value) ? value : 0;
    }

    function applyFilters(entries, options) {
      options = options || {};
      var favorites = options.favorites || [];
      var favoriteSet = new Set(favorites);
      var eventIdSet =
        options.event && Array.isArray(options.eventIds)
          ? new Set(options.eventIds)
          : null;
      var filtered = (entries || []).filter(function (entry) {
        if (!matchesQuery(entry, options.q)) return false;
        if (options.genre && entry.genre !== options.genre) return false;
        if (
          options.mechanic &&
          (!entry.review || entry.review.mechanic !== options.mechanic)
        )
          return false;
        if (options.gen && (entry.generation || "v1") !== options.gen)
          return false;
        if (options.fav && !favoriteSet.has(entry.id)) return false;
        if (eventIdSet && !eventIdSet.has(entry.id)) return false;
        return true;
      });

      var sorted = filtered.slice();
      var sort = options.sort || "popular";
      if (sort === "name") {
        sorted.sort(function (a, b) {
          return String(a.title || "").localeCompare(
            String(b.title || ""),
            "ko",
          );
        });
      } else if (sort === "newest") {
        sorted.sort(function (a, b) {
          var delta = publishedMs(b) - publishedMs(a);
          if (delta !== 0) return delta;
          return String(b.id || "").localeCompare(String(a.id || ""));
        });
      } else {
        var scores = options.scores || {};
        sorted.sort(function (a, b) {
          var scoreA = Number(scores[a.id] || 0);
          var scoreB = Number(scores[b.id] || 0);
          if (scoreB !== scoreA) return scoreB - scoreA;
          return String(a.title || "").localeCompare(
            String(b.title || ""),
            "ko",
          );
        });
      }
      return sorted;
    }

    function uniqueValues(entries, readValue) {
      var seen = new Set();
      var values = [];
      (entries || []).forEach(function (entry) {
        var value = readValue(entry);
        if (!value || seen.has(value)) return;
        seen.add(value);
        values.push(value);
      });
      return values.sort(function (a, b) {
        return a.localeCompare(b, "ko");
      });
    }

    return {
      readSearchParams: readSearchParams,
      writeSearchParams: writeSearchParams,
      matchesQuery: matchesQuery,
      applyFilters: applyFilters,
      uniqueValues: uniqueValues,
    };
  },
);
