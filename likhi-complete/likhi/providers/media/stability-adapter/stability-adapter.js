/**
 * providers/media/stability-adapter/stability-adapter.js
 *
 * Recognizes Stability-AI-style response shapes:
 * `data.artifacts[0].base64`. This was the FOURTH field checked in
 * the original app's fallback chain
 * (`... || data.artifacts?.[0]?.base64 || ...`), so this adapter must
 * be registered third (after the OpenAI adapter, before the generic
 * output adapter).
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var MediaProviders = Likhi.Providers && Likhi.Providers.Media;
  if (!MediaProviders) {
    throw new Error('[StabilityAdapter] Likhi.Providers.Media must be loaded before stability-adapter.js');
  }

  MediaProviders.registerShape({
    name: 'stability-artifacts',
    extract: function (data) {
      return data && data.artifacts && data.artifacts[0] && data.artifacts[0].base64;
    }
  });

})(window);
