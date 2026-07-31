/**
 * engines/orchestrator/orchestrator.js
 *
 * Milestone 4 — Orchestrator (Phase 8).
 * Milestone 5 — turn-order-aware character resolution + presence
 * context passed to Prompt Engine.
 * Milestone 6 — recognizes a new 'autonomous_turn' intent type, for
 * the Scheduler to use instead of human-typed 'send_message' intents.
 *
 * The thin coordination layer: given a resolved intent for a
 * conversation thread, it determines the acting character (read from
 * Conversation Engine's thread — NOT a hardcoded id passed in by the
 * caller), gathers context via Memory Engine, builds the system
 * prompt via Prompt Engine, and calls the appropriate provider (chat
 * or media).
 *
 * MILESTONE 6 CHANGE: 'send_message' (human-typed) and
 * 'autonomous_turn' (Scheduler-originated) now share one internal
 * helper, `buildChatReply()`, that does the actual prompt-assembly +
 * context-retrieval + provider-call work — the only difference
 * between the two intent types is WHAT the final "user-role" message
 * in the request is: the human's typed text for 'send_message', or a
 * fixed synthetic nudge for 'autonomous_turn' (see AUTONOMOUS_NUDGE
 * below). This avoids duplicating that logic across two paths, and
 * keeps handleIntent()'s public interface and the 'send_message' path
 * byte-for-byte unchanged from Milestone 5 — verified by rerunning
 * the Milestone 4/5 test suites unmodified against this file.
 *
 * WHY A SYNTHETIC "USER" MESSAGE FOR AUTONOMOUS TURNS: chat-completion
 * APIs (both providers this app supports) generate a reply to the
 * LAST message in the list, and expect that last message to be
 * user-role — there's no separate "just continue on your own" role.
 * Sending message history with no trailing user turn is unreliable
 * across providers, so an autonomous turn's request ends with a
 * clearly-synthetic, fixed instruction instead of fabricating a fake
 * "human" message. This is a pragmatic accommodation of the chat
 * completion API shape, not an architectural choice — if a future
 * provider adapter supports a real "continue" mechanism, this constant
 * is the only place that would need to change.
 *
 * SCOPE BOUNDARY (unchanged since Milestone 4): still does NOT touch
 * the DOM and still does NOT itself write into Memory Engine — that's
 * the caller's job. For 'send_message' the caller is index.html's
 * renderMsg()/renderImg(); for 'autonomous_turn' the caller is the
 * Scheduler (Milestone 6), which records the resulting message into
 * Memory Engine itself, exactly mirroring what the UI layer already
 * does — no new recording logic was added here.
 *   { kind: 'message', content }       — a chat reply
 *   { kind: 'image', url }             — a generated image
 *   { kind: 'image_unavailable' }      — image keys not configured
 *   { kind: 'image_failed' }           — image generation threw
 * Chat-provider errors still propagate as a rejected promise, exactly
 * as in Milestone 4/5 — this applies equally to autonomous turns, so
 * the Scheduler's caller (its own tick loop) must handle that.
 *
 * Depends on: Store (Milestone 1), Memory Engine (Milestone 2),
 * Character Engine (Milestone 3), Prompt Engine (Milestone 3),
 * Conversation Engine (Milestone 4), Chat Provider Engine (Milestone
 * 2), Media Provider Engine (Milestone 3). Must load after all of
 * these. Deliberately does NOT depend on Relationship Engine, World
 * Engine, Scheduler, or Governance — none of those are needed to
 * resolve a turn or build/send a prompt, and depending on them here
 * would be unnecessary coupling in the wrong direction (Scheduler
 * depends on Orchestrator, not the other way around).
 */
(function (global) {
  'use strict';

  var Likhi = global.Likhi = global.Likhi || {};
  var Store              = Likhi.Store;
  var MemoryEngine        = Likhi.Engines && Likhi.Engines.Memory;
  var CharacterEngine     = Likhi.Engines && Likhi.Engines.Character;
  var PromptEngine        = Likhi.Engines && Likhi.Engines.Prompt;
  var ConversationEngine  = Likhi.Engines && Likhi.Engines.Conversation;
  var ChatProviders       = Likhi.Providers && Likhi.Providers.Chat;
  var MediaProviders      = Likhi.Providers && Likhi.Providers.Media;
  var WorldEngine         = Likhi.Engines && Likhi.Engines.World;
  

  if (!Store || !MemoryEngine || !CharacterEngine || !PromptEngine || !ConversationEngine || !ChatProviders || !MediaProviders) {
    throw new Error(
      '[Orchestrator] one or more required modules failed to load — check that ' +
      'core/store/store.js, engines/memory/memory.js, engines/character/character.js, ' +
      'engines/prompt/prompt.js, engines/conversation/conversation.js, ' +
      'providers/provider-interface/chat-provider-interface.js, ' +
      'and providers/media/provider-interface/media-provider-interface.js are all loaded ' +
      'before engines/orchestrator/orchestrator.js.'
    );
  }

  // Migrated verbatim from the original app's inline image-prompt
  // template construction inside handleSubmit().
  var IMAGE_STYLE_SUFFIX = 'Style: ultra realistic, 4k, cinematic lighting, highly detailed, professional photography';

  // Milestone 6 — see the file header's "WHY A SYNTHETIC 'USER'
  // MESSAGE" note above.
  var AUTONOMOUS_NUDGE = '(No new message from the user right now. ' +
    'Continue the conversation naturally on your own, if it fits the moment.)';

  var Orchestrator = {
    /**
     * Coordinates a single turn for a conversation thread.
     * @param {string} threadId
     * @param {{type: string, payload: object}} intent from Intent
     *   Engine ('send_message' | 'image_request'), or a Scheduler-
     *   constructed intent ('autonomous_turn')
     * @returns {Promise<object>} a result descriptor (see file header)
     */
    handleIntent: async function (threadId, intent) {
      var thread = ConversationEngine.getThread(threadId);
      if (!thread || !thread.participants.length) {
        throw new Error('[Orchestrator] no active character for thread "' + threadId + '"');
      }
      // Milestone 5: honor turn order if set; falls back to the first
      // participant, which is exactly what happens for a thread whose
      // turn was never advanced (e.g. the 'default' thread) — so this
      // resolves identically to Milestone 4 there.
      var participants = resolveParticipants(threadId, thread, intent);
      console.log("Participants:", participants);

      var characterId = participants[0];
      var otherParticipantNames = thread.participants
        .filter(function (id) { return id !== characterId; })
        .map(function (id) { return CharacterEngine.get(id).name; });
      var S = Store.getState();

      if (intent.type === 'image_request') {
        return handleImageRequest(characterId, threadId, intent, S);
      }
      if (intent.type === 'autonomous_turn') {
        return buildChatReply(characterId, threadId, S, otherParticipantNames, AUTONOMOUS_NUDGE);
      }
      return handleSendMessage(characterId, threadId, intent, S, otherParticipantNames);
    }
  };
function resolveCharacter(threadId, thread) {
  return ConversationEngine.getCurrentTurn(threadId) || thread.participants[0];
}

  function resolveParticipants(threadId, thread, intent) {

    var participants = [];

    // Current speaker always participates.
    var current = resolveCharacter(threadId, thread);
    participants.push(current);

    // Temporary rule:
    // If the user's message mentions someone's name,
    // include them.

    if (intent &&
        intent.payload &&
        intent.payload.rawInput) {

        var text = intent.payload.rawInput.toLowerCase();

        thread.participants.forEach(function(id){

            if(id === current) return;

            var character = CharacterEngine.get(id);

            if(character &&
               text.includes(character.name.toLowerCase())){

                participants.push(id);

            }

        });

    }

    return participants;

}
  
  async function handleImageRequest(characterId, threadId, intent, S) {
    if (!S.imageApiKey || !S.imageApiUrl) {
      return { kind: 'image_unavailable' };
    }

    var contextText = MemoryEngine.retrieve(characterId, threadId, 'image-context')
      .map(function (m) { return m.role + ': ' + m.content; })
      .join('\n') || 'No previous context';

    var finalPrompt = 'Context:\n' + contextText + '\n\nImage: ' + intent.payload.cleanedPrompt +
      '\n\n' + IMAGE_STYLE_SUFFIX;

    try {
      var url = await MediaProviders.send(S.imageApiUrl, S.imageApiKey, finalPrompt);
      return { kind: 'image', url: url };
    } catch (imgErr) {
      // Matches the original app's local catch around generateImage():
      // image errors get a specific, generic user-facing message and
      // do NOT propagate to the caller's outer catch.
      return { kind: 'image_failed' };
    }
  }

  function handleSendMessage(characterId, threadId, intent, S, otherParticipantNames) {
    return buildChatReply(characterId, threadId, S, otherParticipantNames, intent.payload.rawInput);
  }

  /**
   * Shared by 'send_message' and 'autonomous_turn' — the only thing
   * that differs between a human-driven and an autonomous turn is
   * what the final "user-role" message in the request is.
   * Deliberately NOT wrapped in try/catch — chat-provider errors
   * propagate to the caller, exactly as the original inline
   * callChatAPI() call did in Milestone 4.
   */

function extractWorldUpdate(reply) {
  var match = reply.match(/```(?:world|json)?\s*([\s\S]*?)```/);

  if (!match) {
    return {
      reply: reply.trim(),
      worldUpdate: null
    };
  }

  var cleaned = reply.replace(match[0], '').trim();

  try {
    var worldUpdate = JSON.parse(match[1]);

    if (!worldUpdate || typeof worldUpdate !== 'object') {
      throw new Error('World update must be an object.');
    }

    return {
      reply: cleaned,
      worldUpdate: worldUpdate
    };
  } catch (err) {
    console.warn('[Orchestrator] Invalid world update JSON', err);

    return {
      reply: cleaned,
      worldUpdate: null
    };
  }
}
  
  async function buildChatReply(characterId, threadId, S, otherParticipantNames, trailingContent) {
    var systemPrompt = PromptEngine.assemble(characterId, {
  userName: S.userName,
  otherParticipants: otherParticipantNames,

  family: {
    husband: S.userName,
    wife: 'Likhi',
    children: ['Aarav', 'Ananya']
  }
});

    var nonSystemMessages = [];
    if (S.memory) {
      MemoryEngine.retrieve(characterId, threadId, 'chat-context').forEach(function (m) {
        nonSystemMessages.push({ role: m.role, content: m.content });
      });
    }
    nonSystemMessages.push({ role: 'user', content: trailingContent });

    var rawReply = await ChatProviders.send(
    S.provider,
    nonSystemMessages,
    systemPrompt,
    S.apiKey
);
    

var parsed = extractWorldUpdate(rawReply);

if (parsed.worldUpdate) {
    Likhi.Engines.World.applyUpdate("default-world", parsed.worldUpdate);
 
}

return {
    kind: 'message',
    content: parsed.reply,
    metadata: {
        worldUpdate: parsed.worldUpdate
    }
};
  }

  Likhi.Engines.Orchestrator = Orchestrator;

})(window);
