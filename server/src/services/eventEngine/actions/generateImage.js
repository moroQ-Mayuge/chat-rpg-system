import { db } from '../../../db/connection.js';
import { buildSceneTagPrompt, buildReferenceAnchorCanvas, cropMainRegion, MAIN_WIDTH, MAIN_HEIGHT } from '../../imagePromptBuilder.js';
import { generateImage as generateImageFromKobold } from '../../koboldClient.js';
import { enqueueImageJob } from '../../imageQueue.js';
import { saveGeneratedImage } from '../../../storage/imageStorage.js';
import { createGeneratedImage } from '../../../db/repositories/generatedImagesRepo.js';
import { createMessage } from '../../../db/repositories/messagesRepo.js';
import { setCurrentSceneImage, getRoomSession } from '../../../db/repositories/roomSessionsRepo.js';
import { resolveStylePromptForWorld } from '../../../db/repositories/imageStylePresetsRepo.js';
import { getImageFormat } from '../../../db/repositories/imageFormatSettingsRepo.js';
import { broadcast } from '../../../ws/rooms.js';

// Substitutes ${キャラ名} placeholders in prompt_override with that character's
// current Outfit danbooru tags (SPEC.md 3.6.4/3.7). Content inside the
// placeholders is authored entirely by the user in the event editor — this
// module only does string substitution, never generates the tag content itself.
function substitutePlaceholders(promptOverride, participantsByName) {
  const referencedIds = new Set();
  if (!promptOverride) return { text: '', referencedIds };

  const text = promptOverride.replace(/\$\{([^}]+)\}/g, (match, name) => {
    const participant = participantsByName.get(name);
    if (!participant) return '';
    referencedIds.add(participant.character_id);
    const outfit = participant.current_outfit_id
      ? db.prepare('SELECT image_tags FROM outfits WHERE id = ?').get(participant.current_outfit_id)
      : null;
    return outfit?.image_tags ?? '';
  });

  return { text, referencedIds };
}

// { image_type: "scene"|"event", prompt_override?, target_character_ids? }
export async function executeGenerateImage(params, execCtx) {
  const { image_type = 'event', prompt_override = null, target_character_ids = null } = params;

  return new Promise((resolve, reject) => {
    enqueueImageJob(async () => {
      try {
        const session = getRoomSession(execCtx.sessionId);
        const participantsByName = new Map(session.participants.map((p) => [p.name, p]));
        const candidateParticipants = target_character_ids
          ? session.participants.filter((p) => target_character_ids.includes(p.character_id))
          : session.participants;

        const basePrompt = buildSceneTagPrompt(session, session.participants);
        const { text: overrideText, referencedIds } = substitutePlaceholders(prompt_override, participantsByName);

        // Candidates referenced by target_character_ids but not explicitly used
        // via a ${name} placeholder still get their tags appended, so they
        // aren't silently dropped from the generated image (SPEC.md 3.6.4).
        const leftoverTags = candidateParticipants
          .filter((p) => !referencedIds.has(p.character_id) && p.current_outfit_id)
          .map((p) => db.prepare('SELECT image_tags FROM outfits WHERE id = ?').get(p.current_outfit_id)?.image_tags)
          .filter(Boolean);

        const worldId = db.prepare('SELECT world_id FROM room_templates WHERE id = ?').get(execCtx.roomTemplateId).world_id;
        const stylePrompt = resolveStylePromptForWorld(worldId);
        const prompt = [stylePrompt, basePrompt, overrideText, ...leftoverTags].filter(Boolean).join(', ');

        const referencePaths = candidateParticipants
          .map((p) =>
            p.current_outfit_id ? db.prepare('SELECT standing_image_path FROM outfits WHERE id = ?').get(p.current_outfit_id)?.standing_image_path : null,
          )
          .filter(Boolean);

        const { canvasBase64, maskBase64, anchorOffset } = await buildReferenceAnchorCanvas(referencePaths, MAIN_WIDTH, MAIN_HEIGHT);
        const resultBuffer = await generateImageFromKobold({
          initImageBase64: canvasBase64,
          maskBase64,
          prompt,
          width: MAIN_WIDTH + anchorOffset,
          height: MAIN_HEIGHT,
        });
        const finalBuffer = await cropMainRegion(resultBuffer, anchorOffset, MAIN_WIDTH, MAIN_HEIGHT);
        const format = getImageFormat(image_type);
        const filePath = await saveGeneratedImage(execCtx.sessionId, finalBuffer, format);
        const generatedImage = createGeneratedImage({ roomSessionId: execCtx.sessionId, type: image_type, prompt, filePath });
        if (image_type === 'scene') setCurrentSceneImage(execCtx.sessionId, generatedImage.id);

        const message = createMessage(execCtx.sessionId, {
          sender_type: 'system',
          content_type: 'image',
          image_id: generatedImage.id,
        });
        broadcast(execCtx.sessionId, { type: 'message_complete', message });
        resolve({ generatedImageId: generatedImage.id });
      } catch (err) {
        broadcast(execCtx.sessionId, { type: 'error', message: err.message });
        reject(err);
      }
    });
  });
}
