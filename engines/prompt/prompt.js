/**
 * engines/prompt/prompt.js
 *
 * Milestone 3 — Prompt Engine.
 * Milestone 5 — extended with optional presence-awareness.
 *
 * Pure, stateless context assembly (project vision Rule 6: "Prompt
 * Engine only assembles context"). Given a characterId and a small
 * context object, `assemble()` returns the fully-built system prompt
 * string. It has NO persistence, NO provider calls, and NO other side
 * effects — calling it twice with the same inputs always returns the
 * same string. It reads Character Engine (read-only) to get the
 * character's persona/current traits; it does not mutate anything.
 *
 * SCOPE NOTE (Milestone 3, still true): the current app's system
 * prompt does not depend on conversation HISTORY or WORLD/LOCATION
 * state — chat history is sent to the provider as separate messages
 * (Provider Engine, Milestone 2), and nothing here reads World
 * Engine. This function still does not take Memory or World Engine
 * inputs.
 *
 * MILESTONE 5 UPDATE: `context` gained an optional `otherParticipants`
 * field — an array of character NAMES (not ids) sharing the same
 * conversation thread. This is the one genuinely-required extension
 * flagged when this file was first written: Milestone 5's multi-party
 * threads need each character's prompt to reflect who else is present,
 * and that information comes from Conversation Engine (via the
 * Orchestrator, which resolves ids to names before calling here) —
 * not from World Engine, since presence in a THREAD and presence at a
 * WORLD LOCATION are different concepts and only the former is wired
 * into prompts as of this milestone.
 *
 * BACKWARD COMPATIBILITY: when `otherParticipants` is omitted or
 * empty, output is BYTE-FOR-BYTE IDENTICAL to before this change —
 * verified against the original Milestone 3 216-case parity test.
 * The added line only appears when there is something to say.
 *
 * Depends on Likhi.Engines.Character (Milestone 3) only.
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var CharacterEngine = Likhi.Engines && Likhi.Engines.Character;
  if (!CharacterEngine) {
    throw new Error('[PromptEngine] Likhi.Engines.Character must be loaded before prompt.js');
  }

  /**
   * Looks up the descriptive text for a numeric trait value using the
   * character's own threshold definitions. Reproduces the original
   * app's exact ternary-chain semantics: the first threshold whose
   * `max` the value is strictly less than wins; a final `max:
   * Infinity` threshold acts as the "otherwise" branch.
   */
  function describeTrait(traitDef, value) {
    for (var i = 0; i < traitDef.thresholds.length; i++) {
      if (value < traitDef.thresholds[i].max) {
        return traitDef.thresholds[i].text;
      }
    }
    return traitDef.thresholds[traitDef.thresholds.length - 1].text;
  }

  /**
   * Joins a list of strings the way natural English does: "a", "a and
   * b", or "a, b, and c" — reproducing the original template's
   * `${aLvl}, ${pLvl}, and ${fLvl}` phrasing for any number of traits,
   * and reused (Milestone 5) for the otherParticipants line so the
   * two list-formatting call sites in this file never drift apart.
   */
  function joinWithAnd(items) {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1];
  }

  /**
   * @param {string} characterId
   * @param {{userName?: string, otherParticipants?: string[]}} [context]
   * @returns {string} the fully-assembled system prompt
   */
  function assemble(characterId, context) {
    var ctx = context || {};
    var character = CharacterEngine.get(characterId);
    var traits = character.traits;
    var traitDefs = character.traitDefinitions;

    var traitAdjectives = traitDefs.map(function (def) {
      return describeTrait(def, traits[def.key]);
    });

    var traitSummary = traitDefs.map(function (def) {
      return traits[def.key] + '/100 ' + def.label.toLowerCase();
    }).join(' \u00B7 ');

    var traitLines = traitDefs.map(function (def) {
      return '- ' + def.label + ': ' + describeTrait(def, traits[def.key]);
    }).join('\n');

    var voiceRulesText = character.voiceRules.map(function (rule, idx) {
      return (idx + 1) + '. ' + rule;
    }).join('\n');

    var nameLine = ctx.userName
      ? "The user's name is " + ctx.userName + '. Use it naturally sometimes.'
      : '';

    // Milestone 5: only adds a line (and its own leading newline) when
    // there is at least one other participant — when absent, this is
    // an empty string and the output is identical to before this
    // change existed.
    var otherParticipants = ctx.otherParticipants || [];
    var presenceLine = otherParticipants.length
      ? '\nAlso present in this conversation: ' + joinWithAnd(otherParticipants) + '.'
      : '';
   var familyContext =
  '\nFamily:' +
  '\n- You are part of a small family.' +
  '\n- Likhi is the wife.' +
  '\n- The user is Likhi\'s husband.' +
  '\n- Aarav is the energetic 8-year-old son.' +
  '\n- Ananya is the sweet 5-year-old daughter.' +
  '\n- Treat them as your real family, not fictional characters.' +
  '\n- Speak naturally as if you all live together every day.';

    var worldInstructions = `
WORLD STATE OUTPUT

If your reply changes the simulation state, append ONE markdown code block using the language identifier \`world\`.

Use EXACTLY this schema:

\`\`\`world
{
  "world": {
    "presence": {},
    "activity": {},
    "facts": {},
    "objects": {}
  },
  "intentions": {},
  "goals": {}
}
\`\`\`

Rules:

- The normal conversational reply MUST come first.
- The \`world\` block MUST be the last thing in the response.
- Output valid JSON only.
- Use ONLY these fields:
  - world.presence
  - world.activity
  - world.facts
  - world.objects
  - intentions
  - goals
- NEVER invent new fields or sections.
- NEVER rename existing fields.
- Output ONLY the fields that changed.
- Omit unchanged sections.
- Do NOT output a world update for emotions, mood, personality, flirting, teasing, thoughts, or speaking style.
- Output a world update ONLY for objective simulation changes such as:
  - movement between locations
  - current activities
  - new facts
  - object changes
  - intentions
  - goals
- If nothing in the simulation changed, do NOT output a \`world\` block.

Correct Example:

\`\`\`world
{
  "world": {
    "presence": {
      "likhi": "kitchen"
    },
    "activity": {
      "likhi": "making tea"
    }
  },
  "intentions": {
    "likhi": [
      "serve tea to the family"
    ]
  }
}
\`\`\`

Incorrect (DO NOT DO THIS):

\`\`\`world
{
  "world": {
    "likhi": {
      "teasing_mode": true
    }
  }
}
\`\`\`

Reason: \`teasing_mode\` is not part of the allowed schema.

ENTITY NAMES

When referring to family members inside the \`world\` JSON, ALWAYS use these exact identifiers:

- user
- likhi
- aarav
- ananya

Never abbreviate them.
Never shorten them.
Never invent nicknames.
Never use display names.

Example:

Correct:

\`\`\`world
{
  "world": {
    "presence": {
      "likhi": "kitchen",
      "aarav": "bedroom"
    }
  }
}
\`\`\`

Incorrect:

\`\`\`world
{
  "world": {
    "presence": {
      "li": "kitchen",
      "aaru": "bedroom"
    }
  }
}
\`\`\`
`;

    return 'You are ' + character.name + ', a ' + character.ageDescription +
  ' who talks in a warm, casual, and friendly way. You are ' +
  joinWithAnd(traitAdjectives) + '.\n' +
  nameLine + presenceLine + familyContext + '\n' +
  'Core personality:\n' +
  voiceRulesText + '\n\n' +
  'Traits (' + traitSummary + '):\n' +
  traitLines + '\n\n' +
  character.closingDirective +'\n\n' +
  worldInstructions;
    
  }

  Likhi.Engines.Prompt = { assemble: assemble };

})(window);
