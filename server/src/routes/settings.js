import { Router } from 'express';
import os from 'node:os';
import { config } from '../config.js';
import { getModelStatus, getSdModelStatus, generateTxt2Image } from '../services/koboldClient.js';
import { enqueueImageJob } from '../services/imageQueue.js';
import { saveTestImage } from '../storage/imageStorage.js';
import {
  listStylePresets,
  createStylePreset,
  updateStylePreset,
  deleteStylePreset,
  getStylePreset,
  getDefaultStylePreset,
} from '../db/repositories/imageStylePresetsRepo.js';
import { listImageFormats, setImageFormat } from '../db/repositories/imageFormatSettingsRepo.js';

export const settingsRouter = Router();

function lanAddresses() {
  const results = [];
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const addr of iface ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) results.push(addr.address);
    }
  }
  return results;
}

async function checkTextModel() {
  try {
    const status = await getModelStatus();
    return { connected: Boolean(status?.result), modelName: status?.result ?? null };
  } catch {
    return { connected: false, modelName: null };
  }
}

async function checkSdModel() {
  try {
    const status = await getSdModelStatus();
    const model = Array.isArray(status) ? status[0] : null;
    return { connected: Array.isArray(status) && status.length > 0, modelName: model?.model_name ?? null };
  } catch {
    return { connected: false, modelName: null };
  }
}

settingsRouter.get('/status', async (req, res) => {
  const [textModel, sdModel] = await Promise.all([checkTextModel(), checkSdModel()]);
  res.json({
    koboldBaseUrl: config.koboldBaseUrl,
    textModel,
    sdModel,
    lanAddresses: lanAddresses(),
  });
});

settingsRouter.get('/style-presets', (req, res) => {
  res.json(listStylePresets());
});

settingsRouter.post('/style-presets', (req, res) => {
  if (!req.body.name) return res.status(400).json({ error: 'name_required' });
  res.status(201).json(createStylePreset(req.body));
});

settingsRouter.put('/style-presets/:id', (req, res) => {
  res.json(updateStylePreset(req.params.id, req.body));
});

settingsRouter.delete('/style-presets/:id', (req, res) => {
  try {
    res.json(deleteStylePreset(req.params.id));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

settingsRouter.get('/image-formats', (req, res) => {
  res.json(listImageFormats());
});

settingsRouter.put('/image-formats/:kind', (req, res) => {
  if (!['png', 'jpg'].includes(req.body.format)) return res.status(400).json({ error: 'invalid_format' });
  res.json(setImageFormat(req.params.kind, req.body.format));
});

// Standalone prompt-in/image-out tool (Settings page) for experimenting with
// prompts and style presets — not tied to any character/room/session.
settingsRouter.post('/test-generate-image', (req, res) => {
  const { prompt, negative_prompt, width = 832, height = 1216, steps, cfg_scale, style_preset_id, format = 'png' } = req.body;

  enqueueImageJob(async () => {
    try {
      const preset = style_preset_id ? getStylePreset(style_preset_id) : getDefaultStylePreset();
      const combinedPrompt = [preset?.prompt_text, prompt].filter(Boolean).join(', ');
      const buffer = await generateTxt2Image({
        prompt: combinedPrompt,
        negativePrompt: negative_prompt,
        steps,
        cfgScale: cfg_scale,
        width,
        height,
      });
      const imagePath = await saveTestImage(buffer, format);
      res.json({ imagePath, prompt: combinedPrompt });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });
});
