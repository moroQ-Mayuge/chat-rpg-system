import { db } from '../db/connection.js';
import { listMastersForWorld } from '../db/repositories/outfitMastersRepo.js';
import { getCharacterUnderwearPreference } from '../db/repositories/charactersRepo.js';
import { setAssignedUnderwear } from '../db/repositories/playthroughCharacterUnderwearRepo.js';
import { parseAttributeTags, tagsOverlapOrWildcard } from './attributeTagMatching.js';

// PLAN_2026-08-02_outfit_spec_revision.md 実装順5: Worldが有効化していれば、
// 日付ロールオーバーのたびにこのルートに登場済みの各キャラの下着を再抽選する。
// 「登場済み」の絞り込みは playthroughsRepo.js の applySelfStatRegen と同じ
// relationship_states ベースの列挙 -- モブはここに playthrough_id 付きの行を
// 持たないため、自然に対象から外れる(セッション単位でリセットされる使い捨ての
// 存在に日次抽選をしても意味が無いため、これは意図した挙動)。
//
// 好みタグが候補と1つも一致しない場合(underwear_preference_tags 未設定の
// キャラが大多数を占める既定状態を含む)は、絞り込まず全下着マスタから抽選する
// -- 「一致しない=何も割り当てない」より、まず何かを割り当てる方が機能の目的に
// 合う。好みを明示したキャラだけがその好みで絞られる。
export function rerollUnderwearAssignments(playthroughId, world) {
  if (!world.underwear_random_enabled) return;

  const pool = listMastersForWorld(world.id).filter((m) => m.slot === 'underwear');
  if (pool.length === 0) return;

  const characterIds = db
    .prepare('SELECT DISTINCT character_id FROM relationship_states WHERE playthrough_id = ?')
    .all(playthroughId)
    .map((r) => r.character_id);

  for (const characterId of characterIds) {
    const preferenceTags = parseAttributeTags(getCharacterUnderwearPreference(characterId)?.underwear_preference_tags);
    let candidates = pool.filter((m) => tagsOverlapOrWildcard(parseAttributeTags(m.attribute_tags), preferenceTags));
    if (candidates.length === 0) candidates = pool;
    const picked = candidates[Math.floor(Math.random() * candidates.length)];
    setAssignedUnderwear(playthroughId, characterId, picked.id);
  }
}
