/**
 * engines/conversation/conversation.js
 *
 * Milestone 4 — Conversation Engine (single-thread scope).
 * Milestone 5 — expanded to N-participant threads with turn order.
 *
 * Per the frozen architecture (Phase 8), this wraps the app's single
 * implicit conversation in a real Thread record: participants, status,
 * and lookup — rather than an untyped, unnamed concept. Milestone 4
 * scope was single-thread / single-participant-pair; Milestone 5 adds
 * genuine multi-participant support and a turn-order model (`currentTurnId`,
 * `advanceTurn`), per the frozen roadmap's Phase 10 data model.
 *
 * MILESTONE 5 SCOPE BOUNDARY: this engine now OWNS turn-order data
 * and the ability to advance it, but nothing in this milestone
 * automatically drives characters to take turns on their own — the
 * Orchestrator (Milestone 4) reads `getCurrentTurn()` to decide which
 * character responds to a user-directed message, but does not call
 * `advanceTurn()` itself. Autonomously cycling turns between
 * characters without user input is Milestone 6's job (the Scheduler);
 * this engine only needs to expose the primitive for that to use.
 *
 * ─────────────────────────────────────────────────────────────────
 * PLACEHOLDER IDENTITY HAND-OFF — CLOSED HERE
 * ─────────────────────────────────────────────────────────────────
 * Milestone 2's Memory Engine adopted the literal placeholder
 * threadId "default" for all recorded message history, with an
 * explicit note that Conversation Engine (this file) MUST reuse that
 * exact id for the first real thread. It does: see the
 * `createThread('default', ['likhi'])` call at the bottom of this
 * file. This closes that hand-off.
 * ─────────────────────────────────────────────────────────────────
 *
 * No persistence dependency — a thread's participant list and turn
 * state are small and fully reconstructible on every load via the
 * seed calls at the bottom of this file, so there is nothing
 * meaningful to persist yet (mirrors World Engine's Milestone 3 scope
 * decision). Revisit if a future milestone needs thread state to
 * survive a reload independent of re-running the seed.
 *
 * No dependencies on any other Likhi.* module.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};

  var threads = {};

  var ConversationEngine = {
    /**
     * Creates a thread if it doesn't already exist (idempotent).
     * The turn order defaults to the first participant, if any.
     * @param {string} threadId
     * @param {string[]} [participantIds]
     * @returns {object} the thread record
     */
    createThread: function (threadId, participantIds) {
      if (!threads[threadId]) {
        var participants = (participantIds || []).slice();
        threads[threadId] = {
          id: threadId,
          participants: participants,
          status: 'active',
          currentTurnId: participants.length ? participants[0] : null
        };
      }
      return threads[threadId];
    },

    /**
     * @param {string} threadId
     * @returns {?object} the thread record, or null if it doesn't exist
     */
    getThread: function (threadId) {
      return threads[threadId] || null;
    },

    /**
     * Returns the existing thread, or creates it if absent.
     * @param {string} threadId
     * @param {string[]} [participantIds]
     * @returns {object}
     */
    ensureThread: function (threadId, participantIds) {
      return threads[threadId] || this.createThread(threadId, participantIds);
    },

    /**
     * Adds a participant to a thread if not already present. If the
     * thread had no turn set yet (it started with zero participants),
     * the new participant becomes the current turn.
     * @param {string} threadId
     * @param {string} participantId
     * @returns {string[]} the updated participant list
     */
    addParticipant: function (threadId, participantId) {
      var thread = this.ensureThread(threadId, []);
      if (thread.participants.indexOf(participantId) === -1) {
        thread.participants.push(participantId);
      }
      if (thread.currentTurnId === null) {
        thread.currentTurnId = participantId;
      }
      return thread.participants;
    },

    /**
     * @param {string} threadId
     * @returns {?string} the characterId whose turn it currently is,
     *   or null if the thread doesn't exist or has no participants
     */
    getCurrentTurn: function (threadId) {
      var thread = this.getThread(threadId);
      return thread ? thread.currentTurnId : null;
    },

    /**
     * Explicitly sets whose turn it is. The given characterId must
     * already be a participant of the thread.
     * @param {string} threadId
     * @param {string} characterId
     * @returns {string} the new currentTurnId
     */
    setTurn: function (threadId, characterId) {
      var thread = this.getThread(threadId);
      if (!thread) {
        throw new Error('[ConversationEngine] no such thread "' + threadId + '"');
      }
      if (thread.participants.indexOf(characterId) === -1) {
        throw new Error('[ConversationEngine] "' + characterId + '" is not a participant of thread "' + threadId + '"');
      }
      thread.currentTurnId = characterId;
      return thread.currentTurnId;
    },

    /**
     * Advances the turn to the next participant in round-robin order.
     * With a single participant, the turn stays on that participant.
     * @param {string} threadId
     * @returns {string} the new currentTurnId
     */
    advanceTurn: function (threadId) {
      var thread = this.getThread(threadId);
      if (!thread || !thread.participants.length) {
        throw new Error('[ConversationEngine] cannot advance turn: thread "' + threadId + '" has no participants');
      }
      var idx = thread.participants.indexOf(thread.currentTurnId);
      var nextIdx = (idx === -1) ? 0 : (idx + 1) % thread.participants.length;
      thread.currentTurnId = thread.participants[nextIdx];
      return thread.currentTurnId;
    },

    /**
     * @returns {string[]} all known thread ids
     */
    listThreads: function () {
      return Object.keys(threads);
    }
  };

  Likhi.Engines = Likhi.Engines || {};
  Likhi.Engines.Conversation = ConversationEngine;

  /* Seed the single default thread for the current single-character,
     single-conversation scope. The id "default" and the participant
     id "likhi" MUST match Memory Engine's and Character Engine's
     already-established placeholder ids exactly. Unchanged from
     Milestone 4 — this thread's behavior must stay identical. */
  ConversationEngine.createThread('default', ['likhi']);

  /* Milestone 5 — a second, non-default thread proving genuine
     multi-participant support: three characters sharing one
     conversation. This is NOT surfaced in the app's UI (no chat
     screen exists for it yet — that's a UI feature decision, not an
     engine capability, and is out of this milestone's scope). It
     exists so Relationship Engine, turn order, and Prompt Engine's
     presence-awareness can be exercised and verified end-to-end
     against a real multi-party thread. See engines/character/maya.js
     and engines/character/nova.js for the two additional characters. */
  ConversationEngine.createThread('living-room', ['likhi', 'maya', 'nova']);

})(window);

