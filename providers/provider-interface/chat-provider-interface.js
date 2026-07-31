/**
 * providers/provider-interface/chat-provider-interface.js
 *
 * Milestone 2 — Provider Adapters (Chat).
 *
 * Defines the shared contract every chat provider adapter must
 * implement, plus a small registry so the app script can look up an
 * adapter by the existing provider id strings ("openai", "gemini")
 * instead of branching on them directly.
 *
 * IMPORTANT (backward compatibility): the provider id strings used
 * here are the SAME strings already stored under the `Likhi_provider`
 * localStorage key by Milestone 1's Store. They must never change,
 * or existing users' saved provider selection would silently stop
 * resolving to an adapter.
 *
 * Adapter contract:
 *   adapter.send(nonSystemMessages, systemPrompt, apiKey) -> Promise<string>
 *
 *   - nonSystemMessages: ordered array of { role: 'user'|'assistant', content }
 *     representing prior context (if any) followed by the new user
 *     message. Does NOT include a system-role entry — each adapter is
 *     responsible for placing systemPrompt correctly per its own
 *     provider's expected request shape (this differs between
 *     providers today: Groq wants it as a system-role message inside
 *     the array, Gemini wants it as a separate systemInstruction field).
 *   - systemPrompt: the fully-assembled system prompt string.
 *   - apiKey: the user's API key for this provider.
 *   - Returns the reply text (already run through the app's existing
 *     em-dash cleanup), or throws an Error whose message matches the
 *     provider's existing error-extraction behavior.
 *
 * Depends on nothing else in Likhi.* — this file only needs to load
 * before the adapters that call `register()` and before the app
 * script that calls `send()`.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  Likhi.Providers = Likhi.Providers || {};

  var registry = {};

  var ChatProviders = {
    /**
     * Register an adapter under a provider id.
     * @param {string} providerId
     * @param {{send: function}} adapter
     */
    register: function (providerId, adapter) {
      if (!adapter || typeof adapter.send !== 'function') {
        throw new Error(
          '[ChatProviders] adapter for "' + providerId + '" must implement send(nonSystemMessages, systemPrompt, apiKey)'
        );
      }
      registry[providerId] = adapter;
    },

    /**
     * Look up a registered adapter. Throws if none is registered —
     * this is a configuration/load-order error, not a runtime one,
     * so it should surface immediately rather than fail silently.
     * @param {string} providerId
     * @returns {{send: function}}
     */
    get: function (providerId) {
      var adapter = registry[providerId];
      if (!adapter) {
        throw new Error('[ChatProviders] no adapter registered for provider "' + providerId + '"');
      }
      return adapter;
    },

    /**
     * Convenience call-through: look up the adapter for `providerId`
     * and invoke it.
     * @param {string} providerId
     * @param {Array<{role:string, content:string}>} nonSystemMessages
     * @param {string} systemPrompt
     * @param {string} apiKey
     * @returns {Promise<string>}
     */
    send: function (providerId, nonSystemMessages, systemPrompt, apiKey) {
      return ChatProviders.get(providerId).send(nonSystemMessages, systemPrompt, apiKey);
    }
  };

  Likhi.Providers.Chat = ChatProviders;

})(window);
