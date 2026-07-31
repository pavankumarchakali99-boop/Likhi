/**
 * engines/scheduler/scheduler.js
 *
 * Milestone 6 — Scheduler Engine (Phase 11).
 *
 * Drives autonomous action: decides WHEN a character should act
 * without user input, and hands off to the Orchestrator to decide
 * WHAT happens — the Scheduler itself never builds a prompt, calls a
 * provider, or knows anything about character personas. This mirrors
 * how the UI layer already calls the Orchestrator for human-driven
 * turns; the Scheduler is simply another caller.
 *
 * ─────────────────────────────────────────────────────────────────
 * SAFETY: AUTONOMY IS OFF BY DEFAULT
 * ─────────────────────────────────────────────────────────────────
 * Registering a trigger costs nothing and makes no network calls.
 * Only start() (or a manually-invoked tick()) actually calls a
 * provider, and start() is NEVER called anywhere in this app —
 * index.html does not invoke it. A trigger for the 'living-room'
 * thread is registered below purely so the model can be exercised
 * and verified end-to-end (see the Milestone 6 test suite), without
 * risking an unsuspecting user incurring real API costs just by
 * opening the page. Enabling real autonomy today requires an
 * explicit, deliberate call to `Likhi.Engines.Scheduler.start()`
 * (e.g. from the browser console) — there is no UI toggle for this
 * yet (see the Milestone 6 report's "remaining work" section).
 * ─────────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────────
 * PLUGGABLE TICK SOURCE / CLIENT-ONLY CEILING (documented, not solved)
 * ─────────────────────────────────────────────────────────────────
 * `tick()` is the actual trigger-evaluation logic and is exposed
 * directly, deliberately decoupled from any particular timer
 * mechanism — it can be invoked by start()'s real `setInterval` (the
 * only tick source this milestone implements), or called directly and
 * deterministically by a test, or, in the future, driven by a
 * server-side scheduler's own timer instead. A browser `setInterval`
 * only runs while the tab is open and not (usually) heavily
 * throttled in the background — this app cannot make characters act
 * autonomously while closed or the device is asleep. This is a known,
 * intentional limitation of a client-only build, not a bug to chase
 * in this milestone; a true always-on simulation needs a server-side
 * tick source calling this same tick() method (or an equivalent),
 * which is out of scope here.
 * ─────────────────────────────────────────────────────────────────
 *
 * GOVERNANCE: before acting on a due trigger, the Scheduler asks
 * core/governance/governance.js whether the acting character is
 * allowed to (cooldown + session budget). If not, the trigger is
 * skipped for this tick (not an error) and a 'scheduler:trigger_skipped'
 * event is published. Governance is asked here — and ONLY here, not
 * inside Orchestrator or Provider Engine — because the runaway-cost
 * risk this guards against is specific to autonomous, unattended
 * looping; see governance.js's header for the full reasoning.
 *
 * TURN ADVANCEMENT: after a successful multi-participant autonomous
 * turn, the Scheduler calls `ConversationEngine.advanceTurn()` — this
 * is what turns a series of individual autonomous turns into an
 * actual back-and-forth "exchange" between characters over
 * successive ticks, using the round-robin primitive Conversation
 * Engine already exposed in Milestone 5. Single-participant threads
 * (e.g. 'default') are never advanced, since there is only one
 * character to return to anyway.
 *
 * EVENTS PUBLISHED (via Event Bus — for a future UI/observability
 * layer to react to, without the Scheduler needing to know it exists):
 *   'scheduler:trigger_fired'    — an autonomous turn happened
 *   'scheduler:trigger_skipped'  — governance denied it this tick
 *   'scheduler:trigger_error'    — the provider call threw
 *   'scheduler:tick'             — a full tick pass completed
 *
 * MILESTONE 8 UPDATE: 'scheduler:trigger_fired' now includes a
 * `durationMs` field (how long the Orchestrator.handleIntent() call
 * took) — this is the only instrumentation added anywhere for
 * Milestone 8's observability layer; Orchestrator and Provider Engine
 * themselves are untouched. core/observability/observability.js
 * consumes this alongside the other scheduler and memory events
 * purely by subscribing — it has no special access here.
 *
 * Depends on: Conversation Engine (Milestone 4), Orchestrator
 * (Milestone 4/5/6), Memory Engine (Milestone 2), Event Bus
 * (Milestone 1), Governance (Milestone 6, this milestone's sibling).
 * Must load after all of these.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var ConversationEngine = Likhi.Engines && Likhi.Engines.Conversation;
  var Orchestrator       = Likhi.Engines && Likhi.Engines.Orchestrator;
  var MemoryEngine       = Likhi.Engines && Likhi.Engines.Memory;
  var EventBus           = Likhi.EventBus;
  var Governance         = Likhi.Governance;

  if (!ConversationEngine || !Orchestrator || !MemoryEngine || !EventBus || !Governance) {
    throw new Error(
      '[SchedulerEngine] one or more required modules failed to load — check that ' +
      'engines/conversation/conversation.js, engines/orchestrator/orchestrator.js, ' +
      'engines/memory/memory.js, core/event-bus/event-bus.js, and ' +
      'core/governance/governance.js are all loaded before engines/scheduler/scheduler.js.'
    );
  }

  var triggers = {};       // triggerId -> { threadId, condition(nowMs), enabled }
  var intervalHandle = null;

  var SchedulerEngine = {
    /**
     * Registers a trigger. `definition.condition(nowMs)` is called on
     * every tick; when it returns true, the trigger fires (subject to
     * governance). Registering does not itself cause any provider
     * call.
     * @param {string} triggerId
     * @param {{threadId: string, condition: function(number):boolean, enabled?: boolean}} definition
     * @returns {object} the stored trigger definition
     */
    registerTrigger: function (triggerId, definition) {
      var def = {};
      for (var k in definition) { def[k] = definition[k]; }
      if (def.enabled === undefined) def.enabled = true;
      triggers[triggerId] = def;
      return def;
    },

    /**
     * Convenience wrapper for the common case: fire roughly every
     * `intervalMs`. Encapsulates its own "time since last fire"
     * state so the core tick loop stays agnostic of any particular
     * condition's internals — a future event-based trigger (e.g.
     * "fire when a world fact changes") would just supply a different
     * condition function via registerTrigger() directly.
     * @param {string} triggerId
     * @param {string} threadId
     * @param {number} intervalMs
     * @returns {object} the stored trigger definition
     */
    registerTimeTrigger: function (triggerId, threadId, intervalMs) {
      var lastFiredAt = 0;
      return SchedulerEngine.registerTrigger(triggerId, {
        threadId: threadId,
        condition: function (nowMs) {
          if (nowMs - lastFiredAt >= intervalMs) {
            lastFiredAt = nowMs;
            return true;
          }
          return false;
        }
      });
    },

    /**
     * @param {string} triggerId
     */
    removeTrigger: function (triggerId) {
      delete triggers[triggerId];
    },

    /**
     * @param {string} triggerId
     * @param {boolean} enabled
     */
    setTriggerEnabled: function (triggerId, enabled) {
      if (triggers[triggerId]) triggers[triggerId].enabled = enabled;
    },

    /**
     * @returns {string[]} registered trigger ids
     */
    listTriggers: function () {
      return Object.keys(triggers);
    },

    /**
     * @param {string} triggerId
     * @returns {?object}
     */
    getTrigger: function (triggerId) {
      return triggers[triggerId] || null;
    },

    /**
     * Evaluates every registered, enabled trigger once. Exposed
     * directly (not only reachable via start()) so it can be driven
     * deterministically by a test, or by a future non-browser tick
     * source, without depending on real elapsed wall-clock time.
     * @param {number} [now] injectable for tests; defaults to Date.now()
     * @returns {Promise<object[]>} one result entry per trigger that
     *   was due this tick (fired, skipped, or errored)
     */
    tick: async function (now) {
      var nowMs = typeof now === 'number' ? now : Date.now();
      var results = [];

      for (var triggerId in triggers) {
        var trig = triggers[triggerId];
        if (!trig.enabled) continue;
        if (!trig.condition(nowMs)) continue;

        var thread = ConversationEngine.getThread(trig.threadId);
        if (!thread || !thread.participants.length) continue;

        var characterId = ConversationEngine.getCurrentTurn(trig.threadId) || thread.participants[0];

        if (!Governance.canAct(characterId, nowMs)) {
          results.push({ triggerId: triggerId, characterId: characterId, skipped: true, reason: 'governance' });
          EventBus.publish('scheduler:trigger_skipped', {
            triggerId: triggerId, characterId: characterId, threadId: trig.threadId, reason: 'governance'
          });
          continue;
        }

        try {
          var intent = { type: 'autonomous_turn', payload: {} };
          var startedAt = Date.now();
          var result = await Orchestrator.handleIntent(trig.threadId, intent);
          var durationMs = Date.now() - startedAt;
          Governance.recordAction(characterId, nowMs);

          if (result.kind === 'message') {
            MemoryEngine.record(characterId, trig.threadId, { role: 'assistant', content: result.content }, true);
          }

          if (thread.participants.length > 1) {
            ConversationEngine.advanceTurn(trig.threadId);
          }

          results.push({ triggerId: triggerId, characterId: characterId, skipped: false, result: result, durationMs: durationMs });
          EventBus.publish('scheduler:trigger_fired', {
            triggerId: triggerId, characterId: characterId, threadId: trig.threadId, result: result, durationMs: durationMs
          });
        } catch (err) {
          results.push({ triggerId: triggerId, characterId: characterId, skipped: false, error: err });
          EventBus.publish('scheduler:trigger_error', {
            triggerId: triggerId, characterId: characterId, threadId: trig.threadId, error: err
          });
        }
      }

      EventBus.publish('scheduler:tick', { now: nowMs, results: results });
      return results;
    },

    /**
     * Starts a real interval-driven tick loop — THIS IS THE ONLY
     * THING THAT MAKES AUTONOMOUS PROVIDER CALLS POSSIBLE. Nothing in
     * this app calls this automatically (see the file header's safety
     * note and index.html).
     * @param {number} [intervalMs] defaults to 15000 (15s)
     */
    start: function (intervalMs) {
      if (intervalHandle !== null) return; // already running
      var ms = intervalMs || 15000;
      intervalHandle = global.setInterval(function () {
        SchedulerEngine.tick().catch(function (err) {
          console.error('[SchedulerEngine] tick error:', err);
        });
      }, ms);
    },

    /**
     * Stops the interval-driven tick loop, if running.
     */
    stop: function () {
      if (intervalHandle !== null) {
        global.clearInterval(intervalHandle);
        intervalHandle = null;
      }
    },

    /**
     * @returns {boolean} whether start() has been called without a
     *   matching stop()
     */
    isRunning: function () {
      return intervalHandle !== null;
    }
  };

  Likhi.Engines.Scheduler = SchedulerEngine;

  /* A registered, enabled — but never automatically started — demo
     trigger on the 'living-room' thread (see engines/conversation/
     conversation.js), proving the full model end to end via tests:
     multiple characters, governed, turn-advancing autonomous
     exchanges. Registering this has zero cost; only start()/tick()
     do, and start() is never called anywhere in this app. */
  SchedulerEngine.registerTimeTrigger('living-room-autonomy', 'living-room', 20000);

})(window);
