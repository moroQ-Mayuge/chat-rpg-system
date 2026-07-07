import { config } from '../config.js';

// Sole contact point with KoboldCpp. Uses the OpenAI-compatible /v1/chat/completions
// endpoint rather than the raw /api/v1/generate endpoint: the raw endpoint applies no
// chat template and produced incoherent completions when verified against the actual
// running instance, whereas /v1/chat/completions correctly applies the model's detected
// chat template for both streaming and non-streaming calls.
export async function generateChatCompletion({ messages, maxTokens = 512, temperature = 0.8, stop, stream = false, onToken }) {
  const res = await fetch(`${config.koboldBaseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'kobold',
      messages,
      max_tokens: maxTokens,
      temperature,
      stop,
      stream,
    }),
  });

  if (!res.ok) {
    throw new Error(`KoboldCpp request failed: ${res.status} ${await res.text()}`);
  }

  if (!stream) {
    const data = await res.json();
    return data.choices[0].message.content;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice('data:'.length).trim();
      if (payload === '[DONE]') continue;
      const json = JSON.parse(payload);
      const delta = json.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        onToken?.(delta);
      }
    }
  }

  return fullText;
}

export async function getModelStatus() {
  const res = await fetch(`${config.koboldBaseUrl}/api/v1/model`);
  if (!res.ok) return null;
  return res.json();
}

// Image generation always goes through img2img (not txt2img), since every
// generation uses the reference-anchor inpainting technique (SPEC.md 3.7):
// a wider canvas with protected reference-image regions plus a mask, so
// IP-Adapter-less KoboldCpp/stable-diffusion.cpp can still keep character
// appearance consistent. initImageBase64/maskBase64 are raw base64 PNG
// strings (no data: prefix).
export async function generateImage({
  initImageBase64,
  maskBase64,
  prompt,
  negativePrompt = 'worst quality, low quality',
  steps = 6,
  cfgScale = 2,
  width,
  height,
  samplerName = 'Euler a',
  denoisingStrength = 0.75,
}) {
  const res = await fetch(`${config.koboldBaseUrl}/sdapi/v1/img2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      init_images: [initImageBase64],
      mask: maskBase64,
      prompt,
      negative_prompt: negativePrompt,
      steps,
      cfg_scale: cfgScale,
      width,
      height,
      sampler_name: samplerName,
      denoising_strength: denoisingStrength,
    }),
  });

  if (!res.ok) {
    throw new Error(`KoboldCpp image request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return Buffer.from(data.images[0], 'base64');
}

// Plain txt2img (no init image/mask) — used for generating a fresh Outfit
// standing image, which has no prior reference to stay consistent with.
export async function generateTxt2Image({
  prompt,
  negativePrompt = 'worst quality, low quality',
  steps = 6,
  cfgScale = 2,
  width,
  height,
  samplerName = 'Euler a',
}) {
  const res = await fetch(`${config.koboldBaseUrl}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      negative_prompt: negativePrompt,
      steps,
      cfg_scale: cfgScale,
      width,
      height,
      sampler_name: samplerName,
    }),
  });

  if (!res.ok) {
    throw new Error(`KoboldCpp image request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return Buffer.from(data.images[0], 'base64');
}

export async function getSdModelStatus() {
  const res = await fetch(`${config.koboldBaseUrl}/sdapi/v1/sd-models`);
  if (!res.ok) return null;
  return res.json();
}

export async function getSamplers() {
  const res = await fetch(`${config.koboldBaseUrl}/sdapi/v1/samplers`);
  if (!res.ok) return null;
  return res.json();
}
