import { generateTxt2Image, generateImage } from './koboldClient.js';
import { buildReferenceAnchorCanvas, cropMainRegion } from './imagePromptBuilder.js';
import { renderPromptTemplate } from './promptTemplate.js';
import { saveCharacterImage } from '../storage/imageStorage.js';
import { resolveDefaultStylePrompt } from '../db/repositories/imageStylePresetsRepo.js';
import { getImageGenerationSettings } from '../db/repositories/imageGenerationSettingsRepo.js';
import { getImageFormat } from '../db/repositories/imageFormatSettingsRepo.js';
import { resolveOutfitTags } from './outfitTagCategories.js';
import { composeWornOutfit } from './outfitComposition.js';

// Outfit assets aren't tied to any particular World (a Character can appear
// in several), so there's no World to resolve a style preset from — always
// falls back to whichever preset is_default.
function buildPrompt(settings, variables) {
  return renderPromptTemplate(settings.prompt_template, { style_preset: resolveDefaultStylePrompt(), ...variables });
}

// Generates a fresh standing image (立ち絵) for an Outfit via plain txt2img —
// there is no prior reference to stay consistent with yet, since this image
// itself becomes the reference used everywhere else (SPEC.md 3.7).
export async function generateOutfitStandingImage(outfit, extraHint) {
  const settings = getImageGenerationSettings('standing');
  const prompt = buildPrompt(settings, { character_tags: resolveOutfitTags(composeWornOutfit(outfit?.character_id, outfit, null), null), extra_hint: extraHint });
  const buffer = await generateTxt2Image({
    prompt,
    negativePrompt: settings.negative_prompt,
    width: settings.main_width,
    height: settings.main_height,
    steps: settings.steps,
    cfgScale: settings.cfg_scale,
    samplerName: settings.sampler_name,
  });
  return saveCharacterImage(`outfit${outfit.id}-standing`, buffer, getImageFormat('standing'));
}

// Generates one expression-differential image for an Outfit. mode selects
// between the reference-anchor i2i technique (keeps the face consistent with
// the standing image, but the "main" region's composition can vary between
// generations — see [[image_generation_settings_plan]] memory) and a plain
// prompt-only generation (no reference, relies on shared danbooru tags alone
// for consistency, but doesn't have the anchor technique's failure modes).
export async function generateOutfitExpressionImage(outfit, expressionType, extraHint, mode) {
  const settings = getImageGenerationSettings('expression');
  const resolvedMode = mode || settings.default_mode;
  const prompt = buildPrompt(settings, {
    character_tags: resolveOutfitTags(composeWornOutfit(outfit?.character_id, outfit, null), null, outfit.icon_excluded_fields ?? []),
    expression_tag: expressionType.danbooru_tag || expressionType.llm_tag_key,
    extra_hint: extraHint,
  });

  if (resolvedMode === 'prompt_only' || !outfit.standing_image_path) {
    const buffer = await generateTxt2Image({
      prompt,
      negativePrompt: settings.negative_prompt,
      width: settings.main_width,
      height: settings.main_height,
      steps: settings.steps,
      cfgScale: settings.cfg_scale,
      samplerName: settings.sampler_name,
    });
    return saveCharacterImage(`outfit${outfit.id}-${expressionType.llm_tag_key}`, buffer, getImageFormat('expression'));
  }

  const { canvasBase64, maskBase64, anchorOffset } = await buildReferenceAnchorCanvas(
    [outfit.standing_image_path],
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

  const finalBuffer = await cropMainRegion(resultBuffer, anchorOffset, settings.main_width, settings.main_height);
  return saveCharacterImage(`outfit${outfit.id}-${expressionType.llm_tag_key}`, finalBuffer, getImageFormat('expression'));
}
