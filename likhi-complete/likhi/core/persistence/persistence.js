/**
 * core/persistence/persistence.js
 *
 * Milestone 1 — Foundation Infrastructure.
 *
 * Thin wrapper around localStorage. This is a leaf module: no
 * dependency on EventBus, Store, or the app. It does not know what
 * the data it stores means — only how to read/write it.
 *
 * IMPORTANT — serialization parity with the pre-Milestone-1 app:
 * The original app called `localStorage.setItem(key, value)` directly
 * for plain values (numbers, strings, booleans-as-strings), which
 * relies on JS's automatic string coercion (e.g. 70 -> "70").
 * `set()` below preserves that exact behavior via raw pass-through.
 * Only the messages array was ever JSON-serialized in the original
 * app, so JSON handling is isolated in getJSON/setJSON and must never
 * be used for the plain scalar fields (affection, memory flag, dark
 * mode flag, etc.) — conflating the two would change how those values
 * round-trip through storage and break reads like parseInt() or the
 * `!== 'false'` / `=== 'true'` string comparisons the app relies on.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};

  var Persistence = {
    /**
     * Raw string read. Returns null if the key does not exist or on
     * error — same as the native localStorage.getItem contract.
     * @param {string} key
     * @returns {?string}
     */
    get: function (key) {
      try {
        return global.localStorage.getItem(key);
      } catch (err) {
        console.error('[Persistence] get failed for "' + key + '":', err);
        return null;
      }
    },

    /**
     * Raw pass-through write. `value` is written exactly as
     * localStorage.setItem would coerce it (String(value)).
     * @param {string} key
     * @param {*} value
     * @returns {boolean} success
     */
    set: function (key, value) {
      try {
        global.localStorage.setItem(key, value);
        return true;
      } catch (err) {
        console.error('[Persistence] set failed for "' + key + '":', err);
        return false;
      }
    },

    /**
     * Remove a key. No-op (returns true) if the key didn't exist.
     * @param {string} key
     * @returns {boolean} success
     */
    remove: function (key) {
      try {
        global.localStorage.removeItem(key);
        return true;
      } catch (err) {
        console.error('[Persistence] remove failed for "' + key + '":', err);
        return false;
      }
    },

    /**
     * JSON read. Returns `fallback` if the key is missing or the
     * stored value fails to parse.
     * @param {string} key
     * @param {*} fallback
     * @returns {*}
     */
    getJSON: function (key, fallback) {
      var raw = this.get(key);
      if (raw === null || raw === undefined) return fallback;
      try {
        return JSON.parse(raw);
      } catch (err) {
        console.error('[Persistence] getJSON parse failed for "' + key + '":', err);
        return fallback;
      }
    },

    /**
     * JSON write.
     * @param {string} key
     * @param {*} value
     * @returns {boolean} success
     */
    setJSON: function (key, value) {
      try {
        return this.set(key, JSON.stringify(value));
      } catch (err) {
        console.error('[Persistence] setJSON stringify failed for "' + key + '":', err);
        return false;
      }
    }
  };

  Likhi.Persistence = Persistence;

})(window);
