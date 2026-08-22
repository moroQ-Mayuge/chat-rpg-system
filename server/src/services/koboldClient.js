import { config } from '../config.js';
import { getGenerationSettings } from '../db/repositories/llmGenerationSettingsRepo.js';

// ── GPU実行の直列化 ────────────────────────────────────────────
// KoboldCppはLLMと画像生成を同一プロセス・同一VRAMで抱えている。両者が重なると
// ピークVRAMが加算され、16GB級のカードでもSDXLサイズの画像生成中に落ちる。
//
// 実ログでの裏付け(24セッション分の起動ログを解析):
//   ・14/24が画像生成中または直後に終了。うち5回は進捗バーの途中(例 19/25)で
//     消えており、正常終了ではあり得ない
//   ・ログ全体で唯一の明示エラーが「KCPP SD generate failed!」
//   ・Windowsイベントログにクラッシュ記録もGPUのTDRも無い＝例外ではなく
//     ネイティブ側でVRAM確保に失敗して即死している形
// 発生条件も特定できている: roomSessions.jsは[SCENE_CHANGE]を受け取った時点、
// つまり *LLMがまだストリーミング生成している最中* に画像ジョブを投入する。
// imageQueue.jsは画像ジョブ同士しか直列化しないため、ここが唯一の防波堤になる。
//
// ロックをこの3関数(LLM生成・img2img・txt2img)に限定するのは意図的。
// 画像ジョブ(generateSceneImage)は内部でsuggestSceneTags経由でLLMを呼ぶので、
// ジョブ全体をロックするとLLM呼び出しが自分自身のロックを待ってデッドロックする。
// この粒度なら両者は逐次に取得・解放されるだけで入れ子にならない。
//
// 軽量なgetModelStatus/countTokens/getMaxContextLengthは対象外(ブロックさせない)。
let gpuChain = Promise.resolve();

function runOnGpu(fn) {
  const run = gpuChain.then(fn);
  // 失敗しても後続を止めない(1回の生成失敗でキュー全体が固まらないように)
  gpuChain = run.then(
    () => {},
    () => {},
  );
  return run;
}

// 直列化した以上、1本でも永久に返ってこない呼び出しがあるとチェーン全体が
// 二度と進まなくなる＝以後あらゆる生成が沈黙する(「キャラ編集中にサーバーが
// 応答しなくなる」の正体)。KoboldCppはプロセスが生きたまま応答だけ止まること
// があり、Node のfetchには既定のタイムアウトが無いため、明示的に打ち切る。
//
// 値は「正常な生成を誤って殺さない」ことを優先した余裕のある上限。実測では
// LLM生成が数秒、画像生成が数秒〜十数秒で、sdoffloadcpu有効時のモデル読み込み
// を含めても遠く及ばない。
const LLM_TIMEOUT_MS = 180_000;
const IMAGE_TIMEOUT_MS = 300_000;

function isTimeoutError(err) {
  return err?.name === 'TimeoutError' || err?.name === 'AbortError' || err?.cause?.name === 'TimeoutError';
}

function describeTimeout(kind, ms) {
  return new Error(
    `KoboldCppが${Math.round(ms / 1000)}秒以内に応答しませんでした（${kind}）。処理を打ち切ります。プロセスは生きているが停止している可能性があるため、設定画面の「KoboldCpp起動ログ」を確認し、必要なら再起動してください。`,
  );
}

// KoboldCppが落ちている時のfetch失敗は "fetch failed" としか出ず、画面にもその
// まま出て原因が分からなかった。落ちた可能性に言及するメッセージへ言い換える。
function describeConnectionError(err) {
  const cause = err?.cause?.code ?? '';
  if (cause === 'ECONNREFUSED' || cause === 'ECONNRESET' || cause === 'UND_ERR_SOCKET') {
    return new Error(
      `KoboldCppに接続できません（${config.koboldBaseUrl}）。生成中に停止した可能性があります。設定画面の「KoboldCpp起動ログ」で直前の出力を確認できます。`,
    );
  }
  return err;
}

// Sole contact point with KoboldCpp. Uses the OpenAI-compatible /v1/chat/completions
// endpoint rather than the raw /api/v1/generate endpoint: the raw endpoint applies no
// chat template and produced incoherent completions when verified against the actual
// running instance, whereas /v1/chat/completions correctly applies the model's detected
// chat template for both streaming and non-streaming calls.
//
// temperature/repPen/repPenRange/topP/topK/minP default to the user-configurable
// llm_generation_settings row (Settings screen) rather than a hardcoded value,
// so every call site benefits from the same anti-repetition tuning without
// having to pass these explicitly. Callers can still override any of them.
// rep_pen/rep_pen_range/top_p/top_k/min_p are KoboldCpp-specific extensions
// to the OpenAI-compatible schema, sent as extra JSON fields.
export async function generateChatCompletion({
  messages,
  maxTokens = 512,
  temperature,
  repPen,
  repPenRange,
  topP,
  topK,
  minP,
  stop,
  stream = false,
  onToken,
}) {
  const defaults =
    temperature === undefined ||
    repPen === undefined ||
    repPenRange === undefined ||
    topP === undefined ||
    topK === undefined ||
    minP === undefined
      ? getGenerationSettings()
      : null;

  // ストリーミングではfetchはヘッダ受信で解決し、その後も本文が流れ続ける＝
  // GPUを掴んだままになる。ロックは本文を読み切るまで保持しないと意味が無いので、
  // 生成の全体をrunOnGpuの中に入れる。
  return runOnGpu(async () => {
    let res;
    try {
      res = await fetch(`${config.koboldBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        body: JSON.stringify({
          model: 'kobold',
          messages,
          max_tokens: maxTokens,
          temperature: temperature ?? defaults.temperature,
          rep_pen: repPen ?? defaults.rep_pen,
          rep_pen_range: repPenRange ?? defaults.rep_pen_range,
          top_p: topP ?? defaults.top_p,
          top_k: topK ?? defaults.top_k,
          min_p: minP ?? defaults.min_p,
          stop,
          stream,
        }),
      });
    } catch (err) {
      throw isTimeoutError(err) ? describeTimeout('テキスト生成', LLM_TIMEOUT_MS) : describeConnectionError(err);
    }

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

    for (;;) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (err) {
        // 生成の途中でKoboldCppが落ちる/応答が止まるとここで切れる。それまでに
        // 受け取った分は捨てずに返す(部分的でも表示できた方が、無言で消えるより
        // ましなため)。タイムアウトでも同様に打ち切ってロックを解放する。
        if (fullText) return fullText;
        throw isTimeoutError(err) ? describeTimeout('テキスト生成', LLM_TIMEOUT_MS) : describeConnectionError(err);
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice('data:'.length).trim();
        if (payload === '[DONE]') continue;
        let json;
        try {
          json = JSON.parse(payload);
        } catch {
          // 壊れたSSEチャンクで生成全体を落とさない
          continue;
        }
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          fullText += delta;
          onToken?.(delta);
        }
      }
    }

    return fullText;
  });
}

export async function getModelStatus() {
  const res = await fetch(`${config.koboldBaseUrl}/api/v1/model`);
  if (!res.ok) return null;
  return res.json();
}

// Both helpers below return null instead of throwing when KoboldCpp can't be
// reached: they exist to SIZE the prompt, and a sizing failure must never take
// down generation itself — callers fall back to their own estimate.

// The running instance's actual context window (its --contextsize). Asking the
// server rather than trusting our own launch setting means this stays correct
// even when KoboldCpp was started outside the app. Re-fetched on a short TTL
// since it can be restarted with a different value mid-session.
const CONTEXT_LENGTH_TTL_MS = 60_000;
let contextLengthCache = { value: null, at: 0 };

export async function getMaxContextLength() {
  if (contextLengthCache.value != null && Date.now() - contextLengthCache.at < CONTEXT_LENGTH_TTL_MS) {
    return contextLengthCache.value;
  }
  try {
    const res = await fetch(`${config.koboldBaseUrl}/api/extra/true_max_context_length`);
    if (!res.ok) return null;
    const value = (await res.json())?.value;
    if (!(value > 0)) return null;
    contextLengthCache = { value, at: Date.now() };
    return value;
  } catch {
    return null;
  }
}

// モデル評価でkoboldcppを別モデルで再起動した直後は、TTLが切れるまで前モデルの
// コンテキスト長を返してしまいプロンプトのサイズ計算がずれる。切替側から明示的に
// 捨てられるようにする(modelEval/runner.jsのwaitForModelReadyが呼ぶ)。
export function invalidateContextLengthCache() {
  contextLengthCache = { value: null, at: 0 };
}

export async function countTokens(text) {
  try {
    const res = await fetch(`${config.koboldBaseUrl}/api/extra/tokencount`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text }),
    });
    if (!res.ok) return null;
    const value = (await res.json())?.value;
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
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
  return runOnGpu(async () => {
    let res;
    try {
      res = await fetch(`${config.koboldBaseUrl}/sdapi/v1/img2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
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
    } catch (err) {
      throw isTimeoutError(err) ? describeTimeout('画像生成', IMAGE_TIMEOUT_MS) : describeConnectionError(err);
    }

    if (!res.ok) {
      throw new Error(`KoboldCpp image request failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return Buffer.from(data.images[0], 'base64');
  });
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
  return runOnGpu(async () => {
    let res;
    try {
      res = await fetch(`${config.koboldBaseUrl}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS),
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
    } catch (err) {
      throw isTimeoutError(err) ? describeTimeout('画像生成', IMAGE_TIMEOUT_MS) : describeConnectionError(err);
    }

    if (!res.ok) {
      throw new Error(`KoboldCpp image request failed: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    return Buffer.from(data.images[0], 'base64');
  });
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
