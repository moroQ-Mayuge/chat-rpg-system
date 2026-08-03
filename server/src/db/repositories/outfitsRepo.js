import { db } from '../connection.js';

// The danbooru-tag category columns that replaced the old flat image_tags
// column (see 0028_outfit_tag_categories.sql, extended by
// 0033_outfit_layers_and_underwear.sql with _outer/_equipment/underwear_*).
// Order matters for the "bare" (no category key) composition in
// outfitTagCategories.js's resolveOutfitTags.
export const OUTFIT_TAG_FIELDS = [
  'main_features',
  'hairstyle',
  'clothing_main',
  'clothing_face',
  'clothing_upper',
  'clothing_lower',
  'clothing_legs',
  'shoes',
  'clothing_face_outer',
  'clothing_upper_outer',
  'clothing_lower_outer',
  'clothing_legs_outer',
  'clothing_face_equipment',
  'clothing_upper_equipment',
  'clothing_lower_equipment',
  'clothing_legs_equipment',
  'underwear_upper',
  'underwear_lower',
  'belongings',
];

function attachExpressionImages(outfit) {
  if (!outfit) return outfit;
  const images = db
    .prepare(
      `SELECT oei.expression_type_id, et.name AS expression_name, et.llm_tag_key, oei.image_path
       FROM outfit_expression_images oei
       JOIN expression_types et ON et.id = oei.expression_type_id
       WHERE oei.outfit_id = ?`,
    )
    .all(outfit.id);
  return { ...outfit, expression_images: images };
}

// garment_operations (0065): OUTFIT_TAG_FIELDS name -> array of style keys
// (subset of open/pull/lift/aside) that are visually plausible for that
// specific garment -- e.g. a blazer supports "open" but not "lift". Parsed
// here so every read path (not just outfitTagCategories.js's runtime
// composition) sees a real object rather than a raw JSON string.
function parseGarmentOperations(outfit) {
  if (!outfit) return outfit;
  let garment_operations;
  try {
    garment_operations = JSON.parse(outfit.garment_operations || '{}');
  } catch {
    garment_operations = {};
  }
  return { ...outfit, garment_operations };
}

export function getOutfit(id) {
  return parseGarmentOperations(attachExpressionImages(db.prepare('SELECT * FROM outfits WHERE id = ?').get(id)));
}

export function listOutfitsForCharacter(characterId) {
  return db
    .prepare('SELECT * FROM outfits WHERE character_id = ? ORDER BY is_default DESC, id ASC')
    .all(characterId)
    .map(attachExpressionImages)
    .map(parseGarmentOperations);
}

function unsetOtherDefaults(characterId, exceptOutfitId) {
  db.prepare('UPDATE outfits SET is_default = 0 WHERE character_id = ? AND id != ?').run(
    characterId,
    exceptOutfitId ?? -1,
  );
}

export function createOutfit(characterId, data) {
  const tagColumns = OUTFIT_TAG_FIELDS.join(', ');
  const tagPlaceholders = OUTFIT_TAG_FIELDS.map(() => '?').join(', ');
  const tagValues = OUTFIT_TAG_FIELDS.map((f) => data[f] ?? '');
  const result = db
    .prepare(
      `INSERT INTO outfits (character_id, name, clothing_description, equipment_description, is_default, garment_operations, outfit_master_id, link_mode, ${tagColumns})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${tagPlaceholders})`,
    )
    .run(
      characterId,
      data.name,
      data.clothing_description ?? '',
      data.equipment_description ?? '',
      data.is_default ? 1 : 0,
      JSON.stringify(data.garment_operations ?? {}),
      data.outfit_master_id ?? null,
      data.link_mode ?? 'copy',
      ...tagValues,
    );
  if (data.is_default) unsetOtherDefaults(characterId, result.lastInsertRowid);
  return getOutfit(result.lastInsertRowid);
}

// outfit_master_id/link_mode fall back to the EXISTING row's value when the
// caller's data doesn't specify them (undefined, not just falsy) -- callers
// that only know about the older fields (e.g. CharactersPage.jsx's
// saveOutfit()) must never silently reset a 'reference' outfit back to
// 'copy' just by saving an unrelated field.
export function updateOutfit(id, data) {
  const outfit = db.prepare('SELECT * FROM outfits WHERE id = ?').get(id);
  const tagSetClause = OUTFIT_TAG_FIELDS.map((f) => `${f} = ?`).join(', ');
  const tagValues = OUTFIT_TAG_FIELDS.map((f) => data[f] ?? '');
  db.prepare(
    `UPDATE outfits SET name = ?, clothing_description = ?, equipment_description = ?, is_default = ?, garment_operations = ?,
       outfit_master_id = ?, link_mode = ?, ${tagSetClause}
     WHERE id = ?`,
  ).run(
    data.name,
    data.clothing_description ?? '',
    data.equipment_description ?? '',
    data.is_default ? 1 : 0,
    JSON.stringify(data.garment_operations ?? {}),
    data.outfit_master_id !== undefined ? data.outfit_master_id : outfit.outfit_master_id,
    data.link_mode !== undefined ? data.link_mode : outfit.link_mode,
    ...tagValues,
    id,
  );
  if (data.is_default) unsetOtherDefaults(outfit.character_id, id);
  return getOutfit(id);
}

export function deleteOutfit(id) {
  db.prepare('DELETE FROM outfits WHERE id = ?').run(id);
  return { deleted: true };
}

export function setStandingImage(id, imagePath) {
  db.prepare('UPDATE outfits SET standing_image_path = ? WHERE id = ?').run(imagePath, id);
  return getOutfit(id);
}

export function setExpressionImage(outfitId, expressionTypeId, imagePath) {
  db.prepare(
    `INSERT INTO outfit_expression_images (outfit_id, expression_type_id, image_path)
     VALUES (?, ?, ?)
     ON CONFLICT (outfit_id, expression_type_id) DO UPDATE SET image_path = excluded.image_path`,
  ).run(outfitId, expressionTypeId, imagePath);
  return getOutfit(outfitId);
}
