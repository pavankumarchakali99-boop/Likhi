/**
 * engines/world/world.js
 *
 * Milestone 3 — World Engine (minimal scaffold).
 * Milestone 5 — expanded: location lookup, global facts, and
 * multi-character/multi-location presence.
 * Milestone 8 — persistence added, namespaced per worldId; the
 * multi-world API shape below is unchanged (it was already
 * `worldId`-parameterized since Milestone 3 — this milestone proves
 * and hardens that, it doesn't introduce it).
 *
 * Per the frozen architecture, World Engine owns SHARED, objective
 * simulation state: locations, presence, and global/ambient facts —
 * never a character's personality (that's Character Engine) or
 * conversation history (that's Memory Engine).
 *
 * IMPORTANT — SCOPE: still not consumed by Prompt Engine or the
 * Orchestrator. Wiring location-aware content into prompts remains
 * deferred until a future milestone actually needs it.
 *
 * MILESTONE 8 UPDATE — PERSISTENCE: each world is now persisted under
 * its own namespaced key (`Likhi_world:<worldId>`) via the existing,
 * unmodified Persistence Engine — Persistence Engine needed NO
 * interface change for this, since it was always a generic key/value
 * wrapper; World Engine is simply a new consumer of it, the same way
 * Memory Engine and Character Engine already were. Every mutating
 * method (addLocation, setPresence, setFact, removeFact) now persists
 * that world's full state after the change.
 *
 * BACKWARD COMPATIBILITY: no prior milestone ever persisted World
 * Engine data, so there is no legacy key to migrate from. An existing
 * user's first load under this milestone finds no `Likhi_world:*` key,
 * falls back to the same hardcoded seed as every prior milestone, and
 * behaves identically — persistence only affects what happens to
 * state changes made AFTER that (including the seed itself, so a
 * second load reads the persisted copy instead of re-deriving it,
 * which is behaviorally identical either way since the seed is
 * idempotent).
 *
 * Depends on Likhi.Persistence (Milestone 1) — new dependency this
 * milestone.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var Persistence = Likhi.Persistence;
  if (!Persistence) {
    throw new Error('[WorldEngine] Likhi.Persistence must be loaded before world.js');
  }

  var worlds = {};

  function storageKey(worldId) {
    return 'Likhi_world:' + worldId;
  }

  function persistWorld(worldId) {
    var world = worlds[worldId];
    if (!world) return;
    Persistence.setJSON(storageKey(worldId), {
  locations: world.locations,
  presence: world.presence,
  activity: world.activity,
  objects: world.objects,
  facts: world.facts,
  intentions: world.intentions,
  goals: world.goals
});
  }

  function loadWorldFromStorage(worldId) {
    var stored = Persistence.getJSON(storageKey(worldId), null);
    if (!stored || typeof stored !== 'object') return null;
    return {
  id: worldId,
  locations: stored.locations || {},
  presence: stored.presence || {},
  activity: stored.activity || {},
  objects: stored.objects || {},
  facts: stored.facts || {},
  intentions: stored.intentions || {},
  goals: stored.goals || {}
};
  }

  /**
   * Returns the in-memory world if already cached; otherwise attempts
   * to lazy-load it from persistence (without creating a new one if
   * nothing is found). This is what every READ method below uses —
   * critical for correctness: a world persisted in a previous session
   * must be visible to reads even before anything in the current
   * session has called a WRITE method (ensureWorld/createWorld) for
   * it.
   */
  function tryLoadWorld(worldId) {
    if (worlds[worldId]) return worlds[worldId];
    var loaded = loadWorldFromStorage(worldId);
    if (loaded) {
      worlds[worldId] = loaded;
    }
    return worlds[worldId] || null;
  }

  function ensureWorld(worldId) {
    var world = tryLoadWorld(worldId);
    if (!world) {
      world = { id: worldId, locations:{},

    presence:{},

    activity:{},

    objects:{},

    facts:{},

    intentions:{},

    goals:{} };
      worlds[worldId] = world;
    }
    return world;
  }

  var WorldEngine = {
    /**
     * Creates a world if it doesn't already exist (idempotent) —
     * loading its persisted state first, if any exists.
     * @param {string} worldId
     * @returns {object}
     */
    createWorld: function (worldId) {
      return ensureWorld(worldId);
    },

    /**
     * @param {string} worldId
     * @returns {?object} the world, or null if it doesn't exist
     */
    getWorld: function (worldId) {
      return tryLoadWorld(worldId);
    },

    /**
     * Adds (or overwrites) a location definition within a world.
     * Persists the world afterward.
     * @param {string} worldId
     * @param {string} locationId
     * @param {object} [definition]
     * @returns {object} the stored location record
     */
    addLocation: function (worldId, locationId, definition) {
      var world = ensureWorld(worldId);
      var record = { id: locationId };
      if (definition) {
        for (var k in definition) { record[k] = definition[k]; }
      }
      world.locations[locationId] = record;
      persistWorld(worldId);
      return record;
    },

    /**
     * @param {string} worldId
     * @param {string} locationId
     * @returns {?object} the location record, or null if it doesn't exist
     */
    getLocation: function (worldId, locationId) {
      var world = tryLoadWorld(worldId);
      if (!world) return null;
      return world.locations[locationId] || null;
    },

    /**
     * @param {string} worldId
     * @returns {string[]} location ids in this world
     */
    listLocations: function (worldId) {
      var world = tryLoadWorld(worldId);
      return world ? Object.keys(world.locations) : [];
    },

    /**
     * Sets which location a character is currently present in.
     * Persists the world afterward.
     * @param {string} worldId
     * @param {string} characterId
     * @param {string} locationId
     */
    setPresence: function (worldId, characterId, locationId) {
      var world = ensureWorld(worldId);
      world.presence[characterId] = locationId;
      persistWorld(worldId);
      return world.presence;
    },
    setActivity: function (worldId, characterId, activity) {
  var world = ensureWorld(worldId);
  world.activity[characterId] = activity;
  persistWorld(worldId);
  return world.activity;
},

setObject: function (worldId, objectId, value) {
  var world = ensureWorld(worldId);
  world.objects[objectId] = value;
  persistWorld(worldId);
  return world.objects;
},

setIntention: function (worldId, characterId, intentions) {
  var world = ensureWorld(worldId);
  world.intentions[characterId] = intentions;
  persistWorld(worldId);
  return world.intentions;
},

setGoal: function (worldId, characterId, goals) {
  var world = ensureWorld(worldId);
  world.goals[characterId] = goals;
  persistWorld(worldId);
  return world.goals;
},

    applyUpdate: function (worldId, update) {
  if (!update) return;

  if (update.world) {

    if (update.world.presence) {
      for (var characterId in update.world.presence) {
        this.setPresence(worldId, characterId, update.world.presence[characterId]);
      }
    }

    if (update.world.activity) {
      for (var characterId in update.world.activity) {
        this.setActivity(worldId, characterId, update.world.activity[characterId]);
      }
    }

    if (update.world.facts) {
      for (var key in update.world.facts) {
        this.setFact(worldId, key, update.world.facts[key]);
      }
    }

    if (update.world.objects) {
      for (var objectId in update.world.objects) {
        this.setObject(worldId, objectId, update.world.objects[objectId]);
      }
    }
  }

  if (update.intentions) {
    for (var characterId in update.intentions) {
      this.setIntention(worldId, characterId, update.intentions[characterId]);
    }
  }

  if (update.goals) {
    for (var characterId in update.goals) {
      this.setGoal(worldId, characterId, update.goals[characterId]);
    }
  }
},
    

    /**
     * @param {string} worldId
     * @param {string} characterId
     * @returns {?string} the locationId the character is present in, or null
     */
    getPresence: function (worldId, characterId) {
      var world = tryLoadWorld(worldId);
      return world ? (world.presence[characterId] || null) : null;
    },

    /**
     * @param {string} worldId
     * @param {string} locationId
     * @returns {string[]} character ids currently present at this location
     */
    listPresentAt: function (worldId, locationId) {
      var world = tryLoadWorld(worldId);
      if (!world) return [];
      var result = [];
      for (var characterId in world.presence) {
        if (world.presence[characterId] === locationId) {
          result.push(characterId);
        }
      }
      return result;
    },

    /**
     * Sets a global/ambient fact for a world (e.g. time of day,
     * weather, an ongoing event). Facts are plain key/value — this
     * engine doesn't interpret their meaning, only stores them.
     * Persists the world afterward.
     * @param {string} worldId
     * @param {string} key
     * @param {*} value
     */
    setFact: function (worldId, key, value) {
      var world = ensureWorld(worldId);
      world.facts[key] = value;
      persistWorld(worldId);
      return world.facts;
    },

    /**
     * @param {string} worldId
     * @param {string} key
     * @returns {*} the fact's value, or undefined if unset
     */
    getFact: function (worldId, key) {
      var world = tryLoadWorld(worldId);
      return world ? world.facts[key] : undefined;
    },

    /**
     * @param {string} worldId
     * @returns {string[]} fact keys set for this world
     */
    listFacts: function (worldId) {
      var world = tryLoadWorld(worldId);
      return world ? Object.keys(world.facts) : [];
    },

    /**
     * Persists the world afterward.
     * @param {string} worldId
     * @param {string} key
     */
    removeFact: function (worldId, key) {
      var world = tryLoadWorld(worldId);
      if (world) {
        delete world.facts[key];
        persistWorld(worldId);
      }
    },

    /**
     * @returns {string[]} every worldId currently known in memory
     *   (i.e. created or loaded this session)
     */
    listWorlds: function () {
      return Object.keys(worlds);
    }
  };

  Likhi.Engines = Likhi.Engines || {};
  Likhi.Engines.World = WorldEngine;

  /* MILESTONE 8 FIX: the seed below must only run on the very first
     load. Running it unconditionally on every load (as it did before
     persistence existed, when it was harmlessly idempotent) would now
     silently overwrite any later runtime mutation to a seeded field
     — e.g. if something ever moves Likhi to a new location, the next
     reload would snap her back to 'default-location', clobbering
     real state with stale seed data. Checking for an existing
     persisted key first (the same "has this ever run before" check
     Memory/Character Engine's legacy migrations use, just for an
     initial seed rather than a migration) avoids that. */
  if (Persistence.get(storageKey('default-world')) === null) {
    /* First-ever load: seed the single default world/location/presence
       for the current single-character scope (Milestone 3), plus the
       additional location/presence/fact proving multi-character
       support (Milestone 5). */
    WorldEngine.createWorld('default-world');
    WorldEngine.addLocation('default-world', 'default-location', { name: 'Default Location' });
    WorldEngine.setPresence('default-world', 'likhi', 'default-location');
    WorldEngine.addLocation('default-world', 'cafe', { name: 'The Corner Cafe' });
    WorldEngine.setPresence('default-world', 'aarav', 'cafe');
    WorldEngine.setPresence('default-world', 'ananya', 'cafe');
    WorldEngine.setFact('default-world', 'weather', 'sunny');
  } else {
    /* Already seeded in a previous session — just bring it into the
       in-memory cache as-is, whatever it now contains. */
    WorldEngine.createWorld('default-world');
  }

})(window);
