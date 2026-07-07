import { generateTxt2Image } from './koboldClient.js';
import { renderPromptTemplate } from './promptTemplate.js';
import { saveWorldImage } from '../storage/imageStorage.js';
import { resolveStylePromptForWorld } from '../db/repositories/imageStylePresetsRepo.js';
import { getImageGenerationSettings } from '../db/repositories/imageGenerationSettingsRepo.js';

// Plain txt2img from the World's own image_tags — a World has no single
// character/room to anchor a reference image against, so this is always a
// fresh generation (like Outfit standing images), not reference-anchor based.
export async function generateWorldThumbnail(world, extraHint) {
  const settings = getImageGenerationSettings('world_thumbnail');
  const prompt = renderPromptTemplate(settings.prompt_template, {
    style_preset: resolveStylePromptForWorld(world.id),
    world_tags: world.image_tags,
    extra_hint: extraHint,
  });
  const buffer = await generateTxt2Image({
    prompt,
    width: settings.main_width,
    height: settings.main_height,
    steps: settings.steps,
    cfgScale: settings.cfg_scale,
    samplerName: settings.sampler_name,
  });
  return saveWorldImage(world.id, buffer, 'png');
}
