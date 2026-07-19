import { Router } from 'express';
import os from 'node:os';
import { config } from '../config.js';
import { getModelStatus, getSdModelStatus, getSamplers, generateTxt2Image } from '../services/koboldClient.js';
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
import { listImageGenerationSettings, updateImageGenerationSettings } from '../db/repositories/imageGenerationSettingsRepo.js';
import { launchKoboldcpp } from '../services/koboldcppLauncher.js';
import { getLaunchSettings, updateLaunchSettings } from '../db/repositories/koboldcppLaunchSettingsRepo.js';
import { listModelFiles } from '../services/koboldcppModelFiles.js';
import { testGenerateForKind } from '../services/imageSettingsTestGenerator.js';
import { getStatusDisplayPreferences, updateStatusDisplayPreferences } from '../db/repositories/statusDisplayPreferencesRepo.js';
import { getGenerationSettings, updateGenerationSettings } from '../db/repositories/llmGenerationSettingsRepo.js';

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

// Static fallback so the Settings UI still offers sampler choices when
// KoboldCpp isn't reachable (e.g. editing settings before starting it).
const FALLBACK_SAMPLERS = ['Euler a', 'Euler', 'Heun', 'DPM2', 'DPM++ 2M', 'DDIM', 'LCM'];

settingsRouter.get('/samplers', async (req, res) => {
  try {
    const samplers = await getSamplers();
    res.json(samplers?.length ? samplers.map((s) => s.name) : FALLBACK_SAMPLERS);
  } catch {
    res.json(FALLBACK_SAMPLERS);
  }
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

settingsRouter.get('/koboldcpp-launch-settings', (req, res) => {
  res.json(getLaunchSettings());
});

settingsRouter.put('/koboldcpp-launch-settings', (req, res) => {
  if (![0, 1, 2].includes(req.body.sd_quant)) return res.status(400).json({ error: 'invalid_sd_quant' });
  if (req.body.sd_architecture && !['sd', 'anima'].includes(req.body.sd_architecture)) {
    return res.status(400).json({ error: 'invalid_sd_architecture' });
  }
  res.json(updateLaunchSettings(req.body));
});

settingsRouter.get('/koboldcpp-model-files', (req, res) => {
  res.json(listModelFiles());
});

settingsRouter.get('/llm-generation-settings', (req, res) => {
  res.json(getGenerationSettings());
});

settingsRouter.put('/llm-generation-settings', (req, res) => {
  res.json(updateGenerationSettings(req.body));
});

settingsRouter.get('/status-display-preferences', (req, res) => {
  res.json(getStatusDisplayPreferences());
});

settingsRouter.put('/status-display-preferences', (req, res) => {
  res.json(updateStatusDisplayPreferences(req.body));
});

settingsRouter.post('/start-koboldcpp', (req, res) => {
  try {
    const result = launchKoboldcpp();
    res.json({ started: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

settingsRouter.get('/image-generation-settings', (req, res) => {
  res.json(listImageGenerationSettings());
});

settingsRouter.put('/image-generation-settings/:kind', (req, res) => {
  res.json(updateImageGenerationSettings(req.params.kind, req.body));
});

// Test-generates using the settings values currently in the edit form (which
// may not be saved yet) against a real sample record (lowest id) for that
// kind's placeholders — lets the user preview a prompt/parameter edit before
// committing it.
settingsRouter.post('/image-generation-settings/:kind/test-generate', (req, res) => {
  enqueueImageJob(async () => {
    try {
      const { previewFullCanvas, ...settings } = req.body;
      const result = await testGenerateForKind(req.params.kind, settings, { previewFullCanvas });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
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
