import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/connection.js';
import { config } from '../config.js';
import { generateChatCompletion } from './koboldClient.js';
import { resolveOutfitTags, getActiveOutfitStatusModifiers } from './outfitTagCategories.js';
import { composeWornOutfit } from './outfitComposition.js';
import { getOutfitExposureTagSettings } from '../db/repositories/outfitExposureTagSettingsRepo.js';
import { getPlaythrough } from '../db/repositories/playthroughsRepo.js';
import { getWorld } from '../db/repositories/worldsRepo.js';

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

// Splits out the danbooru tag sources for a scene per SPEC.md 3.7 composition
// order (location/atmosphere tags -> prop tags -> present characters' outfit
// tags) as separate fields, for substitution into a per-kind prompt template
// (${location_tags}, ${atmosphere_tags}, ${prop_tags}, ${character_tags},
// ${weather_tags}, ${time_slot_tags}). Free-text-only fields (location/
// atmosphere prose, library-external props) are intentionally excluded —
// they're LLM context only, not image tags.
export function buildSceneTagParts(session, participants) {
  const template = db.prepare('SELECT * FROM room_templates WHERE id = ?').get(session.room_template_id);

  // Props are placed per-World now (rooms are shared master data, see
  // 0030_room_world_decoupling.sql) — resolve the World from the session's
  // playthrough rather than the room itself.
  const playthrough = getPlaythrough(session.playthrough_id);
  const worldId = playthrough.world_id;
  const world = getWorld(worldId);
  const propTags = db
    .prepare(
      `SELECT p.danbooru_tags FROM world_room_props wrp
       JOIN props p ON p.id = wrp.prop_id
       WHERE wrp.world_id = ? AND wrp.room_template_id = ?`,
    )
    .all(worldId, template.id)
    .map((r) => r.danbooru_tags)
    .filter(Boolean)
    .join(', ');

  // Threads undress-state suppression/disturbance (and, via resolveOutfitTags'
  // key===null path, nudity tags) through ambient scene generation too (0064
  // gap-fix) -- previously this path ignored suppressedFields entirely, so an
  // undressed character's suppressed clothing tags leaked into background
  // scene prompts even though the event-triggered generate_image path
  // already respected them.
  const exposureTagSettings = getOutfitExposureTagSettings();
  const characterTags = participants
    .filter((p) => p.current_outfit_id)
    .map((p) => {
      const outfit = db.prepare('SELECT * FROM outfits WHERE id = ?').get(p.current_outfit_id);
      const { suppressedFields, disturbedFieldStyles, tornFields } = getActiveOutfitStatusModifiers(p.character_id, {
        playthroughId: session.playthrough_id,
        roomSessionId: session.id,
      });
      return resolveOutfitTags(composeWornOutfit(outfit), null, suppressedFields, disturbedFieldStyles, tornFields, exposureTagSettings);
    })
    .filter(Boolean)
    .join(', ');

  return {
    location_tags: session.current_location_tags || '',
    atmosphere_tags: session.current_atmosphere_tags || '',
    prop_tags: propTags,
    character_tags: characterTags,
    // Looked up by the World's current free-text weather/time-slot label
    // (worlds.weather_tag_map/time_slot_tag_map, admin-configured per label
    // in WorldsPage.jsx) -- '' if that label has no tag mapped yet.
    weather_tags: world.weather_tag_map[playthrough.current_weather] ?? '',
    time_slot_tags: world.time_slot_tag_map[playthrough.current_time_slot_label] ?? '',
  };
}

// Builds the reference-anchor canvas + mask (SPEC.md 3.7): reference standing
// images are stacked in a protected left column; the remaining region (at the
// target output size) is what actually gets generated. Returns base64 PNG
// strings ready for koboldClient.generateImage, plus the crop offset needed
// to extract just the generated region afterward.
//
// The anchor column width is derived from each reference image's own
// dimensions rather than a fixed setting: each image is scaled to its slot
// height preserving its real aspect ratio (no forced crop), and the column
// is sized to the widest of those so nothing gets cut off. Narrower images
// are centered within that shared column.
export async function buildReferenceAnchorCanvas(referenceImageWebPaths, mainWidth = MAIN_WIDTH, mainHeight = MAIN_HEIGHT) {
  const validPaths = referenceImageWebPaths.filter(Boolean).map(webPathToFsPath).filter((p) => fs.existsSync(p));

  const canvasComposites = [];
  const maskComposites = [];
  let anchorWidth = 0;

  if (validPaths.length > 0) {
    const slotHeight = Math.floor(mainHeight / validPaths.length);
    const resizedEntries = [];
    for (const p of validPaths) {
      const meta = await sharp(p).metadata();
      const naturalWidth = Math.max(1, Math.round(slotHeight * (meta.width / meta.height)));
      const resized = await sharp(p).resize(naturalWidth, slotHeight, { fit: 'fill' }).toBuffer();
      resizedEntries.push({ resized, width: naturalWidth });
    }
    anchorWidth = Math.max(...resizedEntries.map((e) => e.width));

    resizedEntries.forEach((entry, i) => {
      const left = Math.floor((anchorWidth - entry.width) / 2);
      canvasComposites.push({ input: entry.resized, left, top: i * slotHeight });
    });

    const blackColumn = await sharp({
      create: { width: anchorWidth, height: mainHeight, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    maskComposites.push({ input: blackColumn, left: 0, top: 0 });
  }

  const anchorOffset = anchorWidth;
  const canvasWidth = mainWidth + anchorOffset;
  const canvasHeight = mainHeight;

  // A thin divider line at the anchor/main boundary, purely as a visual cue
  // in the generation input -- nudges the model toward treating this as a
  // paneled/2koma-style composite (reference panel + generated panel) rather
  // than one continuous image. Cosmetic only: not reflected in the mask, and
  // sits on the anchor side of the boundary so cropMainRegion's extraction
  // (starting at anchorOffset) never includes it in the final output.
  const DIVIDER_WIDTH = 3;
  if (anchorWidth > 0) {
    const dividerLine = await sharp({
      create: { width: DIVIDER_WIDTH, height: mainHeight, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    canvasComposites.push({ input: dividerLine, left: anchorWidth - DIVIDER_WIDTH, top: 0 });
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

// Shared by cropMainRegion and the Settings-page test-generate preview
// (imageSettingsTestGenerator.js's previewFullCanvas option) -- see
// cropMainRegion's own comment for why the resize-back step exists.
export async function resizeToCanvas(resultBuffer, anchorOffset, mainWidth = MAIN_WIDTH, mainHeight = MAIN_HEIGHT) {
  const canvasWidth = mainWidth + anchorOffset;
  return sharp(resultBuffer).resize(canvasWidth, mainHeight, { fit: 'fill' }).png().toBuffer();
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
