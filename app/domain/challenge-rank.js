(function relayChallengeRankFactory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelayChallengeRank = api;
})(typeof window !== "undefined" ? window : null, function createRelayChallengeRank() {
  "use strict";

  function compareRows(left, right) {
    var leftClear = Boolean(left && left.finished_all_clear);
    var rightClear = Boolean(right && right.finished_all_clear);
    if (leftClear !== rightClear) return leftClear ? -1 : 1;

    var leftCount = Number(left && left.clear_count) || 0;
    var rightCount = Number(right && right.clear_count) || 0;
    if (leftCount !== rightCount) return rightCount - leftCount;

    var leftDuration = Number(left && left.duration_sec) || 0;
    var rightDuration = Number(right && right.duration_sec) || 0;
    if (leftClear) {
      if (leftDuration !== rightDuration) return leftDuration - rightDuration;
    } else if (leftDuration !== rightDuration) {
      return rightDuration - leftDuration;
    }

    return String((left && left.created_at) || "").localeCompare(String((right && right.created_at) || ""));
  }

  function isBetter(candidate, current) {
    if (!current) return true;
    return compareRows(candidate, current) < 0;
  }

  function personalBests(rows) {
    var best = new Map();
    (rows || []).forEach(function (row) {
      var subject = row && row.subject;
      if (!subject) return;
      var current = best.get(subject);
      if (isBetter(row, current)) best.set(subject, row);
    });
    return Array.from(best.values()).sort(compareRows);
  }

  function withRanks(rows) {
    return personalBests(rows).map(function (row, index) {
      return Object.assign({}, row, { rank: index + 1 });
    });
  }

  return {
    compareRows: compareRows,
    isBetter: isBetter,
    personalBests: personalBests,
    withRanks: withRanks,
  };
});
