/**
 * core/observability/observability.js
 *
 * Milestone 8 — Observability (Phase 13, scale-out hardening).
 *
 * A read-only log and summary of what the system has been doing —
 * Orchestrator turns (via the Scheduler's events), provider latency
 * for autonomous turns, and general event-bus traffic. This exists so
 * a running simulation isn't a black box, per the frozen
 * architecture's own risk note: "a running simulation is much harder
 * to debug blind than a request/response chatbot."
 *
 * ─────────────────────────────────────────────────────────────────
 * WHY THIS IS PURELY A SUBSCRIBER — NO ENGINE KNOWS IT EXISTS
 * ─────────────────────────────────────────────────────────────────
 * This module does not modify Scheduler, Orchestrator, Memory Engine,
 * or Governance in any way beyond one small, already-justified
 * addition (Scheduler now includes `durationMs` in its
 * 'scheduler:trigger_fired' event — see scheduler.js's Milestone 8
 * note). Observability simply subscribes to events those modules
 * already publish. This is the same event-driven pattern established
 * by Relationship Engine in Milestone 5: adding a new "someone reacts
 * to what happened" concern should never require editing the engine
 * that made it happen.
 * ─────────────────────────────────────────────────────────────────
 *
 * This module is entirely OPTIONAL to the app's operation — nothing
 * else depends on it, and it makes no calls into any other engine. It
 * only reads from Event Bus and exposes what it collected.
 *
 * In-memory only, capped ring buffer — this is a debugging aid for
 * the current session, not a durable audit log.
 *
 * Depends on Likhi.EventBus (Milestone 1) only.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var EventBus = Likhi.EventBus;
  if (!EventBus) {
    throw new Error('[Observability] Likhi.EventBus must be loaded before observability.js');
  }

  var MAX_LOG_ENTRIES = 200;
  var log = [];

  function recordEntry(type, payload) {
    log.push({ type: type, at: Date.now(), payload: payload });
    if (log.length > MAX_LOG_ENTRIES) {
      log = log.slice(-MAX_LOG_ENTRIES);
    }
  }

  // Every event name this module is aware of. Adding a new one here
  // is the only change ever needed to observe a new kind of activity
  // — no other file needs to change.
  var TRACKED_EVENTS = [
    'scheduler:tick',
    'scheduler:trigger_fired',
    'scheduler:trigger_skipped',
    'scheduler:trigger_error',
    'memory:recorded'
  ];

  TRACKED_EVENTS.forEach(function (eventName) {
    EventBus.subscribe(eventName, function (payload) {
      recordEntry(eventName, payload);
    });
  });

  var Observability = {
    /**
     * @returns {object[]} a copy of the captured log (oldest first,
     *   capped at the most recent MAX_LOG_ENTRIES)
     */
    getLog: function () {
      return log.slice();
    },

    /**
     * Clears the captured log.
     */
    clear: function () {
      log = [];
    },

    /**
     * Summarizes autonomous-turn activity captured so far — the
     * specific thing Milestone 8's acceptance criteria asks to be
     * reviewed against a real Milestone 6 autonomous session.
     * @returns {{totalEvents: number, autonomousTurns: {fired: number, skipped: number, errors: number, avgDurationMs: ?number}}}
     */
    getSummary: function () {
      var fired = log.filter(function (e) { return e.type === 'scheduler:trigger_fired'; });
      var skipped = log.filter(function (e) { return e.type === 'scheduler:trigger_skipped'; });
      var errors = log.filter(function (e) { return e.type === 'scheduler:trigger_error'; });

      var durations = fired
        .map(function (e) { return e.payload && e.payload.durationMs; })
        .filter(function (d) { return typeof d === 'number'; });
      var totalDuration = durations.reduce(function (sum, d) { return sum + d; }, 0);

      return {
        totalEvents: log.length,
        autonomousTurns: {
          fired: fired.length,
          skipped: skipped.length,
          errors: errors.length,
          avgDurationMs: durations.length ? Math.round(totalDuration / durations.length) : null
        }
      };
    }
  };

  Likhi.Observability = Observability;

})(window);
