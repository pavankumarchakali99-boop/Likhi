/**
 * providers/media/generic-field-adapter/generic-field-adapter.js
 *
 * Recognizes a generic top-level `data.image` field. This was the
 * FIRST field checked in the original app's fallback chain
 * (`data.image || ...`), so this adapter must be registered first.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var MediaProviders = Likhi.Providers && Likhi.Providers.Media;
  if (!MediaProviders) {
    throw new Error('[GenericFieldAdapter] Likhi.Providers.Media must be loaded before generic-field-adapter.js');
  }

  MediaProviders.registerShape({
    name: 'generic-image-field',
    extract: function (data) {
      return data && data.image;
    }
  });

})(window);
