/**
 * providers/chat/groq-adapter.js
 *
 * Milestone 2 — Provider Adapters (Chat).
 *
 * Groq adapter, migrated verbatim (request shape, headers, model name,
 * response parsing, error extraction) from the original app's
 * `if (S.provider === 'openai') { ... }` branch inside callChatAPI().
 * Registered under the id "openai" to preserve the existing stored
 * provider value exactly (see chat-provider-interface.js).
 *
 * Depends on Likhi.Providers.Chat (the interface/registry) being
 * loaded first.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var ChatProviders = Likhi.Providers && Likhi.Providers.Chat;
  if (!ChatProviders) {
    throw new Error('[GroqAdapter] Likhi.Providers.Chat must be loaded before groq-adapter.js');
  }

  var GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

  var GroqAdapter = {
    send: async function (nonSystemMessages, systemPrompt, apiKey) {
      var msgs = [{ role: 'system', content: systemPrompt }].concat(nonSystemMessages);

      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'groq/compound',
          messages: msgs,
          temperature: 1.0,
          max_tokens: 800,
          frequency_penalty: 0.7,
          presence_penalty: 0.6
        })
      });

      if (!res.ok) {
        let m = `HTTP ${res.status}`;
        try { m = (await res.json()).error?.message || m; } catch (_) {}
        throw new Error(m);
      }

      const data = await res.json();
      return (data.choices?.[0]?.message?.content || '').replace(/—/g, ',');
    }
  };

  ChatProviders.register('openai', GroqAdapter);

})(window);
