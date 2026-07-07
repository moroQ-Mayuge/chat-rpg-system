import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function resolveFromRoot(relativePath) {
  return path.resolve(__dirname, '../../', relativePath);
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  host: process.env.HOST || '0.0.0.0',
  koboldBaseUrl: process.env.KOBOLD_BASE_URL || 'http://127.0.0.1:5001',
  dbPath: resolveFromRoot(process.env.DB_PATH || './data/chatrpg.sqlite'),
  imageStorageDir: resolveFromRoot(process.env.IMAGE_STORAGE_DIR || './storage/images'),
  koboldcppDir: resolveFromRoot(process.env.KOBOLDCPP_DIR || './koboldcpp'),
  koboldcppLogPath: resolveFromRoot('./data/koboldcpp.log'),
};
