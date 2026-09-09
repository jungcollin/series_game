(function relayDailyV2Factory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelayDailyV2 = api;
})(
  typeof window === "undefined" ? null : window,
  function createRelayDailyV2() {
    function getKstDateKey(now) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now || new Date());
    }

    function addKstDays(dateKey, days) {
      var parts = String(dateKey).split("-").map(Number);
      var utc = Date.UTC(parts[0], parts[1] - 1, parts[2] + days, 3, 0, 0);
      return getKstDateKey(new Date(utc));
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
        value += 0x6d2b79f5;
        var result = value;
        result = Math.imul(result ^ (result >>> 15), result | 1);
        result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
        return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
      };
    }

    function shuffle(items, random) {
      var copy = items.slice();
      for (var i = copy.length - 1; i > 0; i -= 1) {
        var j = Math.floor(random() * (i + 1));
        var tmp = copy[i];
        copy[i] = copy[j];
        copy[j] = tmp;
      }
      return copy;
    }

    function defaultRules() {
      return {
        timezone: "Asia/Seoul",
        slotCount: 5,
        revision: 1,
        minMechanicsPerDay: 4,
        cooldownDays: 7,
        eligibleStatuses: ["preliminary-eligible"],
        v2OnlyWhenPoolAtLeast: 0,
      };
    }

    function isEligible(entry, rules) {
      var review = entry && entry.review;
      if (!review) return false;
      if (review.officialEligible !== true) return false;
      var statuses =
        (rules && rules.eligibleStatuses) || defaultRules().eligibleStatuses;
      return statuses.indexOf(review.status) !== -1;
    }

    function mechanicOf(entry) {
      return (entry && entry.review && entry.review.mechanic) || "";
    }

    function uniqueNewestFirst(recentIds) {
      var ordered = [];
      var seen = new Set();
      (recentIds || []).forEach((id) => {
        if (!id || seen.has(id)) return;
        seen.add(id);
        ordered.push(id);
      });
      return ordered;
    }

    function mechanicCount(entries) {
      var mechanics = new Set();
      entries.forEach((entry) => {
        var mechanic = mechanicOf(entry);
        if (mechanic) mechanics.add(mechanic);
      });
      return mechanics.size;
    }

    function availableWithCooldown(pool, recentIds, slotCount, minMechanics) {
      var cooledNewestFirst = uniqueNewestFirst(recentIds);
      var keepCool = new Set();
      for (var i = 0; i < cooledNewestFirst.length; i += 1) {
        var trial = new Set(keepCool);
        trial.add(cooledNewestFirst[i]);
        var remaining = pool.filter((entry) => !trial.has(entry.id));
        if (remaining.length < slotCount) break;
        if (mechanicCount(remaining) < minMechanics) break;
        keepCool = trial;
      }
      return pool.filter((entry) => !keepCool.has(entry.id));
    }

    function pickRoute(pool, dateKey, rules, recentIds) {
      var config = Object.assign(defaultRules(), rules || {});
      var random = seededRandom(hashSeed(dateKey + ":v2:r" + config.revision));
      var available = availableWithCooldown(
        pool,
        recentIds,
        config.slotCount,
        config.minMechanicsPerDay,
      );
      if (available.length < config.slotCount) available = pool.slice();
      var ordered = shuffle(available, random);
      var selected = [];
      var mechanics = new Set();

      function tryPick(requireNewMechanic) {
        for (
          var i = 0;
          i < ordered.length && selected.length < config.slotCount;
          i += 1
        ) {
          var entry = ordered[i];
          if (selected.some((item) => item.id === entry.id)) continue;
          var mechanic = mechanicOf(entry);
          if (requireNewMechanic && mechanic && mechanics.has(mechanic))
            continue;
          selected.push(entry);
          if (mechanic) mechanics.add(mechanic);
        }
      }

      tryPick(true);
      tryPick(false);

      if (selected.length < config.slotCount) {
        throw new Error(
          "eligible pool cannot fill " +
            config.slotCount +
            " slots on " +
            dateKey,
        );
      }
      if (mechanics.size < config.minMechanicsPerDay) {
        throw new Error(
          "eligible pool cannot provide " +
            config.minMechanicsPerDay +
            " mechanics on " +
            dateKey,
        );
      }
      return selected.slice(0, config.slotCount);
    }

    function eligiblePool(catalog, rules) {
      var pool = (catalog || []).filter((entry) => isEligible(entry, rules));
      var config = Object.assign(defaultRules(), rules || {});
      var threshold = Number(config.v2OnlyWhenPoolAtLeast) || 0;
      if (threshold <= 0) return pool;
      // v2 풀이 임계값 이상이고 슬롯·메커닉 다양성을 채울 수 있을 때만 v2로 제한한다.
      var v2 = pool.filter((entry) => entry && entry.generation === "v2");
      if (
        v2.length >= Math.max(threshold, config.slotCount) &&
        mechanicCount(v2) >= config.minMechanicsPerDay
      ) {
        return v2;
      }
      return pool;
    }

    function buildChallenge(catalog, dateKey, rules, recentByDay) {
      var config = Object.assign(defaultRules(), rules || {});
      var key = dateKey || getKstDateKey();
      var recentIds = [];
      for (var i = 1; i <= config.cooldownDays; i += 1) {
        var previous = recentByDay && recentByDay[addKstDays(key, -i)];
        (previous || []).forEach((id) => {
          recentIds.push(id);
        });
      }
      var route = pickRoute(
        eligiblePool(catalog, config),
        key,
        config,
        recentIds,
      );
      return {
        id: "daily-" + key + "-r" + config.revision,
        dateKey: key,
        revision: config.revision,
        timezone: config.timezone,
        rankedWrites: false,
        stages: route.map((entry) => ({
          id: entry.id,
          title: entry.title,
          path: entry.path,
          creator: entry.creator,
          genre: entry.genre,
          clearCondition: entry.clearCondition,
          thumbnail: entry.thumbnail,
          mechanic: mechanicOf(entry),
          packageHash: entry.packageHash || null,
        })),
      };
    }

    function simulateRange(catalog, startDateKey, days, rules) {
      var recentByDay = {};
      var challenges = [];
      for (var i = 0; i < days; i += 1) {
        var dateKey = addKstDays(startDateKey, i);
        var challenge = buildChallenge(catalog, dateKey, rules, recentByDay);
        recentByDay[dateKey] = challenge.stages.map((stage) => stage.id);
        challenges.push(challenge);
      }
      return challenges;
    }

    function historyBefore(catalog, dateKey, rules) {
      var config = Object.assign(defaultRules(), rules || {});
      var start = addKstDays(dateKey, -config.cooldownDays);
      var simulated = simulateRange(
        catalog,
        start,
        config.cooldownDays,
        config,
      );
      var recentByDay = {};
      for (var i = 0; i < simulated.length; i += 1) {
        recentByDay[simulated[i].dateKey] = simulated[i].stages.map(
          (stage) => stage.id,
        );
      }
      return recentByDay;
    }

    return {
      getKstDateKey: getKstDateKey,
      addKstDays: addKstDays,
      defaultRules: defaultRules,
      eligiblePool: eligiblePool,
      buildChallenge: buildChallenge,
      simulateRange: simulateRange,
      historyBefore: historyBefore,
    };
  },
);
