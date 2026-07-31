/**
 * core/governance/governance.js
 *
 * Milestone 6 — Governance (Phase 11 risk mitigation).
 *
 * A policy guard against runaway autonomous provider calls: a
 * per-character cooldown and a per-session budget cap. This is
 * deliberately a small, standalone module living under /core (like
 * Event Bus and Persistence) rather than a new domain engine, and
 * deliberately NOT a wrapper around Provider Engine's or the
 * Orchestrator's call path in general.
 *
 * ─────────────────────────────────────────────────────────────────
 * WHY THIS DOESN'T WRAP EVERY CHAT CALL
 * ─────────────────────────────────────────────────────────────────
 * The risk this exists to prevent is specifically an autonomous
 * Scheduler looping unbounded and racking up provider cost with no
 * human in the loop — NOT normal user-driven conversation, which is
 * inherently rate-limited by a person typing. Wrapping Provider
 * Engine's or the Orchestrator's shared call path here would silently
 * start rate-limiting ordinary chat too, which is both unnecessary
 * and a backward-compatibility regression. Instead, only
 * engines/scheduler/scheduler.js calls into this module, immediately
 * before it asks the Orchestrator to produce an autonomous turn. This
 * is a direct call (a permission QUERY that returns a value), not an
 * event — Event Bus's fire-and-forget publish/subscribe has no
 * request/response semantics, so a yes/no gate like this has to be a
 * normal function call, consistent with the project's established
 * split (direct calls for "compute and return a value," events for
 * "notify that something happened").
 * ─────────────────────────────────────────────────────────────────
 *
 * No persistence — cooldowns and the session budget are meant to
 * reset on reload (a fresh page session gets a fresh budget); this is
 * a deliberate characteristic, not an oversight.
 *
 * No dependencies on any other Likhi.* module.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};

  var DEFAULT_COOLDOWN_MS = 30000;    // 30s per character between autonomous actions
  var DEFAULT_SESSION_BUDGET = 20;    // total autonomous actions allowed per page session

  var cooldownMs = DEFAULT_COOLDOWN_MS;
  var sessionBudget = DEFAULT_SESSION_BUDGET;
  var remainingBudget = DEFAULT_SESSION_BUDGET;
  var lastActionAt = {}; // characterId -> timestamp (ms)

  var Governance = {
    /**
     * Overrides the default cooldown and/or session budget. Changing
     * sessionBudget resets the remaining budget to the new value.
     * @param {{cooldownMs?: number, sessionBudget?: number}} [options]
     */
    configure: function (options) {
      var opts = options || {};
      if (typeof opts.cooldownMs === 'number') {
        cooldownMs = opts.cooldownMs;
      }
      if (typeof opts.sessionBudget === 'number') {
        sessionBudget = opts.sessionBudget;
        remainingBudget = sessionBudget;
      }
    },

    /**
     * Query only — does NOT consume budget or start a cooldown.
     * Callers must call recordAction() themselves after actually
     * acting, so a mere permission check never has a side effect.
     * @param {string} characterId
     * @param {number} [now] injectable for tests
     * @returns {boolean}
     */
    canAct: function (characterId, now) {
      var nowMs = typeof now === 'number' ? now : Date.now();
      if (remainingBudget <= 0) return false;
      var last = lastActionAt[characterId];
      if (last !== undefined && (nowMs - last) < cooldownMs) return false;
      return true;
    },

    /**
     * Records that an autonomous action was actually taken for a
     * character: starts that character's cooldown and consumes one
     * unit of the session budget. Does not re-check canAct() —
     * callers are expected to have already checked.
     * @param {string} characterId
     * @param {number} [now] injectable for tests
     */
    recordAction: function (characterId, now) {
      var nowMs = typeof now === 'number' ? now : Date.now();
      lastActionAt[characterId] = nowMs;
      remainingBudget = Math.max(0, remainingBudget - 1);
    },

    /**
     * @returns {number} autonomous actions remaining this session
     */
    getRemainingBudget: function () {
      return remainingBudget;
    },

    /**
     * @param {string} characterId
     * @param {number} [now] injectable for tests
     * @returns {number} milliseconds remaining in this character's
     *   cooldown (0 if not currently on cooldown)
     */
    getCooldownRemaining: function (characterId, now) {
      var nowMs = typeof now === 'number' ? now : Date.now();
      var last = lastActionAt[characterId];
      if (last === undefined) return 0;
      return Math.max(0, cooldownMs - (nowMs - last));
    },

    /**
     * Resets all cooldowns and restores the full session budget.
     * Mainly useful for tests — a real page reload has the same
     * effect naturally, since this module persists nothing.
     */
    reset: function () {
      lastActionAt = {};
      remainingBudget = sessionBudget;
    }
  };

  Likhi.Governance = Governance;

})(window);
