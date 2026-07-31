/**
 * providers/chat/gemini-adapter.js
 *
 * Milestone 2 — Provider Adapters (Chat).
 *
 * Gemini adapter, migrated verbatim (role remapping, systemInstruction
 * placement, endpoint URL construction, response parsing, error
 * extraction) from the original app's `else { ... }` (Gemini) branch
 * inside callChatAPI(). Registered under the id "gemini" to preserve
 * the existing stored provider value exactly (see
 * chat-provider-interface.js).
 *
 * Depends on Likhi.Providers.Chat (the interface/registry) being
 * loaded first.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var ChatProviders = Likhi.Providers && Likhi.Providers.Chat;
  if (!ChatProviders) {
    throw new Error('[GeminiAdapter] Likhi.Providers.Chat must be loaded before gemini-adapter.js');
  }

  var GeminiAdapter = {
    send: async function (nonSystemMessages, systemPrompt, apiKey) {
      const gemMsgs = nonSystemMessages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: gemMsgs,
            systemInstruction: { parts: [{ text: systemPrompt }] },
            generationConfig: { temperature: 0.9, maxOutputTokens: 600 }
          })
        }
      );

      if (!res.ok) {
        let m = `HTTP ${res.status}`;
        try { m = (await res.json()).error?.message || m; } catch (_) {}
        throw new Error(m);
      }

      const data = await res.json();
      if (!data.candidates?.[0]) throw new Error('No response from Gemini');
      const text = (data.candidates[0].content?.parts || []).map(p => p.text || '').join('');
      if (!text) throw new Error('Empty response from Gemini');
      return text.replace(/—/g, ',');
    }
  };

  ChatProviders.register('gemini', GeminiAdapter);

})(window);
