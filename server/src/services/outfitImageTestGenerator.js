import { generateTxt2Image, generateImage } from './koboldClient.js';
import { buildReferenceAnchorCanvas, cropMainRegion } from './imagePromptBuilder.js';
import { renderPromptTemplate } from './promptTemplate.js';
import { saveTestImage } from '../storage/imageStorage.js';
import { resolveDefaultStylePrompt } from '../db/repositories/imageStylePresetsRepo.js';
import { getImageGenerationSettings } from '../db/repositories/imageGenerationSettingsRepo.js';
import { resolveOutfitTags } from './outfitTagCategories.js';
import { composeWornOutfit } from './outfitComposition.js';
import { listExpressionTypes } from '../db/repositories/expressionTypesRepo.js';

function buildPrompt(settings, variables) {
  return renderPromptTemplate(settings.prompt_template, { style_preset: resolveDefaultStylePrompt(), ...variables });
}

async function testGenerateStanding(outfit, extraHint) {
  const settings = getImageGenerationSettings('standing');
  const prompt = buildPrompt(settings, { character_tags: resolveOutfitTags(composeWornOutfit(outfit.character_id, outfit, null), null), extra_hint: extraHint });
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

async function testGenerateExpression(outfit, expressionType, extraHint, standingImagePath) {
  const settings = getImageGenerationSettings('expression');
  const prompt = buildPrompt(settings, {
    character_tags: resolveOutfitTags(composeWornOutfit(outfit.character_id, outfit, null), null, outfit.icon_excluded_fields ?? []),
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
// 表情アイコンは全身側で生成したテスト画像をi2iアンカーに使う（既存の
// generateOutfitExpressionImageがoutfit.standing_image_pathを使うのと同じ役割）。
export async function testGenerateOutfitPreview(outfit, extraHint) {
  const standing = await testGenerateStanding(outfit, extraHint);
  const expressionType = listExpressionTypes()[0];
  if (!expressionType) return { standing, expression: null };
  const expression = await testGenerateExpression(outfit, expressionType, extraHint, standing.imagePath);
  return { standing, expression: { ...expression, expressionTypeName: expressionType.name } };
}
