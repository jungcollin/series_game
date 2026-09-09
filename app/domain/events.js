(function relayEventsFactory(root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.RelayEvents = api;
})(
  typeof window === "undefined" ? null : window,
  function createRelayEvents() {
    

    var DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

    function getKstDateKey(now) {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(now || new Date());
    }

    function isValidDateKey(value) {
      if (!DATE_KEY_RE.test(String(value || ""))) return false;
      var parts = String(value).split("-").map(Number);
      var utc = Date.UTC(parts[0], parts[1] - 1, parts[2]);
      var date = new Date(utc);
      return (
        date.getUTCFullYear() === parts[0] &&
        date.getUTCMonth() === parts[1] - 1 &&
        date.getUTCDate() === parts[2]
      );
    }

    function validateEvent(event) {
      var errors = [];
      if (!event || typeof event !== "object") {
        return ["event must be an object"];
      }
      if (!event.id || typeof event.id !== "string") {
        errors.push("id is required");
      }
      if (!event.title || typeof event.title !== "string") {
        errors.push("title is required");
      }
      if (!isValidDateKey(event.startsOn)) {
        errors.push("startsOn must be a YYYY-MM-DD date");
      }
      if (!isValidDateKey(event.endsOn)) {
        errors.push("endsOn must be a YYYY-MM-DD date");
      }
      if (
        isValidDateKey(event.startsOn) &&
        isValidDateKey(event.endsOn) &&
        event.startsOn > event.endsOn
      ) {
        errors.push("startsOn must be on or before endsOn");
      }
      if (!Array.isArray(event.stageIds) || !event.stageIds.length) {
        errors.push("stageIds must be a non-empty array");
      } else {
        var seen = new Set();
        event.stageIds.forEach((id) => {
          if (!id || typeof id !== "string") {
            errors.push("stageIds must contain only non-empty strings");
            return;
          }
          if (seen.has(id)) {
            errors.push("duplicate stage id: " + id);
          }
          seen.add(id);
        });
      }
      return errors;
    }

    function validateEventsData(data) {
      var errors = [];
      if (!data || !Array.isArray(data.events)) {
        return ["events must be an array"];
      }
      var ids = new Set();
      data.events.forEach((event, index) => {
        validateEvent(event).forEach((error) => {
          errors.push("events[" + index + "]: " + error);
        });
        if (event && event.id) {
          if (ids.has(event.id)) {
            errors.push("events[" + index + "]: duplicate event id: " + event.id);
          }
          ids.add(event.id);
        }
      });
      return errors;
    }

    function isActiveOn(event, dateKey) {
      return (
        isValidDateKey(dateKey) &&
        isValidDateKey(event && event.startsOn) &&
        isValidDateKey(event && event.endsOn) &&
        event.startsOn <= dateKey &&
        dateKey <= event.endsOn
      );
    }

    function selectActiveEvent(data, dateKey) {
      var key = isValidDateKey(dateKey) ? dateKey : getKstDateKey();
      var events = (data && data.events) || [];
      var active = events.filter((event) => isActiveOn(event, key));
      if (!active.length) return null;
      active.sort((a, b) => {
        if (a.startsOn !== b.startsOn) {
          return a.startsOn < b.startsOn ? 1 : -1;
        }
        return String(a.id).localeCompare(String(b.id));
      });
      return active[0];
    }

    function resolveEventStages(event, entries) {
      if (!event || !Array.isArray(event.stageIds)) return [];
      var byId = new Map(
        (entries || []).map((entry) => [entry.id, entry]),
      );
      return event.stageIds
        .map((id) => byId.get(id))
        .filter(Boolean);
    }

    function stageIdSet(event) {
      return new Set((event && event.stageIds) || []);
    }

    function formatPeriod(event, locale) {
      if (!event || !isValidDateKey(event.startsOn) || !isValidDateKey(event.endsOn)) {
        return "";
      }
      var formatter = new Intl.DateTimeFormat(locale || "ko-KR", {
        timeZone: "Asia/Seoul",
        month: "long",
        day: "numeric",
      });
      function toDate(dateKey) {
        var parts = dateKey.split("-").map(Number);
        return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 12));
      }
      return formatter.format(toDate(event.startsOn)) + " ~ " + formatter.format(toDate(event.endsOn));
    }

    return {
      getKstDateKey: getKstDateKey,
      isValidDateKey: isValidDateKey,
      validateEvent: validateEvent,
      validateEventsData: validateEventsData,
      isActiveOn: isActiveOn,
      selectActiveEvent: selectActiveEvent,
      resolveEventStages: resolveEventStages,
      stageIdSet: stageIdSet,
      formatPeriod: formatPeriod,
    };
  },
);
