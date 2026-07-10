import { Router } from 'express';
import { db } from '../db/connection.js';
import {
  getRoomSession,
  exitRoomSession,
  updateSessionScene,
  setCurrentSceneImage,
  endSessionForMove,
  createRoomSession,
  setAccompanying,
} from '../db/repositories/roomSessionsRepo.js';
import { resolveProtagonist, applyMovementCost } from '../db/repositories/playthroughsRepo.js';
import { getWorld } from '../db/repositories/worldsRepo.js';
import { findOrCreateWorldItem } from '../db/repositories/itemsRepo.js';
import { addItemToInventory } from '../db/repositories/inventoryRepo.js';
import { getConnection } from '../db/repositories/roomConnectionsRepo.js';
import { listMessagesForSession, createMessage } from '../db/repositories/messagesRepo.js';
import { createGeneratedImage } from '../db/repositories/generatedImagesRepo.js';
import { buildMultiCharacterMessages } from '../services/promptBuilder.js';
import { parseScriptLine } from '../services/responseParser.js';
import { generateChatCompletion, generateImage, generateTxt2Image } from '../services/koboldClient.js';
import { buildSceneTagParts, buildReferenceAnchorCanvas, cropMainRegion, suggestSceneTags } from '../services/imagePromptBuilder.js';
import { renderPromptTemplate } from '../services/promptTemplate.js';
import { enqueueImageJob } from '../services/imageQueue.js';
import { saveGeneratedImage } from '../storage/imageStorage.js';
import { runEventEngine } from '../services/eventEngine/index.js';
import { resolveStylePromptForWorld } from '../db/repositories/imageStylePresetsRepo.js';
import { getImageGenerationSettings } from '../db/repositories/imageGenerationSettingsRepo.js';
import { getImageFormat } from '../db/repositories/imageFormatSettingsRepo.js';
import { broadcast } from '../ws/rooms.js';

export const roomSessionsRouter = Router();

roomSessionsRouter.get('/:id', (req, res) => {
  const session = getRoomSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'not_found' });
  res.json({ ...session, messages: listMessagesForSession(req.params.id) });
});

roomSessionsRouter.get('/:id/messages', (req, res) => {
  res.json(listMessagesForSession(req.params.id));
});

// Resolves "@name" tokens against the session's current participants
// (Teams/Slack-style mention, chat enhancement backlog item 3c) — lets the
// player explicitly select an action/utterance's target rather than the
// event engine having to infer it from context.
function resolveMentions(content, participants) {
  const ids = participants.filter((p) => content.includes(`@${p.name}`)).map((p) => p.character_id);
  return ids.length > 0 ? ids : null;
}

// Empty content is not rejected — it's an explicit "continue from here"
// request (no user action/speech). No user message row is created for it,
// so nothing shows up as a player turn; generateReply() below feeds the LLM
// call a minimal ephemeral turn instead (never persisted, never displayed).
roomSessionsRouter.post('/:id/messages', (req, res) => {
  const content = (req.body.content ?? '').trim();
  const isContinuation = content.length === 0;
  const session = getRoomSession(req.params.id);

  let message = null;
  let mentionedCharacterIds = null;
  if (!isContinuation) {
    mentionedCharacterIds = resolveMentions(content, session.participants);
    message = createMessage(req.params.id, {
      sender_type: 'user',
      content,
      mentioned_character_ids: mentionedCharacterIds,
    });
  }
  res.status(201).json(message ?? { continuation: true });

  generateReply(req.params.id, content, mentionedCharacterIds, isContinuation).catch((err) => {
    console.error('generateReply failed:', err);
    broadcast(req.params.id, { type: 'error', message: err.message });
  });
});

roomSessionsRouter.post('/:id/exit', (req, res) => {
  res.json(exitRoomSession(req.params.id));
});

// Moves the player from a "場所" (is_place room_template) to one of its
// outgoing connections. Unlike /exit, this does NOT unconditionally advance
// time — the connection's movement_cost is instead applied to the
// playthrough's sub-count budget (World.movement_points_per_time_slot),
// which only advances the time slot once exhausted. Participants flagged
// is_accompanying follow into the new session.
roomSessionsRouter.post('/:id/move', (req, res) => {
  const session = getRoomSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'not_found' });

  const connection = getConnection(req.body.connection_id);
  if (!connection || connection.from_room_template_id !== session.room_template_id) {
    return res.status(400).json({ error: 'invalid_connection' });
  }

  const carryOverParticipants = session.participants
    .filter((p) => p.is_accompanying)
    .map((p) => ({ character_id: p.character_id, current_outfit_id: p.current_outfit_id }));

  endSessionForMove(session.id);
  const playthrough = applyMovementCost(session.playthrough_id, connection.movement_cost);
  const newSession = createRoomSession(session.playthrough_id, connection.to_room_template_id, {
    carryOverParticipants,
  });

  res.json({ session: newSession, playthrough });
});

roomSessionsRouter.post('/:id/participants/:characterId/accompanying', (req, res) => {
  res.json(setAccompanying(req.params.id, req.params.characterId, Boolean(req.body.is_accompanying)));
});

// Surfaces change_relationship action results as a transient in-chat notice
// (opt-in per World, chat enhancement backlog item 11) — previously these
// happened completely silently. change_relationship's own result already
// carries previous_value/axis_name (added alongside this feature) so no
// extra DB lookups are needed here beyond the character's display name.
function broadcastRelationshipChanges(sessionId, fired) {
  for (const event of fired) {
    for (const actionResult of event.actionResults) {
      if (actionResult.actionType !== 'change_relationship') continue;
      for (const change of actionResult.result?.changes ?? []) {
        if (change.new_value === change.previous_value) continue;
        const character = db.prepare('SELECT name FROM characters WHERE id = ?').get(change.character_id);
        const direction = change.new_value > change.previous_value ? '上がった' : '下がった';
        broadcast(sessionId, {
          type: 'relationship_changed',
          description: `${character?.name ?? '???'}との${change.axis_name}が${direction}`,
        });
      }
    }
  }
}

function fallbackEmotionKey() {
  const row = db.prepare("SELECT llm_tag_key FROM expression_types WHERE name = '通常'").get();
  return row?.llm_tag_key ?? 'normal';
}

async function generateReply(sessionId, userMessageContent, mentionedCharacterIds = null, isContinuation = false) {
  const session = getRoomSession(sessionId);
  // Verified empirically against this project's model: a messages array
  // ending on role 'assistant' (i.e. no new user turn at all) reliably
  // returns an EMPTY completion. A lone whitespace user turn reliably
  // produces a well-formed continuation instead, without reading as an
  // actual player action/line — this is the minimal content that still
  // triggers generation.
  const built = buildMultiCharacterMessages(session, { ephemeralUserTurn: isContinuation ? ' ' : null });
  if (!built) return;

  const worldId = db.prepare('SELECT world_id FROM room_templates WHERE id = ?').get(session.room_template_id).world_id;
  const world = getWorld(worldId);
  const maxTokens = world.max_response_tokens;

  broadcast(sessionId, { type: 'generation_start' });

  const validEmotionKeys = new Set(db.prepare('SELECT llm_tag_key FROM expression_types').all().map((r) => r.llm_tag_key));
  const fallbackKey = fallbackEmotionKey();
  const participantsByName = new Map(session.participants.map((p) => [p.name, p]));

  // The system prompt tells the model never to speak/act as the protagonist
  // by name, but small local models don't reliably follow negative
  // instructions — observed live: it still emitted "[<protagonist name>]: ..."
  // lines. Rather than trust the prompt alone, strip any turn attributed to
  // the protagonist's own name/nickname here, since showing the model's
  // made-up dialogue for the player character defeats the point of the
  // protagonist feature (the player's lines must only ever come from them).
  const protagonist = resolveProtagonist(session.playthrough_id);
  const forbiddenNames = new Set(
    protagonist.mode === 'character' ? [protagonist.name, protagonist.nickname].map((s) => s.trim()).filter(Boolean) : [],
  );

  // Persists + broadcasts one parsed line as soon as it's recognized, so chat
  // bubbles reveal one at a time as the response streams in, instead of all
  // appearing at once after the full response lands.
  function handleParsedLine(parsed) {
    if (!parsed) return;

    if (parsed.type === 'scene_change') {
      broadcast(sessionId, { type: 'scene_change_detected', description: parsed.description });
      enqueueImageJob(() => generateSceneImage(sessionId, parsed.description));
      return;
    }

    if (parsed.type === 'narration') {
      const message = createMessage(sessionId, { sender_type: 'narration', content: parsed.text });
      broadcast(sessionId, { type: 'message_complete', message });
      return;
    }

    if (parsed.type === 'item_grant') {
      // Dynamic item generation (chat enhancement backlog item 9): always
      // scoped to the current room's own World, never the shared-common
      // tier — see findOrCreateWorldItem's own comment for why.
      const item = findOrCreateWorldItem(worldId, parsed.itemName, parsed.description);
      addItemToInventory(session.playthrough_id, item.id);
      const message = createMessage(sessionId, { sender_type: 'narration', content: `『${item.name}』を手に入れた。` });
      broadcast(sessionId, { type: 'message_complete', message });
      return;
    }

    if (forbiddenNames.has(parsed.characterName.trim())) return;

    const participant = participantsByName.get(parsed.characterName);
    if (!participant) {
      // Model hallucinated a name that isn't actually present — keep the line
      // visible as narration rather than silently discarding generated content.
      const message = createMessage(sessionId, {
        sender_type: 'narration',
        content: `[${parsed.characterName}]: ${parsed.text}`,
      });
      broadcast(sessionId, { type: 'message_complete', message });
      return;
    }

    let content = parsed.text;
    let emotionTag = fallbackKey;
    if (parsed.emotionKey) {
      if (validEmotionKeys.has(parsed.emotionKey)) {
        emotionTag = parsed.emotionKey;
      } else {
        // Unknown emotion tag: fall back to the default expression image, but
        // keep the model's intended nuance visible by folding it into the
        // dialogue text instead of discarding the line's content.
        content = `${content}（${parsed.emotionKey}）`;
      }
    }

    const message = createMessage(sessionId, {
      sender_type: 'character',
      character_id: participant.character_id,
      content,
      emotion_tag: emotionTag,
    });
    broadcast(sessionId, { type: 'message_complete', message });
  }

  let lineBuffer = '';
  const fullText = await generateChatCompletion({
    messages: built.messages,
    stop: ['ユーザー:', 'User:'],
    stream: true,
    ...(maxTokens ? { maxTokens } : {}),
    onToken: (token) => {
      lineBuffer += token;
      let newlineIndex;
      while ((newlineIndex = lineBuffer.indexOf('\n')) !== -1) {
        const line = lineBuffer.slice(0, newlineIndex);
        lineBuffer = lineBuffer.slice(newlineIndex + 1);
        handleParsedLine(parseScriptLine(line));
      }
    },
  });
  handleParsedLine(parseScriptLine(lineBuffer));

  try {
    const fired = await runEventEngine({
      sessionId,
      playthroughId: session.playthrough_id,
      roomTemplateId: session.room_template_id,
      userMessage: userMessageContent,
      aiResponseText: fullText,
      mentionedCharacterIds,
    });
    for (const event of fired) {
      broadcast(sessionId, { type: 'event_fired', eventDefinitionId: event.eventDefinitionId, name: event.name });
    }
    if (world.notify_relationship_changes) {
      broadcastRelationshipChanges(sessionId, fired);
    }
  } catch (err) {
    console.error('Event engine run failed:', err);
  }

  broadcast(sessionId, { type: 'generation_done' });
}

async function generateSceneImage(sessionId, sceneChangeDescription) {
  const sceneTags = await suggestSceneTags(sceneChangeDescription);
  const updatedSession = updateSessionScene(sessionId, {
    locationText: sceneChangeDescription,
    locationTags: sceneTags,
  });

  const settings = getImageGenerationSettings('scene');
  const worldId = db.prepare('SELECT world_id FROM room_templates WHERE id = ?').get(updatedSession.room_template_id).world_id;
  const stylePrompt = resolveStylePromptForWorld(worldId);
  const tagParts = buildSceneTagParts(updatedSession, updatedSession.participants);
  const prompt = renderPromptTemplate(settings.prompt_template, { style_preset: stylePrompt, ...tagParts });

  const referencePaths = updatedSession.participants
    .map((p) => {
      if (!p.current_outfit_id) return null;
      return db.prepare('SELECT standing_image_path FROM outfits WHERE id = ?').get(p.current_outfit_id)?.standing_image_path;
    })
    .filter(Boolean);

  const format = getImageFormat('scene');
  let finalBuffer;

  if (settings.default_mode === 'prompt_only') {
    finalBuffer = await generateTxt2Image({
      prompt,
      negativePrompt: settings.negative_prompt,
      width: settings.main_width,
      height: settings.main_height,
      steps: settings.steps,
      cfgScale: settings.cfg_scale,
      samplerName: settings.sampler_name,
    });
  } else {
    const { canvasBase64, maskBase64, anchorOffset } = await buildReferenceAnchorCanvas(
      referencePaths,
      settings.main_width,
      settings.main_height,
    );
    const resultBuffer = await generateImage({
      initImageBase64: canvasBase64,
      maskBase64,
      prompt,
      negativePrompt: settings.negative_prompt,
      width: settings.main_width + anchorOffset,
      height: settings.main_height,
      steps: settings.steps,
      cfgScale: settings.cfg_scale,
      denoisingStrength: settings.denoising_strength,
      samplerName: settings.sampler_name,
    });
    finalBuffer = await cropMainRegion(resultBuffer, anchorOffset, settings.main_width, settings.main_height);
  }

  const filePath = await saveGeneratedImage(sessionId, finalBuffer, format);
  const generatedImage = createGeneratedImage({ roomSessionId: sessionId, type: 'scene', prompt, filePath });
  setCurrentSceneImage(sessionId, generatedImage.id);

  const message = createMessage(sessionId, {
    sender_type: 'system',
    content_type: 'image',
    image_id: generatedImage.id,
  });

  broadcast(sessionId, { type: 'message_complete', message });
}
