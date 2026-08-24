import { generateTxt2Image, generateImage } from './koboldClient.js';
import { buildReferenceAnchorCanvas, cropMainRegion } from './imagePromptBuilder.js';
import { renderPromptTemplate } from './promptTemplate.js';
import { saveTestImage } from '../storage/imageStorage.js';
import { resolveDefaultStylePrompt } from '../db/repositories/imageStylePresetsRepo.js';
import { getImageGenerationSettings } from '../db/repositories/imageGenerationSettingsRepo.js';
import { getOutfitExposureTagSettings } from '../db/repositories/outfitExposureTagSettingsRepo.js';
import { resolveOutfitTags, resolveStatusModifiers } from './outfitTagCategories.js';
import { composeWornOutfit } from './outfitComposition.js';
import { listExpressionTypes } from '../db/repositories/expressionTypesRepo.js';

function buildPrompt(settings, variables) {
  return renderPromptTemplate(settings.prompt_template, { style_preset: resolveDefaultStylePrompt(), ...variables });
}

async function testGenerateStanding(outfit, extraHint, modifiers, exposureTagSettings) {
  const settings = getImageGenerationSettings('standing');
  const prompt = buildPrompt(settings, {
    character_tags: resolveOutfitTags(
      composeWornOutfit(outfit.character_id, outfit, null),
      null,
      modifiers.suppressedFields,
      modifiers.disturbedFieldStyles,
      modifiers.tornFields,
      exposureTagSettings,
    ),
    extra_hint: extraHint,
  });
  const buffer = await generateTxt2Image({
    prompt,
    negativePrompt: settings.negative_prompt,
    width: settings.main_width,
    height: settings.main_height,
    steps: settings.steps,
    cfgScale: settings.cfg_scale,
    samplerName: settings.sampler_name,
  });
  return { imagePath: await saveTestImage(buffer, 'png'), prompt };
}

async function testGenerateExpression(outfit, expressionType, extraHint, standingImagePath, modifiers, exposureTagSettings) {
  const settings = getImageGenerationSettings('expression');
  // icon_excluded_fields(アイコンに含めない設定)と状態によるsuppressedFields
  // (脱がされて無い設定)は別概念なので和集合にする。
  const suppressedFields = new Set([...modifiers.suppressedFields, ...(outfit.icon_excluded_fields ?? [])]);
  const prompt = buildPrompt(settings, {
    character_tags: resolveOutfitTags(
      composeWornOutfit(outfit.character_id, outfit, null),
      null,
      suppressedFields,
      modifiers.disturbedFieldStyles,
      modifiers.tornFields,
      exposureTagSettings,
    ),
    expression_tag: expressionType.danbooru_tag || expressionType.llm_tag_key,
    extra_hint: extraHint,
  });

  if (settings.default_mode !== 'anchor_i2i' || !standingImagePath) {
    const buffer = await generateTxt2Image({
      prompt,
      negativePrompt: settings.negative_prompt,
      width: settings.main_width,
      height: settings.main_height,
      steps: settings.steps,
      cfgScale: settings.cfg_scale,
      samplerName: settings.sampler_name,
    });
    return { imagePath: await saveTestImage(buffer, 'png'), prompt };
  }

  const { canvasBase64, maskBase64, anchorOffset } = await buildReferenceAnchorCanvas([standingImagePath], settings.main_width, settings.main_height);
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
  const finalBuffer = await cropMainRegion(resultBuffer, anchorOffset, settings.main_width, settings.main_height);
  return { imagePath: await saveTestImage(finalBuffer, 'png'), prompt };
}

// 衣装タグ編集中のプレビュー用: どのキャラ/衣装/マスタのレコードにも書き込まず、
// 今渡されたタグだけから全身1枚+代表表情アイコン1枚をまとめて試し生成する。
// statusIds: セッションを実際に進めずに乱れ状態(脱がす/開く/破るetc)を試すための
// キャラ状態マスタのID配列 — getActiveOutfitStatusModifiers(実際にアクティブな
// 状態から組み立てる版)と同じmergeStatusModifiersを、選んだID配列に対して適用する。
// 表情アイコンは全身側で生成したテスト画像をi2iアンカーに使う（既存の
// generateOutfitExpressionImageがoutfit.standing_image_pathを使うのと同じ役割）。
export async function testGenerateOutfitPreview(outfit, extraHint, statusIds = []) {
  const modifiers = resolveStatusModifiers(statusIds);
  const exposureTagSettings = getOutfitExposureTagSettings();
  const standing = await testGenerateStanding(outfit, extraHint, modifiers, exposureTagSettings);
  const expressionType = listExpressionTypes()[0];
  if (!expressionType) return { standing, expression: null };
  const expression = await testGenerateExpression(outfit, expressionType, extraHint, standing.imagePath, modifiers, exposureTagSettings);
  return { standing, expression: { ...expression, expressionTypeName: expressionType.name } };
}
