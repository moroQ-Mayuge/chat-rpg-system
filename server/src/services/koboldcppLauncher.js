import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { getLaunchSettings } from '../db/repositories/koboldcppLaunchSettingsRepo.js';

function findFirstFile(dir, extension) {
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((f) => f.toLowerCase().endsWith(extension));
  return match ? path.join(dir, match) : null;
}

// Settings-page-picked paths are stored relative to config.koboldcppDir (e.g.
// "models/llm/foo.gguf"), not relative to whatever the Node process's cwd
// happens to be at launch time -- npm workspaces runs this server with cwd
// set to server/, not the repo root, so resolving a bare relative path with
// fs.existsSync()/as a spawn() arg directly would silently look in the wrong
// place (server/models/... instead of koboldcpp/models/...). An
// already-absolute path (e.g. one typed by hand, like sd_lora_path
// historically) is left untouched.
function resolveModelPath(storedPath) {
  if (!storedPath) return storedPath;
  return path.isAbsolute(storedPath) ? storedPath : path.join(config.koboldcppDir, storedPath);
}

function resolveExePath() {
  const direct = path.join(config.koboldcppDir, 'koboldcpp.exe');
  if (fs.existsSync(direct)) return direct;
  // This repo's own dev koboldcpp/ folder happens to nest the exe under models/.
  const nested = path.join(config.koboldcppDir, 'models', 'koboldcpp.exe');
  if (fs.existsSync(nested)) return nested;
  return null;
}

// Spawns koboldcpp.exe as a detached background process (independent of this
// Node process, which under `node --watch` restarts on any file change and
// would otherwise kill a directly-attached child). Auto-detects the exe and
// model files the same way start-koboldcpp.bat does, since both are meant to
// work against the same koboldcpp/ folder layout described in
// release-assets/koboldcpp-README.txt.
export function launchKoboldcpp() {
  const exePath = resolveExePath();
  if (!exePath) {
    throw new Error('koboldcpp.exeが見つかりません。koboldcpp/koboldcpp.exe に配置してください。');
  }

  const settings = getLaunchSettings();
  const { sd_quant, sd_lora_multiplier, sd_architecture } = settings;
  const llm_model_path = resolveModelPath(settings.llm_model_path);
  const sd_model_path = resolveModelPath(settings.sd_model_path);
  const sd_lora_path = resolveModelPath(settings.sd_lora_path);
  const sd_vae_path = resolveModelPath(settings.sd_vae_path);
  const sd_clip1_path = resolveModelPath(settings.sd_clip1_path);
  const isAnima = sd_architecture === 'anima';

  const llmModel = llm_model_path || findFirstFile(path.join(config.koboldcppDir, 'models', 'llm'), '.gguf');
  if (!llmModel) {
    throw new Error('テキストモデル（.gguf）が見つかりません。koboldcpp/models/llm/ に配置するか、設定画面でパスを指定してください。');
  }
  if (llm_model_path && !fs.existsSync(llm_model_path)) {
    throw new Error(`指定されたテキストモデルのパスが見つかりません: ${llm_model_path}`);
  }

  // Anima's model files live under models/anima/ (a separate architecture,
  // not interchangeable with plain SD checkpoints under models/sd/).
  const sdModelDir = isAnima ? 'anima' : 'sd';
  const sdModel = sd_model_path || findFirstFile(path.join(config.koboldcppDir, 'models', sdModelDir), '.safetensors');
  if (sd_model_path && !fs.existsSync(sd_model_path)) {
    throw new Error(`指定された画像生成モデルのパスが見つかりません: ${sd_model_path}`);
  }
  if (sd_lora_path && !fs.existsSync(sd_lora_path)) {
    throw new Error(`指定されたLoRAのパスが見つかりません: ${sd_lora_path}`);
  }
  if (isAnima) {
    if (!sd_vae_path || !sd_clip1_path) {
      throw new Error('Animaアーキテクチャを使用するにはVAEとCLIPのモデルファイルを設定画面で指定してください。');
    }
    if (!fs.existsSync(sd_vae_path)) {
      throw new Error(`指定されたVAEのパスが見つかりません: ${sd_vae_path}`);
    }
    if (!fs.existsSync(sd_clip1_path)) {
      throw new Error(`指定されたCLIPのパスが見つかりません: ${sd_clip1_path}`);
    }
  }
  // KoboldCpp rejects this combination outright at startup (confirmed via its
  // actual argparse error: "argument --sdlora: not allowed with argument
  // --sdquant") — caught here before spawning so the failure is immediate
  // and in Japanese, instead of a silent background process crash.
  if (sd_lora_path && sd_quant > 0) {
    throw new Error('LoRA使用時は画像生成モデルの量子化ロード（sdquant）を併用できません。設定画面でどちらか一方をオフにしてください。');
  }

  const port = new URL(config.koboldBaseUrl).port || '5001';

  const args = ['--model', llmModel, '--port', port, '--contextsize', '8192', '--gpulayers', '999'];
  if (sdModel) {
    args.push('--sdmodel', sdModel);
    if (isAnima) {
      args.push('--sdvae', sd_vae_path, '--sdclip1', sd_clip1_path);
    }
    // KoboldCpp has no fp8 loading mode — --sdquant is the closest equivalent
    // it actually supports (0=off, 1=q8, 2=q4).
    if (sd_quant > 0) args.push('--sdquant', String(sd_quant));
    // Lets a speed-up LoRA (e.g. an SDXL-Lightning-style checkpoint) be
    // applied to SD models that don't already bake one in.
    if (sd_lora_path) args.push('--sdlora', sd_lora_path, '--sdloramult', String(sd_lora_multiplier));
  }

  fs.mkdirSync(path.dirname(config.koboldcppLogPath), { recursive: true });
  const logFd = fs.openSync(config.koboldcppLogPath, 'a');

  const child = spawn(exePath, args, {
    cwd: path.dirname(exePath),
    detached: true,
    stdio: ['ignore', logFd, logFd],
  });
  child.unref();

  return { pid: child.pid, sdModelIncluded: Boolean(sdModel), port };
}
