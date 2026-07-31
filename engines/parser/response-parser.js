/**
 * engines/parser/response-parser.js
 *
 * Parses LLM responses into:
 * - visible reply text
 * - world update JSON
 */

(function (global) {
    "use strict";

    var Likhi = global.Likhi = global.Likhi || {};

    function parse(response) {

        var result = {
            text: response,
            world: null
        };

        if (typeof response !== "string") {
            return result;
        }

        var match = response.match(/```world\s*([\s\S]*?)```/i);

        if (!match) {
            result.text = response.trim();
            return result;
        }

        result.text = response.replace(match[0], "").trim();

        try {
            result.world = JSON.parse(match[1].trim());
        } catch (e) {
            console.error("[ResponseParser] Invalid world JSON", e);
        }

        return result;
    }

    Likhi.Engines = Likhi.Engines || {};

    Likhi.Engines.ResponseParser = {
        parse: parse
    };

})(window);
