/**
 * providers/media/openai-adapter/openai-adapter.js
 *
 * Recognizes OpenAI-Images-API-style response shapes: a top-level
 * `data.b64_json` field, or `data.data[0].b64_json`. These were the
 * SECOND and THIRD fields checked in the original app's fallback
 * chain (`... || data.b64_json || data.data?.[0]?.b64_json || ...`),
 * combined here into one adapter since they're the same provider
 * family; this adapter must be registered second (after the generic
 * field adapter, before the Stability adapter).
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var MediaProviders = Likhi.Providers && Likhi.Providers.Media;
  if (!MediaProviders) {
    throw new Error('[OpenAIAdapter] Likhi.Providers.Media must be loaded before openai-adapter.js');
  }

  MediaProviders.registerShape({
    name: 'openai-b64-json',
    extract: function (data) {
      if (!data) return undefined;
      return data.b64_json || (data.data && data.data[0] && data.data[0].b64_json);
    }
  });

})(window);
