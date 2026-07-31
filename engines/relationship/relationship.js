/**
 * engines/relationship/relationship.js
 *
 * Milestone 5 — Relationship Engine (Phase 9).
 *
 * Owns the CURRENT relational state between characters (affinity,
 * trust, familiarity) — distinct from Memory Engine, which owns
 * historical record. Relationship Engine never stores raw
 * conversation content, only derived, continuously-updated state
 * about how one character's relationship to another currently stands.
 *
 * ─────────────────────────────────────────────────────────────────
 * WHY EVENT-DRIVEN, NOT A DIRECT CALL
 * ─────────────────────────────────────────────────────────────────
 * This engine reacts to Memory Engine's 'memory:recorded' event
 * (published via Event Bus — see Milestone 5's update to
 * engines/memory/memory.js) instead of being called directly by the
 * Orchestrator or by Memory Engine. This is a deliberate coupling
 * choice: Memory Engine has ZERO awareness this engine exists, and
 * the Orchestrator doesn't need to remember to call it either. Any
 * future engine that needs to react to "an interaction just
 * happened" (e.g. a future analytics or mood-tracking engine) should
 * subscribe to the same event rather than being wired in as another
 * direct call from Memory Engine or the Orchestrator — direct calls
 * from a coordinator TO an engine (like the Orchestrator calling
 * Prompt Engine) are fine; what this avoids is engines that
 * shouldn't need to know about each other accumulating direct
 * dependencies as more reactive behavior gets added over time.
 * ─────────────────────────────────────────────────────────────────
 *
 * UPDATE POLICY (Milestone 5, deliberately minimal): when a
 * character's memory records a new entry in a thread, that
 * character's familiarity toward every OTHER participant in the same
 * thread increases by 1 (capped at 100). This is a simple, documented
 * starting policy — not a claim about relationship psychology — and
 * can be replaced with a richer policy later without changing this
 * engine's public interface (get/list).
 *
 * No persistence in this milestone — mirrors World Engine's (M3) and
 * Conversation Engine's (M4) same scope decision: a single session's
 * relationship state is fully reconstructible from replaying
 * recorded interactions, so there is nothing durable to persist yet.
 * Revisit if a future milestone needs relationship state to survive
 * a reload independent of message history.
 *
 * Depends on Likhi.EventBus (Milestone 1) and Likhi.Engines.Conversation
 * (Milestone 4), to look up who else is in a thread when an event
 * arrives. Does NOT depend on Memory Engine, Character Engine, the
 * Orchestrator, or the app script.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var EventBus = Likhi.EventBus;
  var ConversationEngine = Likhi.Engines && Likhi.Engines.Conversation;

  if (!EventBus || !ConversationEngine) {
    throw new Error('[RelationshipEngine] Likhi.EventBus and Likhi.Engines.Conversation must be loaded before relationship.js');
  }

  // key: "fromCharacterId->toCharacterId" -> relationship record
  var relationships = {};

  function key(fromId, toId) {
    return fromId + '->' + toId;
  }

  function ensureRelationship(fromId, toId) {
    var k = key(fromId, toId);
    if (!relationships[k]) {
      relationships[k] = {
        fromCharacterId: fromId,
        toCharacterId: toId,
        affinity: 50,
        trust: 50,
        familiarity: 0,
        tags: [],
        lastUpdated: null
      };
    }
    return relationships[k];
  }

  function applyInteraction(fromId, toId) {
    var rel = ensureRelationship(fromId, toId);
    rel.familiarity = Math.min(100, rel.familiarity + 1);
    rel.lastUpdated = Date.now();
    return rel;
  }

  var RelationshipEngine = {
    /**
     * @param {string} fromCharacterId
     * @param {string} toCharacterId
     * @returns {?object} the relationship record, or null if the pair
     *   has never interacted
     */
    get: function (fromCharacterId, toCharacterId) {
      return relationships[key(fromCharacterId, toCharacterId)] || null;
    },

    /**
     * @param {string} characterId
     * @returns {object[]} every relationship record involving this
     *   character, as either the "from" or "to" side
     */
    list: function (characterId) {
      var results = [];
      for (var k in relationships) {
        var rel = relationships[k];
        if (rel.fromCharacterId === characterId || rel.toCharacterId === characterId) {
          results.push(rel);
        }
      }
      return results;
    }
  };

  Likhi.Engines = Likhi.Engines || {};
  Likhi.Engines.Relationship = RelationshipEngine;

  /* The only coupling this engine has to the rest of the system. */
  EventBus.subscribe('memory:recorded', function (evt) {
    var thread = ConversationEngine.getThread(evt.threadId);
    if (!thread) return;
    thread.participants.forEach(function (otherId) {
      if (otherId !== evt.ownerId) {
        applyInteraction(evt.ownerId, otherId);
      }
    });
  });

})(window);
