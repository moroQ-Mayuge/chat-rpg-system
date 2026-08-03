import { db } from '../db/connection.js';
import { getRoomSession } from '../db/repositories/roomSessionsRepo.js';
import { resolveStylePromptForWorld, resolveDefaultStylePrompt } from '../db/repositories/imageStylePresetsRepo.js';
import { buildSceneTagParts, buildReferenceAnchorCanvas, cropMainRegion, resizeToCanvas } from './imagePromptBuilder.js';
import { renderPromptTemplate } from './promptTemplate.js';
import { generateTxt2Image, generateImage } from './koboldClient.js';
import { saveTestImage } from '../storage/imageStorage.js';
import { resolveOutfitTags } from './outfitTagCategories.js';
import { composeWornOutfit } from './outfitComposition.js';

function firstRow(sql) {
  return db.prepare(sql).get();
}

// Picks the lowest-id record of whatever entity a kind's placeholders are
// drawn from, so the Settings page can preview a prompt template against
// real data without the user having to pick anything.
function resolveSample(kind) {
  switch (kind) {
    case 'standing': {
      const outfit = firstRow('SELECT * FROM outfits ORDER BY id ASC LIMIT 1');
      if (!outfit) throw new Error('サンプルとなる衣装（Outfit）が見つかりません。');
      return {
        variables: { style_preset: resolveDefaultStylePrompt(), character_tags: resolveOutfitTags(composeWornOutfit(outfit?.character_id, outfit, null), null), extra_hint: '' },
        referencePaths: [],
      };
    }
    case 'expression': {
      const outfit = firstRow('SELECT * FROM outfits ORDER BY id ASC LIMIT 1');
      const expressionType = firstRow('SELECT * FROM expression_types ORDER BY id ASC LIMIT 1');
      if (!outfit || !expressionType) throw new Error('サンプルとなる衣装または表情種別が見つかりません。');
      return {
        variables: {
          style_preset: resolveDefaultStylePrompt(),
          character_tags: resolveOutfitTags(composeWornOutfit(outfit?.character_id, outfit, null), null),
          expression_tag: expressionType.danbooru_tag || expressionType.llm_tag_key,
          extra_hint: '',
        },
        referencePaths: outfit.standing_image_path ? [outfit.standing_image_path] : [],
      };
    }
    case 'scene':
    case 'event': {
      const sessionRow = firstRow('SELECT id FROM room_sessions ORDER BY id ASC LIMIT 1');
      if (!sessionRow) throw new Error('サンプルとなる部屋セッションが見つかりません。');
      const session = getRoomSession(sessionRow.id);
      // Resolved from the playthrough rather than the room: rooms are shared
      // master data now and no longer carry a single world_id (0030_room_world_decoupling.sql).
      const worldId = db.prepare('SELECT world_id FROM playthroughs WHERE id = ?').get(session.playthrough_id).world_id;
      const tagParts = buildSceneTagParts(session, session.participants);
      const referencePaths = session.participants
        .map((p) =>
          p.current_outfit_id ? db.prepare('SELECT standing_image_path FROM outfits WHERE id = ?').get(p.current_outfit_id)?.standing_image_path : null,
        )
        .filter(Boolean);
      return {
        variables: { style_preset: resolveStylePromptForWorld(worldId), ...tagParts, extra_hint: '' },
        referencePaths,
      };
    }
    case 'room_background': {
      const template = firstRow('SELECT * FROM room_templates ORDER BY id ASC LIMIT 1');
      if (!template) throw new Error('サンプルとなる部屋テンプレートが見つかりません。');
      // A room-master preview has no playthrough in scope -- fall back to
      // whichever World it's attached to first (or the app-wide default
      // style if it isn't attached to any World yet).
      const attachedWorld = db
        .prepare('SELECT world_id FROM world_room_templates WHERE room_template_id = ? ORDER BY world_id ASC LIMIT 1')
        .get(template.id);
      return {
        variables: {
          style_preset: attachedWorld ? resolveStylePromptForWorld(attachedWorld.world_id) : resolveDefaultStylePrompt(),
          location_tags: template.location_tags || '',
          atmosphere_tags: template.atmosphere_tags || '',
          extra_hint: '',
        },
        referencePaths: [],
      };
    }
    case 'world_thumbnail': {
      const world = firstRow('SELECT * FROM worlds ORDER BY id ASC LIMIT 1');
      if (!world) throw new Error('サンプルとなるWorldが見つかりません。');
      return {
        variables: { style_preset: resolveStylePromptForWorld(world.id), world_tags: world.image_tags || '', extra_hint: '' },
        referencePaths: [],
      };
    }
    default:
      throw new Error(`不明な画像種別です: ${kind}`);
  }
}

// Kinds whose real generator always uses plain txt2img regardless of the
// stored default_mode (see outfitImageGenerator.js/roomBackgroundImageGenerator.js/
// worldThumbnailGenerator.js) — mirrored here so the preview matches actual behavior.
const ALWAYS_PROMPT_ONLY_KINDS = new Set(['standing', 'room_background', 'world_thumbnail']);

// Renders the given (possibly unsaved) settings against a real sample record
// and actually generates an image, so the Settings page can preview a
// prompt/canvas/parameter edit before saving it. Never persists to any
// character/room/world entity — output goes to the same test/ folder as the
// standalone test-generate-image tool.
export async function testGenerateForKind(kind, settings, options = {}) {
  const { previewFullCanvas = false } = options;
  const { variables, referencePaths } = resolveSample(kind);
  const prompt = renderPromptTemplate(settings.prompt_template, variables);

  const width = Number(settings.main_width);
  const height = Number(settings.main_height);
  const steps = Number(settings.steps);
  const cfgScale = Number(settings.cfg_scale);
  const samplerName = settings.sampler_name;
  const negativePrompt = settings.negative_prompt;

  const useAnchor = settings.default_mode === 'anchor_i2i' && referencePaths.length > 0 && !ALWAYS_PROMPT_ONLY_KINDS.has(kind);

  if (!useAnchor) {
    const buffer = await generateTxt2Image({ prompt, negativePrompt, width, height, steps, cfgScale, samplerName });
    const imagePath = await saveTestImage(buffer, 'png');
    return { imagePath, prompt, usedMode: 'prompt_only' };
  }

  const denoisingStrength = Number(settings.denoising_strength);
  const { canvasBase64, maskBase64, anchorOffset } = await buildReferenceAnchorCanvas(referencePaths, width, height);
  const resultBuffer = await generateImage({
    initImageBase64: canvasBase64,
    maskBase64,
    prompt,
    negativePrompt,
    width: width + anchorOffset,
    height,
    steps,
    cfgScale,
    denoisingStrength,
    samplerName,
  });
  const finalBuffer =
    previewFullCanvas ? await resizeToCanvas(resultBuffer, anchorOffset, width, height) : await cropMainRegion(resultBuffer, anchorOffset, width, height);
  const imagePath = await saveTestImage(finalBuffer, 'png');
  return { imagePath, prompt, usedMode: 'anchor_i2i', previewFullCanvas };
}
