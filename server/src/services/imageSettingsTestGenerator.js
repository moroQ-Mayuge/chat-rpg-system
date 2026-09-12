import { db } from '../db/connection.js';
import { getRoomSession } from '../db/repositories/roomSessionsRepo.js';
import { getWorld } from '../db/repositories/worldsRepo.js';
import { getOutfit } from '../db/repositories/outfitsRepo.js';
import { getImageGenerationSettings } from '../db/repositories/imageGenerationSettingsRepo.js';
import { listPropsForWorldRoom } from '../db/repositories/worldRoomPropsRepo.js';
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

// Shared core: given an already-resolved {variables, referencePaths} sample
// (from either resolveSample()'s automatic pick or resolveExplicitSceneSample()'s
// user-specified character/room), renders the prompt and actually generates an
// image. Never persists to any character/room/world entity — output goes to
// the same test/ folder as the standalone test-generate-image tool.
// options.mode: explicit override ('anchor_i2i'|'prompt_only'); falls back to
// settings.default_mode when omitted, same as this always did before mode
// became an option (testGenerateForKind never passed one).
async function generateFromResolvedSample(kind, settings, { variables, referencePaths }, options = {}) {
  const { previewFullCanvas = false, mode } = options;
  const prompt = renderPromptTemplate(settings.prompt_template, variables);

  const width = Number(settings.main_width);
  const height = Number(settings.main_height);
  const steps = Number(settings.steps);
  const cfgScale = Number(settings.cfg_scale);
  const samplerName = settings.sampler_name;
  const negativePrompt = settings.negative_prompt;

  const resolvedMode = mode || settings.default_mode;
  const useAnchor = resolvedMode === 'anchor_i2i' && referencePaths.length > 0 && !ALWAYS_PROMPT_ONLY_KINDS.has(kind);

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

// Renders the given (possibly unsaved) settings against a real sample record
// and actually generates an image, so the Settings page can preview a
// prompt/canvas/parameter edit before saving it.
export async function testGenerateForKind(kind, settings, options = {}) {
  return generateFromResolvedSample(kind, settings, resolveSample(kind), options);
}

// キャラ×部屋を明示指定してscene/eventのプレースホルダを組み立てる(2026-09-12、
// Settings画面の参照生成テストツール向け)。実際のroom_session/playthroughが
// 無くても、Worldマスタデータだけで7つ全てのプレースホルダを再現できる——
// location_tags/atmosphere_tagsだけは実セッションが持つ動的な値ではなく部屋
// テンプレート自身の同名列で代用し(セッション無しで使える唯一の部屋由来テキスト)、
// weather_tags/time_slot_tagsはプレイスルーの「現在値」が無いため、Worldに
// 設定された選択肢の先頭を既定値として使う(buildSceneTagPartsが
// playthrough.current_weather/current_time_slot_labelで引くのと同じ仕組みを
// 「先頭の選択肢」に差し替えただけ)。
function resolveExplicitSceneSample({ characterId, outfitId, worldId, roomTemplateId, extraHint }) {
  const outfit = getOutfit(outfitId);
  if (!outfit) throw new Error('指定された衣装が見つかりません。');
  if (Number(outfit.character_id) !== Number(characterId)) {
    throw new Error('指定された衣装は、指定されたキャラクターのものではありません。');
  }

  const template = db.prepare('SELECT * FROM room_templates WHERE id = ?').get(roomTemplateId);
  if (!template) throw new Error('指定された部屋テンプレートが見つかりません。');

  const world = getWorld(worldId);
  if (!world) throw new Error('指定されたWorldが見つかりません。');

  const propTags = listPropsForWorldRoom(worldId, roomTemplateId)
    .map((p) => p.danbooru_tags)
    .filter(Boolean)
    .join(', ');
  const defaultWeather = world.weather_options[0];
  const defaultTimeSlot = world.time_slot_labels[0];

  return {
    variables: {
      style_preset: resolveStylePromptForWorld(worldId),
      location_tags: template.location_tags || '',
      atmosphere_tags: template.atmosphere_tags || '',
      prop_tags: propTags,
      character_tags: resolveOutfitTags(composeWornOutfit(outfit.character_id, outfit, null), null),
      weather_tags: (defaultWeather != null ? world.weather_tag_map[defaultWeather] : null) ?? '',
      time_slot_tags: (defaultTimeSlot != null ? world.time_slot_tag_map[defaultTimeSlot] : null) ?? '',
      extra_hint: extraHint ?? '',
    },
    referencePaths: outfit.standing_image_path ? [outfit.standing_image_path] : [],
  };
}

// Settings画面の新規セクション向け: resolveSample()の自動選択(最もidが小さい
// room_session、実データ次第で不安定)ではなく、ユーザーが明示的に選んだ
// キャラ・衣装・World・部屋テンプレートでscene/eventをテスト生成する。
// フォーム編集中の値ではなく保存済みのimage_generation_settingsを使う——
// 既存のtestGenerateForKind(その場の編集内容をプレビュー)とは目的が異なるため。
export async function testGenerateReferenceScene({ kind, characterId, outfitId, worldId, roomTemplateId, extraHint, mode, previewFullCanvas }) {
  if (kind !== 'scene' && kind !== 'event') throw new Error(`この機能はscene/event種別専用です: ${kind}`);
  const settings = getImageGenerationSettings(kind);
  if (!settings) throw new Error(`画像生成設定が見つかりません: ${kind}`);
  const sample = resolveExplicitSceneSample({ characterId, outfitId, worldId, roomTemplateId, extraHint });
  return generateFromResolvedSample(kind, settings, sample, { mode, previewFullCanvas });
}
