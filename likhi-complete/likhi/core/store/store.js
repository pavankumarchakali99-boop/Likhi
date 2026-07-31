/**
 * core/store/store.js
 *
 * Milestone 1 — Foundation Infrastructure.
 *
 * Replaces the original app's bare `S` object and `loadState()`
 * function with a dispatch/subscribe Store. Depends on both
 * Likhi.Persistence (load/save) and Likhi.EventBus (change
 * notification) — this is the only Milestone 1 module with real
 * dependencies, which is why it must be the last of the three
 * <script> tags to load.
 *
 * IMPORTANT — this module is a transitional scaffold, not a final
 * home for domain state (see Milestone 1 implementation spec,
 * Finding 4 / risk #8). It currently holds the entire flat state
 * shape the original app used, because Milestone 1's job is only to
 * relocate existing behavior, not to redesign it. Starting in
 * Milestone 2, each engine that is extracted (Memory, Character,
 * World, Conversation, ...) is responsible for REMOVING its
 * corresponding slice from this Store, not duplicating it. By the
 * end of Milestone 4 this Store should hold only pure UI-presentation
 * state (e.g. which modal is open), nothing domain-related.
 *
 * MILESTONE 2 UPDATE: the `messages` field and the `pushMessage()` /
 * `clearMessages()` methods have been REMOVED from this file. That
 * slice of state, and all its behavior (trim-to-60, conditional
 * persistence based on the memory flag), now lives exclusively in
 * engines/memory/memory.js (Memory Engine). This closes out the
 * transitional-scaffold obligation above for this specific slice —
 * do not reintroduce a messages field here.
 *
 * MILESTONE 3 UPDATE: the `affection`, `playfulness`, and `flirty`
 * fields have also been REMOVED from this file. Personality traits
 * are character data (project vision Rule 4: "Characters own
 * personality, not the world"), and now live exclusively in
 * engines/character/character.js (Character Engine), which migrated
 * their previously-flat storage keys one time, non-destructively —
 * see that file's migration logic. Do not reintroduce trait fields
 * here.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var Persistence = Likhi.Persistence;
  var EventBus = Likhi.EventBus;

  if (!Persistence || !EventBus) {
    throw new Error(
      '[Store] Likhi.Persistence and Likhi.EventBus must be loaded before store.js. ' +
      'Check <script> tag order: event-bus.js, persistence.js, then store.js.'
    );
  }

  /**
   * Maps each state field to its localStorage key and how it should
   * be (de)serialized. This is what lets the generic Store.set()
   * remain generic while still reproducing the original app's
   * per-field storage behavior exactly:
   *   - 'raw'       plain passthrough, same as the original app's
   *                 direct localStorage.setItem(key, value) calls
   *                 for numbers/strings/boolean-as-string fields.
   *   - 'transient' never persisted (awaitingName only).
   *
   * (The 'json' kind and the `messages` entry that used it were
   * removed in Milestone 2 — see the file header comment.)
   */
  var FIELD_MAP = {
    userName:     { storageKey: 'Likhi_user_name',   kind: 'raw' },
    provider:     { storageKey: 'Likhi_provider',    kind: 'raw' },
    apiKey:       { storageKey: 'Likhi_api_key',     kind: 'raw' },
    imageApiKey:  { storageKey: 'Likhi_img_key',     kind: 'raw' },
    imageApiUrl:  { storageKey: 'Likhi_img_url',     kind: 'raw' },
    memory:       { storageKey: 'Likhi_memory',      kind: 'raw' },
    darkMode:     { storageKey: 'Likhi_dark',        kind: 'raw' },
    awaitingName: { storageKey: null,                kind: 'transient' }
  };

  /**
   * Reproduces the original loadState() exactly, including its
   * specific edge-case comparisons, sourced through Persistence
   * instead of raw localStorage calls:
   *   - memory:   `!== 'false'` (so a missing/null key defaults true,
   *               matching the original's exact three-state read)
   *   - darkMode: three-way — unset key falls back to OS preference;
   *               a set key is compared with `=== 'true'`
   */
  function loadInitialState() {
    var prefersDark = false;
    try {
      prefersDark = !!(global.matchMedia &&
        global.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (_) {
      prefersDark = false;
    }

    var storedDark = Persistence.get(FIELD_MAP.darkMode.storageKey);

    return {
      userName:    Persistence.get(FIELD_MAP.userName.storageKey)    || '',
      provider:    Persistence.get(FIELD_MAP.provider.storageKey)    || 'openai',
      apiKey:      Persistence.get(FIELD_MAP.apiKey.storageKey)      || '',
      imageApiKey: Persistence.get(FIELD_MAP.imageApiKey.storageKey) || '',
      imageApiUrl: Persistence.get(FIELD_MAP.imageApiUrl.storageKey) || '',
      memory:      Persistence.get(FIELD_MAP.memory.storageKey) !== 'false',
      darkMode:    storedDark ? storedDark === 'true' : prefersDark,
      awaitingName: false
    };
  }

  var state = loadInitialState();

  function persistField(key, value) {
    var meta = FIELD_MAP[key];
    if (!meta || meta.kind === 'transient') return;
    Persistence.set(meta.storageKey, value);
  }

  var Store = {
    /**
     * Returns the current state object. Callers should treat this as
     * read-only; all mutation must go through the methods below.
     * @returns {object}
     */
    getState: function () {
      return state;
    },

    /**
     * Generic setter for any non-message, non-transient field.
     * Persists according to FIELD_MAP unless persist:false is passed
     * (mirrors the original app's `applyTheme(dark, save)` pattern,
     * where the in-memory value always updates but the storage write
     * is sometimes skipped).
     * @param {string} key
     * @param {*} value
     * @param {{persist?: boolean}} [options]
     */
    set: function (key, value, options) {
      var opts = options || {};
      var persist = opts.persist !== undefined ? opts.persist : true;
      state[key] = value;
      if (persist) persistField(key, value);
      EventBus.publish('store:change', { key: key, value: value, state: state });
      return state;
    },

    /**
     * Dedicated setter for the transient "awaiting name" flag.
     * Deliberately separate from set() so this field can never be
     * accidentally persisted through the generic path.
     * @param {boolean} value
     */
    setAwaitingName: function (value) {
      state.awaitingName = value;
      EventBus.publish('store:change', { key: 'awaitingName', value: value, state: state });
      return state;
    }
  };

  Likhi.Store = Store;

})(window);
