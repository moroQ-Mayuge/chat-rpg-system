import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Reads PORT from the shared root .env file only (not process.env) — dev
// tooling/hosts commonly set a generic PORT env var of their own for the
// client process itself, which would otherwise get misread as the backend's
// port here and silently proxy API/image calls to the wrong server.
function readBackendPortFromEnvFile() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return null;
  const match = fs.readFileSync(envPath, 'utf-8').match(/^PORT=(.+)$/m);
  return match ? match[1].trim() : null;
}

const backendPort = readBackendPortFromEnvFile() || 3001;
const backendTarget = `http://127.0.0.1:${backendPort}`;

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5180,
    strictPort: false,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/images': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: backendTarget.replace('http', 'ws'),
        ws: true,
      },
    },
  },
});
