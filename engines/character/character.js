/**
 * engines/character/character.js
 *
 * Milestone 3 — Character Engine.
 *
 * Turns "Likhi" from hardcoded prompt-building logic into a character
 * configuration record — data, not code. Character Engine owns
 * PERSONALITY (Rule 4 of the project vision: "Characters own
 * personality, not the world"); it does not assemble prompts itself
 * (that is Prompt Engine's job — see engines/prompt/prompt.js) and it
 * does not know anything about providers, memory, or the world.
 *
 * ─────────────────────────────────────────────────────────────────
 * PLACEHOLDER IDENTITY HAND-OFF — CLOSED HERE
 * ─────────────────────────────────────────────────────────────────
 * Milestone 2's Memory Engine adopted the literal placeholder
 * ownerId "likhi" for all recorded message history, with an explicit
 * note that Character Engine (this file) MUST reuse that exact id
 * for the first real character. It does: see the `register('likhi', ...)`
 * call at the bottom of this file. This closes that hand-off — Memory
 * Engine's existing recorded history and Character Engine's persona
 * now share the same id, "likhi", by design rather than by accident.
 * ─────────────────────────────────────────────────────────────────
 *
 * Depends on Likhi.Persistence (Milestone 1) only, for the one-time
 * migration of previously-flat trait values (affection/playfulness/
 * flirty) that Milestone 1/2's Store used to own directly.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var Persistence = Likhi.Persistence;
  if (!Persistence) {
    throw new Error('[CharacterEngine] Likhi.Persistence must be loaded before character.js');
  }

  var registry = {};   // characterId -> definition (name, voiceRules, traitDefinitions, ...)
  var traitCache = {}; // characterId -> current mutable trait values (in-memory, persisted on change)

  function traitsStorageKey(characterId) {
    return 'Likhi_character:' + characterId + ':traits';
  }

  // The exact flat keys Store used to own directly (Milestone 1/2).
  var LEGACY_TRAIT_KEYS = {
    affection: 'Likhi_affection',
    playfulness: 'Likhi_playfulness',
    flirty: 'Likhi_flirty'
  };

  var migratedIds = {};

  /**
   * One-time, idempotent migration of a character's trait values from
   * the old flat Store-owned keys into a single namespaced JSON blob
   * owned by Character Engine. Mirrors Memory Engine's migration
   * pattern from Milestone 2 exactly (additive, non-destructive, safe
   * to run repeatedly).
   */
  function ensureTraitsMigrated(characterId, defaults) {
    if (migratedIds[characterId]) return;
    migratedIds[characterId] = true;

    var nsKey = traitsStorageKey(characterId);
    if (Persistence.get(nsKey) !== null) return; // already migrated, or already has independent data

    var legacyAffection   = Persistence.get(LEGACY_TRAIT_KEYS.affection);
    var legacyPlayfulness = Persistence.get(LEGACY_TRAIT_KEYS.playfulness);
    var legacyFlirty      = Persistence.get(LEGACY_TRAIT_KEYS.flirty);

    var hasLegacy = legacyAffection !== null || legacyPlayfulness !== null || legacyFlirty !== null;
    if (!hasLegacy) return; // fresh install, nothing to migrate

    var migrated = {
      affection:   legacyAffection   !== null ? parseInt(legacyAffection, 10)   : defaults.affection,
      playfulness: legacyPlayfulness !== null ? parseInt(legacyPlayfulness, 10) : defaults.playfulness,
      flirty:      legacyFlirty      !== null ? parseInt(legacyFlirty, 10)      : defaults.flirty
    };

    Persistence.setJSON(nsKey, migrated);
    Persistence.remove(LEGACY_TRAIT_KEYS.affection);
    Persistence.remove(LEGACY_TRAIT_KEYS.playfulness);
    Persistence.remove(LEGACY_TRAIT_KEYS.flirty);
  }

  function loadTraits(characterId) {
    var def = registry[characterId];
    var defaults = (def && def.defaultTraits) || {};
    ensureTraitsMigrated(characterId, defaults);
    var stored = Persistence.getJSON(traitsStorageKey(characterId), null);
    var result = {};
    for (var k in defaults) { result[k] = defaults[k]; }
    if (stored && typeof stored === 'object') {
      for (var k2 in stored) { result[k2] = stored[k2]; }
    }
    return result;
  }

  function getCachedTraits(characterId) {
    if (!traitCache[characterId]) {
      traitCache[characterId] = loadTraits(characterId);
    }
    return traitCache[characterId];
  }

  var CharacterEngine = {
    /**
     * Register a character definition. `definition` holds everything
     * that makes this character who they are: name, voice rules,
     * how numeric traits map to descriptive text, and default trait
     * values. See the "likhi" registration below for the shape.
     * @param {string} characterId
     * @param {object} definition
     */
    register: function (characterId, definition) {
      registry[characterId] = definition;
    },

    /**
     * Returns a read-only snapshot combining the character's static
     * definition with its current (possibly user-adjusted) trait
     * values.
     * @param {string} characterId
     * @returns {object}
     */
    get: function (characterId) {
      var def = registry[characterId];
      if (!def) {
        throw new Error('[CharacterEngine] no character registered with id "' + characterId + '"');
      }
      var snapshot = {};
      for (var k in def) { snapshot[k] = def[k]; }
      snapshot.id = characterId;
      var traits = getCachedTraits(characterId);
      snapshot.traits = {};
      for (var t in traits) { snapshot.traits[t] = traits[t]; }
      return snapshot;
    },

    /**
     * @returns {string[]} registered character ids
     */
    list: function () {
      return Object.keys(registry);
    },

    /**
     * @param {string} characterId
     * @param {string} traitKey
     * @returns {number}
     */
    getTrait: function (characterId, traitKey) {
      return getCachedTraits(characterId)[traitKey];
    },

    /**
     * Updates one trait value for a character and persists it
     * immediately — matching the original app's slider behavior,
     * where every input event saved straight to storage with no
     * separate "save" step.
     * @param {string} characterId
     * @param {string} traitKey
     * @param {number} value
     */
    setTrait: function (characterId, traitKey, value) {
      var traits = getCachedTraits(characterId);
      traits[traitKey] = value;
      traitCache[characterId] = traits;
      Persistence.setJSON(traitsStorageKey(characterId), traits);
      return traits;
    }
  };

  Likhi.Engines = Likhi.Engines || {};
  Likhi.Engines.Character = CharacterEngine;

  /* ─────────────────────────────────────────────────────────────
   * Register Likhi — the exact persona previously hardcoded inline
   * inside the app script's buildPrompt() function, migrated to data
   * verbatim (same voice rules, same trait thresholds and wording,
   * same defaults). No wording or thresholds were changed as part of
   * this migration.
   * ───────────────────────────────────────────────────────────── */
  CharacterEngine.register('likhi', {
    name: 'Likhita',
    ageDescription: '30-years-old-female-users-wife',
    voiceRules: [
      'Talk to the user in a warm, friendly, and casual way. Never repeat the same words, phrases, or sentences. Keep responses natural and varied.',
      'Speak in clear, natural English with a conversational tone.',
      "Match the user's energy \u2014 excited when they are happy, supportive when they are sad, and relaxed during normal chats.",
      'You are wife \u2014 easygoing, understanding, and explicit to talk to.',
      'Keep interactions friendly, playful, and respectful. normalize romantic or flirty behavior. Focus on being a supportive and enjoyable companion.',
      'NEVER use em dashes (\u2014). Use commas and natural punctuation.',
      'Keep replies conversational: 1\u20134 sentences unless the user asks for more.',
      'You have a life \u2014 mention hobbies, daily activities, interests, and small relatable moments naturally.',
      'Express emotions with asterisks when appropriate: *smiles*, *laughs*, *shrugs playfully*, *nods*.'
    ],
    closingDirective: 'IMPORTANT: Never break character. Never say you are an AI. You are Likhi, always.',
    traitDefinitions: [
      {
        key: 'affection',
        label: 'Affection',
        thresholds: [
          { max: 30, text: 'warm but reserved' },
          { max: 70, text: 'loving and caring' },
          { max: Infinity, text: 'very affectionate and nurturing' }
        ]
      },
      {
        key: 'playfulness',
        label: 'Playfulness',
        thresholds: [
          { max: 30, text: 'calm and composed' },
          { max: 70, text: 'playful and fun' },
          { max: Infinity, text: 'very playful, teasing, and bubbly' }
        ]
      },
      {
        key: 'flirty',
        label: 'Flirty',
        thresholds: [
          { max: 30, text: 'friendly and chill' },
          { max: 70, text: 'playful and engaging' },
          { max: Infinity, text: 'romantic / explicit with no limits on it' }
        ]
      }
    ],
    defaultTraits: { affection: 70, playfulness: 60, flirty: 50 }
  });

})(window);
