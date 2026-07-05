import { db } from '../connection.js';

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

export function getOutfit(id) {
  return attachExpressionImages(db.prepare('SELECT * FROM outfits WHERE id = ?').get(id));
}

export function listOutfitsForCharacter(characterId) {
  return db
    .prepare('SELECT * FROM outfits WHERE character_id = ? ORDER BY is_default DESC, id ASC')
    .all(characterId)
    .map(attachExpressionImages);
}

function unsetOtherDefaults(characterId, exceptOutfitId) {
  db.prepare('UPDATE outfits SET is_default = 0 WHERE character_id = ? AND id != ?').run(
    characterId,
    exceptOutfitId ?? -1,
  );
}

export function createOutfit(characterId, data) {
  const result = db
    .prepare(
      `INSERT INTO outfits (character_id, name, clothing_description, equipment_description, image_tags, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      characterId,
      data.name,
      data.clothing_description ?? '',
      data.equipment_description ?? '',
      data.image_tags ?? '',
      data.is_default ? 1 : 0,
    );
  if (data.is_default) unsetOtherDefaults(characterId, result.lastInsertRowid);
  return getOutfit(result.lastInsertRowid);
}

export function updateOutfit(id, data) {
  const outfit = db.prepare('SELECT * FROM outfits WHERE id = ?').get(id);
  db.prepare(
    `UPDATE outfits SET name = ?, clothing_description = ?, equipment_description = ?, image_tags = ?, is_default = ?
     WHERE id = ?`,
  ).run(
    data.name,
    data.clothing_description ?? '',
    data.equipment_description ?? '',
    data.image_tags ?? '',
    data.is_default ? 1 : 0,
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
