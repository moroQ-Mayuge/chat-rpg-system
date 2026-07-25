import { db } from '../connection.js';
import { isMobCharacter } from './charactersRepo.js';

// Route-scoped episodic memory (0068_character_memories.sql). Unlike
// character_impression_states (one overwritten value per field = "how they
// feel right now"), rows here accumulate and are never rewritten, so a
// significant event survives any number of later sessions.

// Mob characters intentionally reset every room session (characters.is_mob),
// which is incompatible with route-persistent memory -- every write path
// funnels through here so the guard can't be forgotten at a call site.
export function canHaveMemories(characterId) {
  return !isMobCharacter(characterId);
}

// Every memory for one character in one route, oldest first (editor UI).
export function listMemories(playthroughId, characterId) {
  return db
    .prepare('SELECT * FROM character_memories WHERE playthrough_id = ? AND character_id = ? ORDER BY id ASC')
    .all(playthroughId, characterId);
}

// Every memory in one route regardless of character, for the route-level
// editor panel (which groups by character client-side).
export function listMemoriesForPlaythrough(playthroughId) {
  return db.prepare('SELECT * FROM character_memories WHERE playthrough_id = ? ORDER BY character_id ASC, id ASC').all(playthroughId);
}

// What actually gets injected into the system prompt: every pinned memory
// (deliberately outside the cap -- that's what pinning is for) plus the most
// recent `limit` unpinned ones, merged back into chronological order so the
// model reads them as a timeline. limit <= 0 disables memory injection
// entirely (worlds.memory_prompt_limit = 0), pinned rows included.
export function listMemoriesForPrompt(playthroughId, characterId, limit) {
  if (!(limit > 0)) return [];
  const pinned = db
    .prepare('SELECT * FROM character_memories WHERE playthrough_id = ? AND character_id = ? AND is_pinned = 1 ORDER BY id ASC')
    .all(playthroughId, characterId);
  const recent = db
    .prepare('SELECT * FROM character_memories WHERE playthrough_id = ? AND character_id = ? AND is_pinned = 0 ORDER BY id DESC LIMIT ?')
    .all(playthroughId, characterId, limit);
  return [...pinned, ...recent].sort((a, b) => a.id - b.id);
}

export function addMemory({ playthrough_id, character_id, content, is_pinned = false, occurred_label = '', source = 'manual' }) {
  if (!canHaveMemories(character_id)) return null;
  const result = db
    .prepare(
      `INSERT INTO character_memories (playthrough_id, character_id, content, is_pinned, occurred_label, source)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(playthrough_id, character_id, content, is_pinned ? 1 : 0, occurred_label ?? '', source);
  return getMemory(result.lastInsertRowid);
}

export function getMemory(id) {
  return db.prepare('SELECT * FROM character_memories WHERE id = ?').get(id);
}

export function updateMemory(id, { content, is_pinned }) {
  const existing = getMemory(id);
  if (!existing) return null;
  db.prepare('UPDATE character_memories SET content = ?, is_pinned = ? WHERE id = ?').run(
    content ?? existing.content,
    (is_pinned ?? Boolean(existing.is_pinned)) ? 1 : 0,
    id,
  );
  return getMemory(id);
}

export function deleteMemory(id) {
  db.prepare('DELETE FROM character_memories WHERE id = ?').run(id);
  return { deleted: true };
}

// "2日目 朝" -- the in-game moment a memory was recorded at, snapshotted as
// text because playthroughs.current_day only ever tells you "now". Falls back
// to the bare day when the World's time_slot_labels don't cover the index.
export function formatOccurredLabel(playthroughId) {
  const row = db
    .prepare(
      `SELECT p.current_day, p.current_time_slot_index, w.time_slot_labels
       FROM playthroughs p JOIN worlds w ON w.id = p.world_id WHERE p.id = ?`,
    )
    .get(playthroughId);
  if (!row) return '';
  let slot = '';
  try {
    slot = JSON.parse(row.time_slot_labels)[row.current_time_slot_index] ?? '';
  } catch {
    slot = '';
  }
  return slot ? `${row.current_day}日目 ${slot}` : `${row.current_day}日目`;
}
