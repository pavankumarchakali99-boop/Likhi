/**
 * providers/media/provider-interface/media-provider-interface.js
 *
 * Milestone 3 — Media Provider Adapters.
 *
 * Replaces the original app's response-shape guessing
 * (`data.image || data.b64_json || data.data?.[0]?.b64_json ||
 * data.artifacts?.[0]?.base64 || data.output?.[0]`) with a registry
 * of small "shape adapters," tried in registration order, each
 * responsible for recognizing one known image-provider response
 * shape. This mirrors the chat Provider Engine's adapter pattern
 * (Milestone 2), adapted to this case's difference: there is no
 * explicit provider-id selector for image generation (the user only
 * configures an endpoint URL + key), so adapters are tried in a fixed
 * order rather than looked up by id.
 *
 * IMPORTANT — registration order IS the fallback order. The four
 * shape-adapter files that register against this module must be
 * loaded in this exact sequence to reproduce the original fallback
 * chain exactly:
 *   1. generic-field-adapter  (data.image)
 *   2. openai-adapter         (data.b64_json / data.data[0].b64_json)
 *   3. stability-adapter      (data.artifacts[0].base64)
 *   4. generic-output-adapter (data.output[0])
 *
 * Depends on nothing else in Likhi.* — this file only needs to load
 * before the shape adapters that call `registerShape()` and before
 * the app script that calls `send()`.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  Likhi.Providers = Likhi.Providers || {};

  var shapeAdapters = [];

  var MediaProviders = {
    /**
     * Register a response-shape adapter. Adapters are tried in
     * registration order by `send()` below.
     * @param {{name: string, extract: function(*):(string|undefined)}} adapter
     */
    registerShape: function (adapter) {
      if (!adapter || typeof adapter.extract !== 'function') {
        throw new Error('[MediaProviders] shape adapter must implement extract(data)');
      }
      shapeAdapters.push(adapter);
    },

    /**
     * Calls the user-configured image generation endpoint and parses
     * the response. JSON responses are parsed by trying each
     * registered shape adapter in order until one returns a truthy
     * base64 string; non-JSON responses are treated as an image blob
     * directly, exactly as the original app did.
     * @param {string} imageApiUrl
     * @param {string} imageApiKey
     * @param {string} prompt
     * @returns {Promise<string>} a data: URL (JSON path) or an object
     *   URL (blob path)
     */
    send: async function (imageApiUrl, imageApiKey, prompt) {
      const res = await fetch(imageApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${imageApiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json, image/*'
        },
        body: JSON.stringify({ prompt })
      });

      if (!res.ok) {
        let d = '';
        try { d = (await res.text()).slice(0, 120); } catch (_) {}
        throw new Error(`Image API ${res.status}${d ? ': ' + d : ''}`);
      }

      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) {
        const data = await res.json();
        let b64;
        for (let i = 0; i < shapeAdapters.length; i++) {
          b64 = shapeAdapters[i].extract(data);
          if (b64) break;
        }
        if (!b64) throw new Error('No image field in API response');
        return `data:image/png;base64,${b64}`;
      } else {
        return URL.createObjectURL(await res.blob());
      }
    }
  };

  Likhi.Providers.Media = MediaProviders;

})(window);
