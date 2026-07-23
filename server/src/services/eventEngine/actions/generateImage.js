import { db } from '../../../db/connection.js';
import { buildSceneTagParts, buildReferenceAnchorCanvas, cropMainRegion } from '../../imagePromptBuilder.js';
import { renderPromptTemplate } from '../../promptTemplate.js';
import { generateImage as generateImageFromKobold, generateTxt2Image } from '../../koboldClient.js';
import { enqueueImageJob } from '../../imageQueue.js';
import { saveGeneratedImage } from '../../../storage/imageStorage.js';
import { createGeneratedImage } from '../../../db/repositories/generatedImagesRepo.js';
import { createMessage } from '../../../db/repositories/messagesRepo.js';
import { setCurrentSceneImage, getRoomSession } from '../../../db/repositories/roomSessionsRepo.js';
import { resolveStylePromptForWorld } from '../../../db/repositories/imageStylePresetsRepo.js';
import { getImageGenerationSettings } from '../../../db/repositories/imageGenerationSettingsRepo.js';
import { getImageFormat } from '../../../db/repositories/imageFormatSettingsRepo.js';
import { broadcast } from '../../../ws/rooms.js';
import { resolveOutfitTags, getActiveOutfitStatusModifiers, computeNudityTags } from '../../outfitTagCategories.js';
import { getOutfitExposureTagSettings } from '../../../db/repositories/outfitExposureTagSettingsRepo.js';
import { resolveMentionedList } from '../mentionResolution.js';
import { resolveTargetToken } from '../placeholderResolution.js';

// Substitutes placeholders in prompt_override with a participant's current
// Outfit danbooru tags (SPEC.md 3.6.4/3.7). Two base forms are supported:
//   ${キャラ名}     — a specific, fixed character by name
//   ${target1} ${target2} ... — positional, resolving to candidateParticipants
//                                in order (i.e. target_character_ids' order,
//                                or all present participants if unset). Lets
//                                an event reference "whoever ends up here"
//                                without knowing in advance which character
//                                that will be (e.g. after a random character_join).
// Either base form can carry an optional ".<categoryKey>" suffix to pull just
// one tag category or a named shot-framing range instead of the whole outfit
// (see outfitTagCategories.js's resolveOutfitTags) — e.g. ${target1.hairstyle},
// ${みお.upperbody_full}. No suffix keeps the old "everything combined" behavior.
// Content inside the placeholders is authored entirely by the user in the
// event editor — this module only does string substitution, never generates
// the tag content itself.
function substitutePlaceholders(promptOverride, participantsByName, candidateParticipants, statusCtx, exposureTagSettings) {
  const referencedIds = new Set();
  if (!promptOverride) return { text: '', referencedIds };

  const text = promptOverride.replace(/\$\{([^}]+)\}/g, (match, token) => {
    const { participant, categoryKey } = resolveTargetToken(token, candidateParticipants, participantsByName);
    if (!participant) return '';
    referencedIds.add(participant.character_id);
    const outfit = participant.current_outfit_id
      ? db.prepare('SELECT * FROM outfits WHERE id = ?').get(participant.current_outfit_id)
      : null;
    const { suppressedFields, disturbedFieldStyles } = getActiveOutfitStatusModifiers(participant.character_id, statusCtx);
    return resolveOutfitTags(outfit, categoryKey, suppressedFields, disturbedFieldStyles, exposureTagSettings) ?? '';
  });

  return { text, referencedIds };
}

// { image_type: "scene"|"event", prompt_override?, target_character_ids?, mentioned_limit?, auto_append_unreferenced? }
export async function executeGenerateImage(params, execCtx) {
  const {
    image_type = 'event',
    prompt_override = null,
    target_character_ids = null,
    mentioned_limit = null,
    auto_append_unreferenced = true,
  } = params;
  // Falls back to the player's explicit @mention (chat enhancement backlog
  // item 3c) when the event itself doesn't pin down a target — lets "whoever
  // I mentioned" resolve without the event author having to hardcode it.
  // Treats an empty array the same as null/undefined (the editor UI's default
  // for an untouched selector is `[]`, not `null` — without this, `[] ??
  // execCtx.mentionedCharacterIds` never actually falls through, since `[]`
  // is truthy, silently defeating the documented "空欄=@メンション優先"
  // behavior).
  const mentionedIds = resolveMentionedList(execCtx.mentionedCharacterIds, mentioned_limit);
  const effectiveTargetIds = target_character_ids && target_character_ids.length > 0 ? target_character_ids : mentionedIds.length > 0 ? mentionedIds : null;

  return new Promise((resolve, reject) => {
    enqueueImageJob(async () => {
      try {
        const session = getRoomSession(execCtx.sessionId);
        const participantsByName = new Map(session.participants.map((p) => [p.name, p]));
        const candidateParticipants = effectiveTargetIds
          ? effectiveTargetIds.map((id) => session.participants.find((p) => p.character_id === id)).filter(Boolean)
          : session.participants;

        const settings = getImageGenerationSettings(image_type);
        // Resolved from the playthrough rather than the room: rooms are
        // shared master data now and no longer carry a single world_id
        // (0030_room_world_decoupling.sql).
        const worldId = db.prepare('SELECT world_id FROM playthroughs WHERE id = ?').get(execCtx.playthroughId).world_id;
        const stylePrompt = resolveStylePromptForWorld(worldId);
        const tagParts = buildSceneTagParts(session, candidateParticipants);
        const basePrompt = renderPromptTemplate(settings.prompt_template, { style_preset: stylePrompt, ...tagParts });

        const statusCtx = { playthroughId: execCtx.playthroughId, roomSessionId: execCtx.sessionId };
        const exposureTagSettings = getOutfitExposureTagSettings();
        const { text: overrideText, referencedIds } = substitutePlaceholders(
          prompt_override,
          participantsByName,
          candidateParticipants,
          statusCtx,
          exposureTagSettings,
        );

        // Candidates referenced by target_character_ids but not explicitly used
        // via a ${name} placeholder still get their tags appended, so they
        // aren't silently dropped from the generated image (SPEC.md 3.6.4).
        // auto_append_unreferenced=false (per-event opt-out) skips this
        // entirely -- useful when the scene has onlookers who are present
        // but not narratively part of the action being depicted. Nudity tags
        // (topless/bottomless/completely_nude/breast_out, 0064) only make
        // sense for a character's whole outfit, so they're appended here
        // (the "all fields combined" path) and not inside substitutePlaceholders'
        // per-category ${name.category} lookups.
        const leftoverTags = auto_append_unreferenced
          ? candidateParticipants
              .filter((p) => !referencedIds.has(p.character_id) && p.current_outfit_id)
              .map((p) => {
                const outfit = db.prepare('SELECT * FROM outfits WHERE id = ?').get(p.current_outfit_id);
                const { suppressedFields, disturbedFieldStyles } = getActiveOutfitStatusModifiers(p.character_id, statusCtx);
                const tags = resolveOutfitTags(outfit, null, suppressedFields, disturbedFieldStyles, exposureTagSettings);
                const nudityTags = computeNudityTags(outfit, suppressedFields, disturbedFieldStyles, exposureTagSettings);
                return [tags, ...nudityTags].filter(Boolean).join(', ');
              })
              .filter(Boolean)
          : [];

        const prompt = [basePrompt, overrideText, ...leftoverTags].filter(Boolean).join(', ');

        const format = getImageFormat(image_type);
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
          const referencePaths = candidateParticipants
            .map((p) =>
              p.current_outfit_id ? db.prepare('SELECT standing_image_path FROM outfits WHERE id = ?').get(p.current_outfit_id)?.standing_image_path : null,
            )
            .filter(Boolean);

          const { canvasBase64, maskBase64, anchorOffset } = await buildReferenceAnchorCanvas(
            referencePaths,
            settings.main_width,
            settings.main_height,
          );
          const resultBuffer = await generateImageFromKobold({
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
