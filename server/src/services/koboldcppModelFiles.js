import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

const MODEL_EXTENSIONS = ['.gguf', '.safetensors'];

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => MODEL_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext)))
    .sort((a, b) => a.localeCompare(b));
}

// Lists model files available for the settings screen's file pickers, so the
// user can pick from what's actually on disk instead of typing a raw path.
export function listModelFiles() {
  return {
    llm: listFiles(path.join(config.koboldcppDir, 'models', 'llm')),
    sd: listFiles(path.join(config.koboldcppDir, 'models', 'sd')),
    anima: listFiles(path.join(config.koboldcppDir, 'models', 'anima')),
  };
}
