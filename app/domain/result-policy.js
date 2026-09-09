(function relayResultPolicyFactory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelayResultPolicy = api;
})(typeof window !== "undefined" ? window : null, function createRelayResultPolicy() {
  "use strict";

  var CHALLENGE_ID_RE = /^daily-\d{4}-\d{2}-\d{2}-r[1-9]\d*$/;

  function parseChallengeId(value) {
    var id = String(value || "").trim();
    if (!CHALLENGE_ID_RE.test(id)) return null;
    var dateKey = id.slice(6, 16);
    var revision = Number(id.slice(18));
    return { id: id, dateKey: dateKey, revision: revision };
  }

  function buildChallengeId(dateKey, revision) {
    var rev = Number(revision) || 1;
    return "daily-" + dateKey + "-r" + rev;
  }

  function classifyRun(options) {
    options = options || {};
    var mode = options.mode === "practice" ? "practice" : "challenge";
    var parsed = parseChallengeId(options.challengeId);
    var todayId = options.todayChallengeId || "";
    var rankedWritesEnabled = options.rankedWritesEnabled === true;
    var outcome = options.outcome || "idle";
    var technical = options.technical === true || outcome === "incomplete";

    if (mode === "practice") {
      return {
        official: false,
        saveState: "practice",
        label: "연습",
        headline: technical ? "기술 오류 · 연습" : "연습 결과",
        canSubmitOfficial: false,
      };
    }

    if (!parsed) {
      return {
        official: false,
        saveState: "invalid-course",
        label: "코스 없음",
        headline: "이 코스를 열 수 없습니다",
        canSubmitOfficial: false,
      };
    }

    if (todayId && parsed.id !== todayId) {
      return {
        official: false,
        saveState: "archive",
        label: "지난 코스",
        headline: technical ? "기술 오류 · 지난 코스" : "지난 코스 결과",
        canSubmitOfficial: false,
      };
    }

    if (!rankedWritesEnabled) {
      return {
        official: false,
        saveState: "writes-off",
        label: "로컬 도전",
        headline: technical ? "기술 오류 · 공식 기록 미등록" : "로컬 도전 결과",
        canSubmitOfficial: false,
      };
    }

    return {
      official: true,
      saveState: "pending",
      label: "공식",
      headline: technical ? "기술 오류" : "공식 결과",
      canSubmitOfficial: outcome === "all-clear" || outcome === "failed",
    };
  }

  function resultCopy(options) {
    var classified = classifyRun(options);
    var outcome = (options && options.outcome) || "idle";
    if (outcome === "incomplete") {
      return classified.headline + " · 로드 실패는 완주로 치지 않습니다.";
    }
    if (classified.saveState === "writes-off") {
      return "서버 공식 기록 등록은 아직 닫혀 있습니다. 이 결과는 이 브라우저에만 남습니다.";
    }
    if (classified.saveState === "practice") {
      return "연습 결과는 공식 기록에 제출되지 않습니다.";
    }
    if (classified.saveState === "archive") {
      return "지난 코스는 연습으로만 열립니다. 공식 기록에 제출되지 않습니다.";
    }
    return classified.headline;
  }

  return {
    CHALLENGE_ID_RE: CHALLENGE_ID_RE,
    parseChallengeId: parseChallengeId,
    buildChallengeId: buildChallengeId,
    classifyRun: classifyRun,
    resultCopy: resultCopy,
  };
});
