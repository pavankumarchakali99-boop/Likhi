/**
 * engines/intent/intent.js
 *
 * Milestone 4 — Intent Engine (Phase 7).
 *
 * Replaces the original app's inline regex-based routing
 * (`isImgRequest(msg)` checked directly inside handleSubmit's
 * if/else) with a registered, typed intent-resolution system. New
 * intent types (world actions, admin commands, autonomous triggers
 * in later milestones) can be added by registration, without editing
 * a branch here or in the Orchestrator.
 *
 * IMPORTANT: the image-request detection regexes and the prompt-
 * cleaning regexes below are migrated VERBATIM from the original
 * app's isImgRequest()/cleanImgPrompt() functions — this phase
 * relocates and formalizes that logic, it does not rewrite the
 * detection heuristic itself.
 *
 * No dependencies on any other Likhi.* module.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};

  // Ordered list of { type, test, buildPayload }. resolve() tries
  // these in registration order; the first matching test wins. If
  // none match, resolve() falls back to the default 'send_message'
  // type — this reproduces the original app's exact
  // `if (isImgRequest(msg)) { ... } else { ...chat... }` structure,
  // where "chat" was always the fallback.
  var handlers = [];

  var IntentEngine = {
    /**
     * Register an intent type. Handlers are tried in registration
     * order, so more specific intents should be registered before
     * more general ones.
     * @param {string} type
     * @param {function(string):boolean} test
     * @param {function(string):object} [buildPayload] defaults to { rawInput }
     */
    register: function (type, test, buildPayload) {
      handlers.push({ type: type, test: test, buildPayload: buildPayload });
    },

    /**
     * Resolves raw input into a typed intent. Never throws — input
     * that matches nothing registered resolves to the default
     * 'send_message' type.
     * @param {string} rawInput
     * @returns {{type: string, payload: object}}
     */
    resolve: function (rawInput) {
      for (var i = 0; i < handlers.length; i++) {
        if (handlers[i].test(rawInput)) {
          var payload = handlers[i].buildPayload
            ? handlers[i].buildPayload(rawInput)
            : { rawInput: rawInput };
          return { type: handlers[i].type, payload: payload };
        }
      }
      return { type: 'send_message', payload: { rawInput: rawInput } };
    }
  };

  Likhi.Engines = Likhi.Engines || {};
  Likhi.Engines.Intent = IntentEngine;

  /* ─────────────────────────────────────────────────────────────
   * Register the image-request intent — migrated verbatim from the
   * original app's isImgRequest()/cleanImgPrompt().
   * ───────────────────────────────────────────────────────────── */
  function isImageRequest(msg) {
    return /\b(generate|create|make|send|draw|show)\b.{0,25}\b(image|photo|picture|pic)\b/i.test(msg) ||
           /^(draw|show me (a |an )?|send me (a |an )?)(image|photo|picture|pic)/i.test(msg);
  }

  function cleanImagePrompt(msg) {
    return msg
      .replace(/\b(generate|create|make|send|show me|show)\b/gi, '')
      .replace(/\b(an? )?(image|photo|picture|pic)\s*(of|for)?\b/gi, '')
      .trim() || 'a realistic scene with natural lighting';
  }

  IntentEngine.register('image_request', isImageRequest, function (rawInput) {
    return { rawInput: rawInput, cleanedPrompt: cleanImagePrompt(rawInput) };
  });

})(window);
