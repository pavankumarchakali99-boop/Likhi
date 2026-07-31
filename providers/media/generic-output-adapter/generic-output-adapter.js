/**
 * providers/media/generic-output-adapter/generic-output-adapter.js
 *
 * Recognizes a generic `data.output[0]` field. This was the LAST
 * field checked in the original app's fallback chain
 * (`... || data.output?.[0]`), so this adapter must be registered
 * last.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var MediaProviders = Likhi.Providers && Likhi.Providers.Media;
  if (!MediaProviders) {
    throw new Error('[GenericOutputAdapter] Likhi.Providers.Media must be loaded before generic-output-adapter.js');
  }

  MediaProviders.registerShape({
    name: 'generic-output-array',
    extract: function (data) {
      return data && data.output && data.output[0];
    }
  });

})(window);
