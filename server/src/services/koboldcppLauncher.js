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

  const { llm_model_path, sd_model_path, sd_quant } = getLaunchSettings();

  const llmModel = llm_model_path || findFirstFile(path.join(config.koboldcppDir, 'models', 'llm'), '.gguf');
  if (!llmModel) {
    throw new Error('テキストモデル（.gguf）が見つかりません。koboldcpp/models/llm/ に配置するか、設定画面でパスを指定してください。');
  }
  if (llm_model_path && !fs.existsSync(llm_model_path)) {
    throw new Error(`指定されたテキストモデルのパスが見つかりません: ${llm_model_path}`);
  }

  const sdModel = sd_model_path || findFirstFile(path.join(config.koboldcppDir, 'models', 'sd'), '.safetensors');
  if (sd_model_path && !fs.existsSync(sd_model_path)) {
    throw new Error(`指定された画像生成モデルのパスが見つかりません: ${sd_model_path}`);
  }

  const port = new URL(config.koboldBaseUrl).port || '5001';

  const args = ['--model', llmModel, '--port', port, '--contextsize', '8192', '--gpulayers', '999'];
  if (sdModel) {
    args.push('--sdmodel', sdModel);
    // KoboldCpp has no fp8 loading mode — --sdquant is the closest equivalent
    // it actually supports (0=off, 1=q8, 2=q4).
    if (sd_quant > 0) args.push('--sdquant', String(sd_quant));
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
