import { Router } from 'express';
import { db } from '../db/connection.js';
import { getRoomSession, exitRoomSession, updateSessionScene, setCurrentSceneImage } from '../db/repositories/roomSessionsRepo.js';
import { resolveProtagonist } from '../db/repositories/playthroughsRepo.js';
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

roomSessionsRouter.post('/:id/messages', (req, res) => {
  if (!req.body.content) return res.status(400).json({ error: 'content_required' });
  const session = getRoomSession(req.params.id);
  const mentionedCharacterIds = resolveMentions(req.body.content, session.participants);
  const message = createMessage(req.params.id, {
    sender_type: 'user',
    content: req.body.content,
    mentioned_character_ids: mentionedCharacterIds,
  });
  res.status(201).json(message);

  generateReply(req.params.id, req.body.content, mentionedCharacterIds).catch((err) => {
    console.error('generateReply failed:', err);
    broadcast(req.params.id, { type: 'error', message: err.message });
  });
});

roomSessionsRouter.post('/:id/exit', (req, res) => {
  res.json(exitRoomSession(req.params.id));
});

function fallbackEmotionKey() {
  const row = db.prepare("SELECT llm_tag_key FROM expression_types WHERE name = '通常'").get();
  return row?.llm_tag_key ?? 'normal';
}

async function generateReply(sessionId, userMessageContent, mentionedCharacterIds = null) {
  const session = getRoomSession(sessionId);
  const built = buildMultiCharacterMessages(session);
  if (!built) return;

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
      settings.anchor_width,
    );
    const resultBuffer = await generateImage({
      initImageBase64: canvasBase64,
      maskBase64,
      prompt,
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
