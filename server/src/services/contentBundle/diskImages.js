import fs from 'node:fs';
import path from 'node:path';
import { config } from '../../config.js';

// Every stored image path in this app is served at /images/... directly off
// config.imageStorageDir (see index.js's static mount) — resolve back to the
// real file for reading into a bundle at export time.
function readStoredImage(dbPath) {
  if (!dbPath) return null;
  const diskPath = path.join(config.imageStorageDir, dbPath.replace(/^\/images\//, ''));
  if (!fs.existsSync(diskPath)) return null;
  return { buffer: fs.readFileSync(diskPath), ext: path.extname(diskPath).replace('.', '') || 'png' };
}

// Collects image files referenced during a bundle export, assigning each a
// unique zip-relative path and skipping anything null/missing on disk.
export function createImageCollector() {
  const entries = [];
  let counter = 0;
  function add(dbPath, kindLabel) {
    const stored = readStoredImage(dbPath);
    if (!stored) return null;
    counter += 1;
    const zipPath = `images/${kindLabel}-${counter}.${stored.ext}`;
    entries.push({ zipPath, buffer: stored.buffer });
    return zipPath;
  }
  return { add, entries };
}

export function extensionOf(zipPath) {
  const ext = zipPath.split('.').pop();
  return ext === 'jpg' ? 'jpg' : 'png';
}
