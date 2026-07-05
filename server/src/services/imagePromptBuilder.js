import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/connection.js';
import { config } from '../config.js';
import { generateChatCompletion } from './koboldClient.js';

const ANCHOR_WIDTH = 200;

export const MAIN_WIDTH = 1216;
export const MAIN_HEIGHT = 832;

// Translates a freeform [SCENE_CHANGE] description into danbooru tags, since
// the model only emits Japanese prose for scene changes but image generation
// needs structured tags (mirrors characterAssist.js's suggestDanbooruTags).
export async function suggestSceneTags(description) {
  if (!description) return '';
  const systemPrompt = [
    '以下の日本語のシーン描写を、画像生成に使うdanbooruタグに変換してください。',
    '出力は半角カンマ区切りの英単語タグのみとし、日本語・説明文・見出し・表・箇条書き記号は一切含めないでください。',
    '出力形式の例：classroom, indoors, window, sunset, empty_desks',
  ].join('\n');

  const rawText = await generateChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: description },
    ],
    maxTokens: 150,
    temperature: 0.5,
  });

  return rawText
    .split(',')
    .map((t) => t.trim().replace(/\.$/, ''))
    .filter((t) => t && /^[a-zA-Z0-9_():.\s-]+$/.test(t) && t.length <= 40)
    .join(', ');
}

function webPathToFsPath(webPath) {
  return path.join(config.imageStorageDir, webPath.replace(/^\/images\//, ''));
}

// Composes the danbooru tag prompt per SPEC.md 3.7 composition order:
// location/atmosphere tags -> prop tags -> present characters' outfit tags.
// Free-text-only fields (location/atmosphere prose, library-external props)
// are intentionally excluded — they're LLM context only, not image tags.
export function buildSceneTagPrompt(session, participants) {
  const template = db.prepare('SELECT * FROM room_templates WHERE id = ?').get(session.room_template_id);
  const parts = [];

  if (session.current_location_tags) parts.push(session.current_location_tags);
  if (session.current_atmosphere_tags) parts.push(session.current_atmosphere_tags);

  const propTags = db
    .prepare(
      `SELECT p.danbooru_tags FROM room_template_props rtp
       JOIN props p ON p.id = rtp.prop_id
       WHERE rtp.room_template_id = ?`,
    )
    .all(template.id)
    .map((r) => r.danbooru_tags)
    .filter(Boolean);
  parts.push(...propTags);

  for (const participant of participants) {
    if (!participant.current_outfit_id) continue;
    const outfit = db.prepare('SELECT image_tags FROM outfits WHERE id = ?').get(participant.current_outfit_id);
    if (outfit?.image_tags) parts.push(outfit.image_tags);
  }

  return parts.filter(Boolean).join(', ');
}

// Builds the reference-anchor canvas + mask (SPEC.md 3.7): reference standing
// images are stacked in a protected left column; the remaining region (at the
// target output size) is what actually gets generated. Returns base64 PNG
// strings ready for koboldClient.generateImage, plus the crop offset needed
// to extract just the generated region afterward.
export async function buildReferenceAnchorCanvas(referenceImageWebPaths, mainWidth = MAIN_WIDTH, mainHeight = MAIN_HEIGHT) {
  const validPaths = referenceImageWebPaths.filter(Boolean).map(webPathToFsPath).filter((p) => fs.existsSync(p));
  const anchorOffset = validPaths.length > 0 ? ANCHOR_WIDTH : 0;
  const canvasWidth = mainWidth + anchorOffset;
  const canvasHeight = mainHeight;

  const canvasComposites = [];
  const maskComposites = [];

  if (validPaths.length > 0) {
    const slotHeight = Math.floor(canvasHeight / validPaths.length);
    for (let i = 0; i < validPaths.length; i += 1) {
      const resized = await sharp(validPaths[i]).resize(ANCHOR_WIDTH, slotHeight, { fit: 'cover' }).toBuffer();
      canvasComposites.push({ input: resized, left: 0, top: i * slotHeight });
    }
    const blackColumn = await sharp({
      create: { width: ANCHOR_WIDTH, height: canvasHeight, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    maskComposites.push({ input: blackColumn, left: 0, top: 0 });
  }

  const canvasBuffer = await sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 3, background: { r: 128, g: 128, b: 128 } },
  })
    .composite(canvasComposites)
    .png()
    .toBuffer();

  const maskBuffer = await sharp({
    create: { width: canvasWidth, height: canvasHeight, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite(maskComposites)
    .png()
    .toBuffer();

  return {
    canvasBase64: canvasBuffer.toString('base64'),
    maskBase64: maskBuffer.toString('base64'),
    canvasWidth,
    canvasHeight,
    anchorOffset,
  };
}

// KoboldCpp's img2img does not reliably return an image at the exact
// width/height requested (verified empirically: a 1416x832 request came back
// as 1280x768) — so the result is resized back to the exact canvas dimensions
// before extracting, rather than trusting the backend's output size directly.
export async function cropMainRegion(resultBuffer, anchorOffset, mainWidth = MAIN_WIDTH, mainHeight = MAIN_HEIGHT) {
  const canvasWidth = mainWidth + anchorOffset;
  const resized = await sharp(resultBuffer).resize(canvasWidth, mainHeight, { fit: 'fill' }).toBuffer();
  return sharp(resized).extract({ left: anchorOffset, top: 0, width: mainWidth, height: mainHeight }).png().toBuffer();
}
