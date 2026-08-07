import { db } from '../connection.js';

// character_pregnancies(0076) の読み書き。段階の導出は services/pregnancy.js 側で、
// ここは行の出し入れだけを持つ。

export function getActivePregnancy(playthroughId, characterId) {
  return db
    .prepare(
      'SELECT * FROM character_pregnancies WHERE playthrough_id = ? AND character_id = ? AND ended_day IS NULL',
    )
    .get(playthroughId, characterId);
}

// 未終了のものだけ。段階のフラグ写し(playthroughsRepo)がキャラごとにクエリを
// 撃たずに済むよう、ルート単位でまとめて引ける形にしてある。
export function listActivePregnancies(playthroughId) {
  return db
    .prepare('SELECT * FROM character_pregnancies WHERE playthrough_id = ? AND ended_day IS NULL')
    .all(playthroughId);
}

// 終了済みを含む全件。出産・流産の履歴として残るので、記録の表示用。
export function listPregnanciesForPlaythrough(playthroughId) {
  return db
    .prepare('SELECT * FROM character_pregnancies WHERE playthrough_id = ? ORDER BY conceived_day, id')
    .all(playthroughId);
}

// 出産済みで、まだ子がキャラとして登場していないもの。成育段階の導出
// (services/pregnancy.js の childGrowthStateFor)に渡す元データ。
export function listAwaitingChildAppearance(playthroughId) {
  return db
    .prepare(
      `SELECT * FROM character_pregnancies
       WHERE playthrough_id = ? AND outcome = '出産' AND ended_day IS NOT NULL AND child_character_id IS NULL
       ORDER BY ended_day, id`,
    )
    .all(playthroughId);
}

export function getPregnancy(id) {
  return db.prepare('SELECT * FROM character_pregnancies WHERE id = ?').get(id);
}

// 作成できない条件は例外ではなく null を返す。呼び出し元は受胎判定(確率)の
// 結果を扱うイベントアクションで、「妊娠しなかった」と「妊娠させられなかった」を
// 同じように素通りさせたいため。
export function createPregnancy(playthroughId, characterId, conceivedDay, { partner = 'あなた' } = {}) {
  const character = db.prepare('SELECT id, is_mob FROM characters WHERE id = ?').get(characterId);
  // モブは設計上セッションごとに状態がリセットされる使い捨ての存在で、ルート
  // 永続の妊娠と矛盾する(character_memories が書き込み経路すべてで弾くのと同じ)。
  if (!character || character.is_mob) return null;
  if (getActivePregnancy(playthroughId, characterId)) return null;

  const result = db
    .prepare(
      `INSERT INTO character_pregnancies (playthrough_id, character_id, partner, conceived_day)
       VALUES (?, ?, ?, ?)`,
    )
    .run(playthroughId, characterId, partner, conceivedDay);
  return getPregnancy(result.lastInsertRowid);
}

// 発覚。既に気づいている場合は日付を上書きしない——「いつ知ったか」は一度きりの
// 出来事で、発覚イベントが二度発火しても最初の日を保つのが正しい。
export function setKnownFrom(id, day) {
  db.prepare('UPDATE character_pregnancies SET known_from_day = ? WHERE id = ? AND known_from_day IS NULL').run(day, id);
  return getPregnancy(id);
}

export function endPregnancy(id, day, outcome, { childName = '', childGender = '' } = {}) {
  db.prepare(
    'UPDATE character_pregnancies SET ended_day = ?, outcome = ?, child_name = ?, child_gender = ? WHERE id = ? AND ended_day IS NULL',
  ).run(day, outcome, childName, childGender, id);
  return getPregnancy(id);
}

// 実装順4(不具合報告2026-08-06項目4): 子キャラ生成後、「詳細をLLMで生成」で
// 母の性格・口調を参考文脈として使うための逆引き。
export function getPregnancyByChildCharacterId(childCharacterId) {
  return db.prepare('SELECT * FROM character_pregnancies WHERE child_character_id = ?').get(childCharacterId);
}

export function setChildCharacter(id, childCharacterId) {
  db.prepare('UPDATE character_pregnancies SET child_character_id = ? WHERE id = ?').run(childCharacterId, id);
  return getPregnancy(id);
}
