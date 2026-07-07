import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';

async function encode(buffer, format) {
  if (format === 'jpg') return sharp(buffer).jpeg({ quality: 90 }).toBuffer();
  return buffer;
}

function extensionFor(format) {
  return format === 'jpg' ? 'jpg' : 'png';
}

export async function saveGeneratedImage(roomSessionId, buffer, format = 'png') {
  const dir = path.join(config.imageStorageDir, 'scenes', String(roomSessionId));
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}.${extensionFor(format)}`;
  fs.writeFileSync(path.join(dir, filename), await encode(buffer, format));
  return `/images/scenes/${roomSessionId}/${filename}`;
}

// Saves a generated (as opposed to uploaded) character/outfit image alongside
// the existing multer-uploaded ones under storage/images/characters/, so both
// paths resolve through the same /images/characters/ static route.
export async function saveCharacterImage(prefix, buffer, format = 'png') {
  const dir = path.join(config.imageStorageDir, 'characters');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${prefix}-${Date.now()}.${extensionFor(format)}`;
  fs.writeFileSync(path.join(dir, filename), await encode(buffer, format));
  return `/images/characters/${filename}`;
}

// Standalone test-generation tool output (Settings page) — not tied to any
// character/session, purely for experimenting with prompts/style presets.
export async function saveTestImage(buffer, format = 'png') {
  const dir = path.join(config.imageStorageDir, 'test');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}.${extensionFor(format)}`;
  fs.writeFileSync(path.join(dir, filename), await encode(buffer, format));
  return `/images/test/${filename}`;
}

// RoomTemplate background image, alongside the existing multer-uploaded ones
// under storage/images/rooms/ (matches routes/roomTemplates.js's upload naming).
export async function saveRoomImage(roomTemplateId, buffer, format = 'png') {
  const dir = path.join(config.imageStorageDir, 'rooms');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${roomTemplateId}-${Date.now()}.${extensionFor(format)}`;
  fs.writeFileSync(path.join(dir, filename), await encode(buffer, format));
  return `/images/rooms/${filename}`;
}

// World representative/thumbnail image.
export async function saveWorldImage(worldId, buffer, format = 'png') {
  const dir = path.join(config.imageStorageDir, 'worlds');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${worldId}-${Date.now()}.${extensionFor(format)}`;
  fs.writeFileSync(path.join(dir, filename), await encode(buffer, format));
  return `/images/worlds/${filename}`;
}
