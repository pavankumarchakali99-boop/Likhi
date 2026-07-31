/**
 * engines/memory/memory.js
 *
 * Milestone 2 — Memory Engine.
 *
 * Replaces the flat, triple-purpose message array Milestone 1 kept in
 * Store (render source + persistence payload + provider context, with
 * three independently-tuned truncations) with a real record/retrieve
 * API and ONE consolidated retrieval policy, parameterized by purpose.
 *
 * ─────────────────────────────────────────────────────────────────
 * PLACEHOLDER IDENTITY HAND-OFF (Milestone 2 spec §6.1 / §6.2)
 * ─────────────────────────────────────────────────────────────────
 * Character Engine (Milestone 3) and Conversation Engine (Milestone 4)
 * do not exist yet. Until they do, every call site in the app uses two
 * literal placeholder ids:
 *
 *     ownerId  = "likhi"     (stands in for the future Character id)
 *     threadId = "default"   (stands in for the future Conversation
 *                              thread id)
 *
 * These exact strings are recorded in localStorage as part of the
 * namespaced key (see namespacedKey() below). Milestone 3's Character
 * Engine MUST register its first character under the id "likhi", and
 * Milestone 4's Conversation Engine MUST use "default" as the id of
 * the first migrated thread — otherwise this milestone's recorded
 * history becomes silently unreachable under the ids those engines
 * actually use.
 * ─────────────────────────────────────────────────────────────────
 *
 * Depends on Likhi.Persistence (Milestone 1) and Likhi.EventBus
 * (Milestone 1). Does not depend on Store or the app script.
 *
 * MILESTONE 5 UPDATE: record() now publishes a 'memory:recorded'
 * event via Event Bus after every call (regardless of the `persist`
 * flag -- the event represents an in-memory interaction happening,
 * independent of whether it's saved to storage). This is purely
 * additive: return values and all prior behavior are unchanged. It
 * exists so Relationship Engine (Milestone 5) can react to
 * interactions without Memory Engine knowing Relationship Engine
 * exists -- prefer this pattern over a direct call for any future
 * engine that needs to react to memory activity.
 *
 * MILESTONE 7 UPDATE: record() gained an optional 5th `meta`
 * parameter, included only in the published event (never persisted,
 * never part of retrieve()'s results). This lets index.html's UI
 * layer become a pure reactive subscriber to 'memory:recorded'
 * instead of calling record() itself from inside rendering code —
 * see index.html's renderMsgDOM/renderImgDOM and its event
 * subscription for how this closes out the last direct UI->engine
 * call this app had.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var Persistence = Likhi.Persistence;
  var EventBus = Likhi.EventBus;
  if (!Persistence || !EventBus) {
    throw new Error('[MemoryEngine] Likhi.Persistence and Likhi.EventBus must be loaded before memory.js');
  }

  var MAX_MESSAGES = 60;

  // The Milestone 1 flat key. Migrated once, then removed. Left as a
  // named constant (rather than inlined) so its one purpose --
  // one-time legacy migration -- stays obvious at a glance.
  var LEGACY_MESSAGES_KEY = 'Likhi_messages';

  function namespacedKey(ownerId, threadId) {
    return 'Likhi_memory:' + ownerId + ':' + threadId + ':messages';
  }

  function cacheKey(ownerId, threadId) {
    return ownerId + '::' + threadId;
  }

  // In-memory cache of the current message list per (ownerId, threadId).
  // Mirrors Milestone 1's Store, which always kept the in-memory array
  // up to date regardless of whether the memory toggle allowed a given
  // write to be PERSISTED. Memory Engine reproduces that same split:
  // in-memory state always updates; persistence is a conditional side
  // effect layered on top (see record()).
  var cache = {};
  var migratedKeys = {};

  /**
   * One-time, idempotent migration from the old flat Milestone-1 key
   * into the namespaced key for the given (ownerId, threadId). Safe to
   * call repeatedly -- after the first successful run for a given
   * namespaced key, this is a no-op, and it is also a no-op if there
   * was never anything to migrate.
   */
  function ensureMigrated(ownerId, threadId) {
    var nsKey = namespacedKey(ownerId, threadId);
    var ck = cacheKey(ownerId, threadId);
    if (migratedKeys[ck]) return;
    migratedKeys[ck] = true;

    // If the namespaced key already holds data, either migration
    // already ran in a previous session, or this owner/thread already
    // has its own independent history -- either way, do nothing.
    var alreadyPresent = Persistence.get(nsKey);
    if (alreadyPresent !== null) return;

    var legacy = Persistence.getJSON(LEGACY_MESSAGES_KEY, null);
    if (legacy === null) return; // nothing to migrate (fresh install, or already migrated+removed)

    var list = Array.isArray(legacy) ? legacy : [];
    Persistence.setJSON(nsKey, list);
    Persistence.remove(LEGACY_MESSAGES_KEY);
  }

  function loadFromStorage(ownerId, threadId) {
    ensureMigrated(ownerId, threadId);
    var list = Persistence.getJSON(namespacedKey(ownerId, threadId), []);
    return Array.isArray(list) ? list : [];
  }

  function getCachedList(ownerId, threadId) {
    var ck = cacheKey(ownerId, threadId);
    if (!cache[ck]) {
      cache[ck] = loadFromStorage(ownerId, threadId);
    }
    return cache[ck];
  }

  function persistList(ownerId, threadId, list) {
    Persistence.setJSON(namespacedKey(ownerId, threadId), list);
  }

  // Named retrieval strategies. Each reproduces one of the three
  // independently-tuned slice/filter operations that previously lived
  // inline at different call sites in the app script:
  //   - 'all'           : full retained history, for UI restore-on-load
  //                       (previously: rendering S.messages directly)
  //   - 'chat-context'  : previously `.slice(-10).filter(...)` inline
  //                       in callChatAPI()
  //   - 'image-context' : previously `.slice(-4).filter(...)` inline
  //                       in getContext()
  // IMPORTANT: slice happens BEFORE filter in both windowed strategies,
  // exactly as in the original code -- reversing this order would
  // change how many real (non-image) messages make it through when an
  // '[image]' placeholder falls inside the window.
  var STRATEGIES = {
    all: function (list) {
      return list.slice();
    },
    'chat-context': function (list) {
      return list.slice(-10).filter(function (m) { return m.content !== '[image]'; });
    },
    'image-context': function (list) {
      return list.slice(-4).filter(function (m) { return m.content !== '[image]'; });
    }
  };

  var MemoryEngine = {
    /**
     * Append a message for (ownerId, threadId), trimmed to the last
     * MAX_MESSAGES. The in-memory copy is always updated; the
     * persisted copy is only written when `persist` is true --
     * callers pass the current memory-toggle value, reproducing the
     * original app's "only save when memory is on" behavior exactly
     * (including the case where memory is later re-enabled: the next
     * persisted write includes everything accumulated in memory
     * while the toggle was off).
     *
     * MILESTONE 7 UPDATE: accepts an optional `meta` argument that is
     * included ONLY in the published 'memory:recorded' event -- it is
     * never stored, never persisted, and never returned by
     * retrieve(). This exists so a UI subscriber can render content
     * that isn't part of the persisted record itself (e.g. a
     * generated image's URL, when only the '[image]' placeholder is
     * ever stored) without Memory Engine needing to know anything
     * about rendering, images, or the UI.
     * @param {string} ownerId
     * @param {string} threadId
     * @param {{role: string, content: string}} message
     * @param {boolean} persist
     * @param {*} [meta] transient, event-only, never persisted
     * @returns {Array} the current in-memory list (post-append, post-trim)
     */
    record: function (ownerId, threadId, message, persist, meta) {
      var list = getCachedList(ownerId, threadId);
      list.push(message);
      if (list.length > MAX_MESSAGES) {
        list = list.slice(-MAX_MESSAGES);
      }
      cache[cacheKey(ownerId, threadId)] = list;
      if (persist) {
        persistList(ownerId, threadId, list);
      }
      EventBus.publish('memory:recorded', { ownerId: ownerId, threadId: threadId, message: message, meta: meta });
      return list.slice();
    },

    /**
     * Retrieve messages for (ownerId, threadId) according to a named
     * strategy. Unknown strategy names fall back to 'all'.
     * @param {string} ownerId
     * @param {string} threadId
     * @param {string} strategy one of 'all' | 'chat-context' | 'image-context'
     * @returns {Array<{role:string, content:string}>}
     */
    retrieve: function (ownerId, threadId, strategy) {
      var list = getCachedList(ownerId, threadId);
      var fn = STRATEGIES[strategy] || STRATEGIES.all;
      return fn(list);
    },

    /**
     * Clears all messages for (ownerId, threadId) and removes the
     * persisted key entirely -- mirrors the original clearChat()
     * behavior.
     * @param {string} ownerId
     * @param {string} threadId
     */
    clear: function (ownerId, threadId) {
      cache[cacheKey(ownerId, threadId)] = [];
      Persistence.remove(namespacedKey(ownerId, threadId));
    }
  };

  Likhi.Engines = Likhi.Engines || {};
  Likhi.Engines.Memory = MemoryEngine;

})(window);
