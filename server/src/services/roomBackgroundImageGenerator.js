import fs from 'node:fs';
import path from 'node:path';
import { generateTxt2Image, generateImage } from './koboldClient.js';
import { renderPromptTemplate } from './promptTemplate.js';
import { saveRoomImage } from '../storage/imageStorage.js';
import { resolveStylePromptForWorld, resolveDefaultStylePrompt } from '../db/repositories/imageStylePresetsRepo.js';
import { getImageGenerationSettings } from '../db/repositories/imageGenerationSettingsRepo.js';
import { getImageFormat } from '../db/repositories/imageFormatSettingsRepo.js';
import { config } from '../config.js';

function webPathToFsPath(webPath) {
  return path.join(config.imageStorageDir, webPath.replace(/^\/images\//, ''));
}

function buildPrompt(settings, roomTemplate, extraHint) {
  const stylePrompt = roomTemplate.world_id ? resolveStylePromptForWorld(roomTemplate.world_id) : resolveDefaultStylePrompt();
  return renderPromptTemplate(settings.prompt_template, {
    style_preset: stylePrompt,
    location_tags: roomTemplate.location_tags || '',
    atmosphere_tags: roomTemplate.atmosphere_tags || '',
    extra_hint: extraHint,
  });
}

// mode: "fresh" (plain txt2img from location/atmosphere tags + style preset)
// or "refine" (img2img starting from the existing background, using the
// configured denoising_strength — keeps rough composition/mood while
// updating detail/style).
export async function generateRoomBackgroundImage(roomTemplate, mode, extraHint) {
  const settings = getImageGenerationSettings('room_background');
  const prompt = buildPrompt(settings, roomTemplate, extraHint);

  let buffer;
  if (mode === 'refine' && roomTemplate.background_image_path) {
    const initBuffer = fs.readFileSync(webPathToFsPath(roomTemplate.background_image_path));
    buffer = await generateImage({
      initImageBase64: initBuffer.toString('base64'),
      prompt,
      negativePrompt: settings.negative_prompt,
      width: settings.main_width,
      height: settings.main_height,
      steps: settings.steps,
      cfgScale: settings.cfg_scale,
      denoisingStrength: settings.denoising_strength,
      samplerName: settings.sampler_name,
    });
  } else {
    buffer = await generateTxt2Image({
      prompt,
      negativePrompt: settings.negative_prompt,
      width: settings.main_width,
      height: settings.main_height,
      steps: settings.steps,
      cfgScale: settings.cfg_scale,
      samplerName: settings.sampler_name,
    });
  }

  return saveRoomImage(roomTemplate.id, buffer, getImageFormat('scene'));
}
