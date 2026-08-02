import { db } from '../../db/connection.js';
import { getPlaythrough, createPlaythrough } from '../../db/repositories/playthroughsRepo.js';
import { getWorld } from '../../db/repositories/worldsRepo.js';
import { listCharacters } from '../../db/repositories/charactersRepo.js';
import { collectCharacterEntry, importCharacterEntries } from './characterBundle.js';
import { saveGeneratedImage } from '../../storage/imageStorage.js';
import { extensionOf } from './diskImages.js';

// ルート(playthrough)一本を持ち出し可能な形にする。世界観・キャラ・部屋・イベントは
// 既存のバンドルで別途持ち出す前提で、このバンドル自体は世界観を同梱しない
// (import 時に target_world_id を指定する — 部屋テンプレート単体エクスポートと同じ規約)。
//
// 参照解決は3種類:
//   1. ルート内ローカルなFK(room_session_id 等) — インポート時に旧id->新idの
//      remap Map を作りながら振り直すだけ。名前解決は不要
//      (eventDefinitionsRepo.js の insertOutcomeNodes と同じ手法)。
//   2. 環境をまたぐFK(character_id, relationship_axis_id, status_id, item_id,
//      room_template_id, event_definition_id, outfit_id) — エクスポート時に
//      名前を持たせ、インポート時に宛先環境の名前で引き直す
//      (eventPortability.js と同じ方式)。event_definition_id はイベント名の
//      重複がありうるため best-effort(最初に一致したものを使う)。
//   3. このルート由来の自動生成キャラ(characters.origin_playthrough_id) —
//      characterBundle.js の collectCharacterEntry と同じ形で同梱し、
//      インポート時に新しい origin_playthrough_id を持つキャラとして先に作成、
//      以後の名前解決で「同一バッチ内を優先」する。
//
// relationship_states/character_status_states/character_address_states/
// character_flags/character_impression_states の5テーブルは、playthrough_id と
// room_session_id が排他(モブはセッションスコープ、それ以外はルートスコープ)
// なので、この2系統をそれぞれ別クエリで拾う必要がある
// (どちらか一方だけ見ると、モブ絡みの行が丸ごと欠落する)。

function nameMap(rows) {
  return new Map(rows.map((r) => [r.id, r.name]));
}

export function collectPlaythroughEntry(playthroughId, imageCollector, { includeMessages = false } = {}) {
  const playthrough = getPlaythrough(playthroughId);
  if (!playthrough) throw new Error('ルートが見つかりません。');
  const world = getWorld(playthrough.world_id);

  // このルート由来の自動生成キャラ(出産で生まれた子など)。ルート本体と
  // 一緒に同梱し、インポート時は新しい origin_playthrough_id を持つ
  // 独立したキャラとして先に作る。
  const autoCreatedCharacterRows = db.prepare('SELECT id FROM characters WHERE origin_playthrough_id = ?').all(playthroughId);
  const autoCreatedCharacters = autoCreatedCharacterRows.map((c) => collectCharacterEntry(c.id, imageCollector));

  // 名前解決テーブル一式(origin_playthrough_id キャラも含めた全キャラ)。
  const characterNames = nameMap(listCharacters());
  const axisNames = nameMap(db.prepare('SELECT id, name FROM relationship_axes').all());
  const statusNames = nameMap(db.prepare('SELECT id, name FROM character_statuses').all());
  const itemNames = nameMap(db.prepare('SELECT id, name FROM items').all());
  const roomTemplateNames = nameMap(db.prepare('SELECT id, name FROM room_templates').all());
  const eventDefNames = nameMap(db.prepare('SELECT id, name FROM event_definitions').all());

  function outfitRef(outfitId) {
    if (outfitId == null) return null;
    const outfit = db.prepare('SELECT character_id, name FROM outfits WHERE id = ?').get(outfitId);
    if (!outfit) return null;
    return { character_name: characterNames.get(outfit.character_id) ?? null, outfit_name: outfit.name };
  }

  // room_sessions とその直下(room_session_characters/messages/generated_images)。
  // 旧idはそのまま保持し(*_old_id)、インポート時に振り直す。
  const roomSessionRows = db.prepare('SELECT * FROM room_sessions WHERE playthrough_id = ?').all(playthroughId);
  const roomSessionOldIds = roomSessionRows.map((rs) => rs.id);

  const roomSessions = roomSessionRows.map((rs) => {
    const { id: oldId, playthrough_id: _pid, room_template_id, current_scene_image_id, ...rest } = rs;

    const participants = db
      .prepare('SELECT * FROM room_session_characters WHERE room_session_id = ?')
      .all(oldId)
      .map((rsc) => {
        const { id: oldParticipantId, room_session_id: _rsid, character_id, current_outfit_id, ...prest } = rsc;
        return {
          old_id: oldParticipantId,
          character_name: characterNames.get(character_id) ?? null,
          outfit_ref: outfitRef(current_outfit_id),
          ...prest,
        };
      });

    let messages = [];
    let generatedImages = [];
    if (includeMessages) {
      generatedImages = db
        .prepare('SELECT * FROM generated_images WHERE room_session_id = ?')
        .all(oldId)
        .map((gi) => {
          const { id: oldImgId, room_session_id: _rsid2, character_id, file_path, ...irest } = gi;
          return {
            old_id: oldImgId,
            character_name: character_id != null ? characterNames.get(character_id) ?? null : null,
            image: imageCollector.add(file_path, 'playthrough-scene'),
            ...irest,
          };
        });
      messages = db
        .prepare('SELECT * FROM messages WHERE room_session_id = ? ORDER BY id')
        .all(oldId)
        .map((m) => {
          const { id: _mid, room_session_id: _rsid3, character_id, image_id, mentioned_character_ids, ...mrest } = m;
          return {
            character_name: character_id != null ? characterNames.get(character_id) ?? null : null,
            old_image_id: image_id,
            mentioned_character_names: mentioned_character_ids
              ? JSON.parse(mentioned_character_ids)
                  .map((cid) => characterNames.get(cid))
                  .filter(Boolean)
              : null,
            ...mrest,
          };
        });
    }

    return {
      old_id: oldId,
      room_template_name: roomTemplateNames.get(room_template_id) ?? null,
      old_current_scene_image_id: current_scene_image_id,
      participants,
      messages,
      generated_images: generatedImages,
      ...rest,
    };
  });

  // playthrough_id / room_session_id が排他な5テーブル共通の収集ロジック。
  // room_session_character_id を持つテーブルはそれも old id のまま残し、
  // インポート時に room_session_characters の remap で引き直す。
  function collectDualScope(table, extraResolve = {}) {
    const byPlaythrough = db.prepare(`SELECT * FROM ${table} WHERE playthrough_id = ?`).all(playthroughId);
    const bySession = roomSessionOldIds.length
      ? db
          .prepare(`SELECT * FROM ${table} WHERE room_session_id IN (${roomSessionOldIds.map(() => '?').join(',')})`)
          .all(...roomSessionOldIds)
      : [];
    return [...byPlaythrough, ...bySession].map((row) => {
      const {
        id: _id,
        playthrough_id: _pid,
        room_session_id,
        room_session_character_id,
        character_id,
        ...rest
      } = row;
      const out = {
        scope: room_session_id != null ? 'session' : 'playthrough',
        old_room_session_id: room_session_id ?? null,
        old_room_session_character_id: room_session_character_id ?? null,
        character_name: character_id != null ? characterNames.get(character_id) ?? null : null,
      };
      for (const [col, value] of Object.entries(rest)) {
        out[col] = extraResolve[col] ? extraResolve[col](value) : value;
      }
      return out;
    });
  }

  // playthrough_id のみを持つ(room_session_id 排他なし)テーブル共通ロジック。
  // event_fire_history は playthrough_id が必須で room_session_id は追加情報
  // (排他ではない)ので、こちらの単純な形で足りる — room_session_id は
  // old id のまま残し、インポート時に remap する。
  function collectByPlaythrough(table, extraResolve = {}) {
    return db
      .prepare(`SELECT * FROM ${table} WHERE playthrough_id = ?`)
      .all(playthroughId)
      .map((row) => {
        const { id: _id, playthrough_id: _pid, character_id, ...rest } = row;
        const out = { character_name: character_id != null ? characterNames.get(character_id) ?? null : null };
        for (const [col, value] of Object.entries(rest)) {
          out[col] = extraResolve[col] ? extraResolve[col](value) : value;
        }
        return out;
      });
  }

  const { id: _id, world_id: _wid, created_at: _c, updated_at: _u, ...playthroughData } = playthrough;

  return {
    type: 'playthrough',
    version: 1,
    exported_at: new Date().toISOString(),
    source_world_name: world.name,
    include_messages: includeMessages,
    data: playthroughData,
    auto_created_characters: autoCreatedCharacters,
    room_sessions: roomSessions,
    relationship_states: collectDualScope('relationship_states', {
      relationship_axis_id: (id) => axisNames.get(id) ?? null,
    }),
    session_flags: db.prepare('SELECT flag_key, flag_value, set_at_turn FROM session_flags WHERE playthrough_id = ?').all(playthroughId),
    event_fire_history: collectByPlaythrough('event_fire_history', {
      event_definition_id: (id) => eventDefNames.get(id) ?? null,
      room_session_id: (id) => id, // old id, remapped at import
    }),
    character_status_states: collectDualScope('character_status_states', {
      status_id: (id) => statusNames.get(id) ?? null,
    }),
    character_address_states: collectDualScope('character_address_states'),
    character_flags: collectDualScope('character_flags'),
    character_impression_states: collectDualScope('character_impression_states'),
    character_memories: collectByPlaythrough('character_memories'),
    character_pregnancies: db
      .prepare('SELECT * FROM character_pregnancies WHERE playthrough_id = ?')
      .all(playthroughId)
      .map((p) => {
        const { id: _id2, playthrough_id: _pid2, character_id, child_character_id, ...rest } = p;
        return {
          character_name: characterNames.get(character_id) ?? null,
          child_character_name: child_character_id != null ? characterNames.get(child_character_id) ?? null : null,
          ...rest,
        };
      }),
    playthrough_timers: collectByPlaythrough('playthrough_timers'),
    playthrough_inventory: db
      .prepare('SELECT * FROM playthrough_inventory WHERE playthrough_id = ?')
      .all(playthroughId)
      .map((i) => {
        const { id: _id3, playthrough_id: _pid3, item_id, owner_character_id, ...rest } = i;
        return {
          item_name: itemNames.get(item_id) ?? null,
          owner_character_name: owner_character_id != null ? characterNames.get(owner_character_id) ?? null : null,
          ...rest,
        };
      }),
    playthrough_room_discoveries: db
      .prepare('SELECT room_template_id, discovered_at FROM playthrough_room_discoveries WHERE playthrough_id = ?')
      .all(playthroughId)
      .map((r) => ({ room_template_name: roomTemplateNames.get(r.room_template_id) ?? null, discovered_at: r.discovered_at })),
    playthrough_room_available_items: db
      .prepare('SELECT room_template_id, item_id, added_at, revealed FROM playthrough_room_available_items WHERE playthrough_id = ?')
      .all(playthroughId)
      .map((r) => ({
        room_template_name: roomTemplateNames.get(r.room_template_id) ?? null,
        item_name: itemNames.get(r.item_id) ?? null,
        added_at: r.added_at,
        revealed: r.revealed,
      })),
  };
}

// entry: collectPlaythroughEntry の出力。targetWorldId は必須(このバンドル自体は
// 世界観を持ち歩かない — 事前に対象の世界観・キャラ・部屋・イベントを別途
// インポート済みである前提)。readImage は readZip() の戻り値のもの。
export async function importPlaythroughEntry(entry, readImage, targetWorldId, warnings) {
  if (entry?.type !== 'playthrough') throw new Error('ルートのエクスポートファイルではありません。');
  if (targetWorldId == null) throw new Error('target_world_id_required');

  // このルート由来の自動生成キャラを先に作る。以後の名前解決で
  // 「同一バッチ内を優先」できるよう、whole-install のマップの後に上書きする
  // (eventPortability.js の preferredCharacters と同じ考え方 — 宛先に同名の
  // 無関係キャラが居ても、今回同梱したキャラの方を優先して紐付ける)。
  const autoCreated = await importCharacterEntries(entry.auto_created_characters ?? [], readImage, warnings);
  const charIdByName = new Map(listCharacters().map((c) => [c.name, c.id]));
  for (const c of autoCreated) charIdByName.set(c.name, c.id);

  function resolveCharacter(name) {
    if (name == null) return null;
    const id = charIdByName.get(name);
    if (id == null) {
      warnings.push(`キャラクター「${name}」が見つからず、関連する行をスキップしました`);
      return null;
    }
    return id;
  }

  const axisIdByName = new Map(db.prepare('SELECT id, name FROM relationship_axes').all().map((a) => [a.name, a.id]));
  const statusIdByName = new Map(
    db.prepare('SELECT id, name FROM character_statuses WHERE world_id = ?').all(targetWorldId).map((s) => [s.name, s.id]),
  );
  const itemIdByName = new Map(db.prepare('SELECT id, name FROM items WHERE world_id = ?').all(targetWorldId).map((i) => [i.name, i.id]));
  const roomTemplateIdByName = new Map(db.prepare('SELECT id, name FROM room_templates').all().map((r) => [r.name, r.id]));
  // イベント名は世界観をまたいで重複しうる(このセッションで実際に重複を
  // 32件片付けた実績がある)ので、best-effort で最初に一致したものを使う。
  const eventDefIdByName = new Map(db.prepare('SELECT id, name FROM event_definitions').all().map((e) => [e.name, e.id]));

  // 1. ルート本体。createPlaythrough は既定値で作るので、直後に生の値で
  // 上書きする(世界観の初期値ではなく、持ち出した時点の状態を復元するため)。
  const playthrough = createPlaythrough(targetWorldId, entry.data.name);
  const pid = playthrough.id;
  // createPlaythrough は syncDerivedCharacterFlags 経由で cycle_phase を
  // 即座に仮置きする(0070) — この install の cycle_enabled キャラ全員分、
  // このルートの参加者かどうかを問わず。下のループはバンドルの実データを
  // 生の INSERT で書き込むだけ(UPSERT ではない)ので、そのまま進めると
  // 仮置き分と重複する。実データで丸ごと置き換える前提なので、まず消す。
  db.prepare('DELETE FROM character_flags WHERE playthrough_id = ?').run(pid);

  // characterBundle.js の importCharacterEntries は origin_playthrough_id を
  // 意図的に除外する(通常のキャラインポートが勝手にどこかのルート所属を
  // 名乗るのはおかしいため)。ここは逆にそれが正しい動作なので、新しい
  // playthrough_id が判明した今、自動生成キャラだけ明示的に紐付け直す。
  for (const c of autoCreated) {
    db.prepare('UPDATE characters SET origin_playthrough_id = ? WHERE id = ?').run(pid, c.id);
  }

  const d = entry.data;
  db.prepare(
    `UPDATE playthroughs SET
       current_day = ?, current_time_slot_index = ?, current_weather = ?, current_season_index = ?,
       status = ?, money = ?, current_movement_subcount = ?, last_time_skip_day = ?,
       use_custom_protagonist = ?, protagonist_name = ?, protagonist_nickname = ?, protagonist_occupation = ?,
       protagonist_appearance = ?, protagonist_notes = ?, protagonist_gender = ?, protagonist_mode = ?
     WHERE id = ?`,
  ).run(
    d.current_day,
    d.current_time_slot_index,
    d.current_weather,
    d.current_season_index,
    d.status,
    d.money,
    d.current_movement_subcount,
    d.last_time_skip_day ?? null,
    d.use_custom_protagonist ? 1 : 0,
    d.protagonist_name ?? '',
    d.protagonist_nickname ?? '',
    d.protagonist_occupation ?? '',
    d.protagonist_appearance ?? '',
    d.protagonist_notes ?? '',
    d.protagonist_gender ?? '',
    d.protagonist_mode ?? 'character',
    pid,
  );

  // createPlaythrough が既に season/time_slot/weather/day_of_week/is_holiday を
  // 世界観の初期値で仮置きしているので、持ち出した実際の値で上書きする。
  for (const f of entry.session_flags ?? []) {
    db.prepare(
      `INSERT INTO session_flags (playthrough_id, flag_key, flag_value, set_at_turn) VALUES (?, ?, ?, ?)
       ON CONFLICT(playthrough_id, flag_key) DO UPDATE SET flag_value = excluded.flag_value, set_at_turn = excluded.set_at_turn`,
    ).run(pid, f.flag_key, f.flag_value, f.set_at_turn);
  }

  // 2. room_sessions とその直下。ローカルFKの remap Map をここで組み立てる。
  const roomSessionIdMap = new Map();
  const roomSessionCharacterIdMap = new Map();

  for (const rs of entry.room_sessions ?? []) {
    const roomTemplateId = roomTemplateIdByName.get(rs.room_template_name);
    if (roomTemplateId == null) {
      warnings.push(`部屋テンプレート「${rs.room_template_name}」が見つからず、1つの部屋滞在をスキップしました`);
      continue;
    }
    const rsResult = db
      .prepare(
        `INSERT INTO room_sessions
          (room_template_id, playthrough_id, entered_day, entered_time_slot_index, started_at, updated_at,
           current_location_text, current_location_tags, current_atmosphere_text, current_atmosphere_tags,
           status, current_scene_situation, relationship_update_last_turn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        roomTemplateId,
        pid,
        rs.entered_day,
        rs.entered_time_slot_index,
        rs.started_at,
        rs.updated_at,
        rs.current_location_text,
        rs.current_location_tags,
        rs.current_atmosphere_text,
        rs.current_atmosphere_tags,
        rs.status,
        rs.current_scene_situation,
        rs.relationship_update_last_turn,
      );
    const newSessionId = rsResult.lastInsertRowid;
    roomSessionIdMap.set(rs.old_id, newSessionId);

    for (const p of rs.participants ?? []) {
      const characterId = resolveCharacter(p.character_name);
      if (characterId == null) continue;
      let outfitId = null;
      if (p.outfit_ref) {
        const outfit = db
          .prepare('SELECT id FROM outfits WHERE character_id = ? AND name = ?')
          .get(characterId, p.outfit_ref.outfit_name);
        outfitId = outfit?.id ?? null;
      }
      const pResult = db
        .prepare(
          `INSERT INTO room_session_characters
            (room_session_id, character_id, joined_at, left_at, current_outfit_id, is_active, is_accompanying)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(newSessionId, characterId, p.joined_at, p.left_at, outfitId, p.is_active, p.is_accompanying);
      roomSessionCharacterIdMap.set(p.old_id, pResult.lastInsertRowid);
    }

    // 画像本体は includeMessages のときだけ同梱されている。scene image (絵)は
    // character export の standing/expression image と同じ imageCollector 経由。
    const generatedImageIdMap = new Map();
    for (const gi of rs.generated_images ?? []) {
      let filePath = null;
      if (gi.image) {
        const buf = readImage(gi.image);
        if (buf) filePath = await saveGeneratedImage(newSessionId, buf, extensionOf(gi.image));
      }
      const characterId = gi.character_name ? resolveCharacter(gi.character_name) : null;
      const giResult = db
        .prepare('INSERT INTO generated_images (room_session_id, type, character_id, prompt, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(newSessionId, gi.type, characterId, gi.prompt, filePath, gi.created_at);
      generatedImageIdMap.set(gi.old_id, giResult.lastInsertRowid);
    }

    for (const m of rs.messages ?? []) {
      const characterId = m.character_name ? resolveCharacter(m.character_name) : null;
      const imageId = m.old_image_id != null ? generatedImageIdMap.get(m.old_image_id) ?? null : null;
      const mentionedIds = (m.mentioned_character_names ?? [])
        .map((n) => resolveCharacter(n))
        .filter((cid) => cid != null);
      db.prepare(
        `INSERT INTO messages
          (room_session_id, sender_type, character_id, content_type, content, image_id, emotion_tag, created_at,
           mentioned_character_ids, status_snapshot)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        newSessionId,
        m.sender_type,
        characterId,
        m.content_type,
        m.content,
        imageId,
        m.emotion_tag,
        m.created_at,
        mentionedIds.length ? JSON.stringify(mentionedIds) : null,
        m.status_snapshot,
      );
    }

    if (rs.old_current_scene_image_id != null) {
      const newImageId = generatedImageIdMap.get(rs.old_current_scene_image_id);
      if (newImageId != null) db.prepare('UPDATE room_sessions SET current_scene_image_id = ? WHERE id = ?').run(newImageId, newSessionId);
    }
  }

  // 3. playthrough_id/room_session_id が排他な5テーブル。scope に応じて
  // どちらの列に差し込むかを決め、room_session_character_id も remap する。
  function scopeColumns(row) {
    if (row.scope === 'session') {
      const roomSessionId = row.old_room_session_id != null ? roomSessionIdMap.get(row.old_room_session_id) ?? null : null;
      return { playthroughId: null, roomSessionId };
    }
    return { playthroughId: pid, roomSessionId: null };
  }
  function resolvedInstanceId(row) {
    return row.old_room_session_character_id != null ? roomSessionCharacterIdMap.get(row.old_room_session_character_id) ?? null : null;
  }

  for (const r of entry.relationship_states ?? []) {
    const characterId = resolveCharacter(r.character_name);
    const axisId = axisIdByName.get(r.relationship_axis_id);
    if (characterId == null || axisId == null) {
      if (characterId != null) warnings.push(`関係性軸「${r.relationship_axis_id}」が見つからず、値をスキップしました`);
      continue;
    }
    const { playthroughId, roomSessionId } = scopeColumns(r);
    db.prepare(
      'INSERT INTO relationship_states (playthrough_id, room_session_id, character_id, relationship_axis_id, current_value, room_session_character_id) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(playthroughId, roomSessionId, characterId, axisId, r.current_value, resolvedInstanceId(r));
  }

  for (const s of entry.character_status_states ?? []) {
    const characterId = resolveCharacter(s.character_name);
    const statusId = statusIdByName.get(s.status_id);
    if (characterId == null || statusId == null) {
      if (characterId != null) warnings.push(`ステータス「${s.status_id}」が見つからず、状態をスキップしました`);
      continue;
    }
    const { playthroughId, roomSessionId } = scopeColumns(s);
    db.prepare(
      'INSERT INTO character_status_states (status_id, character_id, playthrough_id, room_session_id, locked, granted_at, room_session_character_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(statusId, characterId, playthroughId, roomSessionId, s.locked, s.granted_at, resolvedInstanceId(s));
  }

  for (const a of entry.character_address_states ?? []) {
    const characterId = resolveCharacter(a.character_name);
    if (characterId == null) continue;
    const { playthroughId, roomSessionId } = scopeColumns(a);
    db.prepare(
      'INSERT INTO character_address_states (playthrough_id, room_session_id, character_id, current_address, updated_at, room_session_character_id) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(playthroughId, roomSessionId, characterId, a.current_address, a.updated_at, resolvedInstanceId(a));
  }

  for (const f of entry.character_flags ?? []) {
    const characterId = resolveCharacter(f.character_name);
    if (characterId == null) continue;
    const { playthroughId, roomSessionId } = scopeColumns(f);
    db.prepare(
      'INSERT INTO character_flags (character_id, flag_key, flag_value, persistence_scope, playthrough_id, room_session_id, set_at_turn) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(characterId, f.flag_key, f.flag_value, f.persistence_scope, playthroughId, roomSessionId, f.set_at_turn);
  }

  for (const i of entry.character_impression_states ?? []) {
    const characterId = resolveCharacter(i.character_name);
    if (characterId == null) continue;
    const { playthroughId, roomSessionId } = scopeColumns(i);
    db.prepare(
      'INSERT INTO character_impression_states (character_id, field_key, value, playthrough_id, room_session_id, room_session_character_id, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(characterId, i.field_key, i.value, playthroughId, roomSessionId, resolvedInstanceId(i), i.updated_at);
  }

  // 4. playthrough_id のみのテーブル群。
  for (const f of entry.event_fire_history ?? []) {
    const eventDefinitionId = eventDefIdByName.get(f.event_definition_id);
    if (eventDefinitionId == null) {
      warnings.push(`イベント「${f.event_definition_id}」が見つからず、発火履歴を1件スキップしました`);
      continue;
    }
    const characterId = f.character_name ? resolveCharacter(f.character_name) : null;
    const roomSessionId = f.room_session_id != null ? roomSessionIdMap.get(f.room_session_id) ?? null : null;
    db.prepare(
      'INSERT INTO event_fire_history (playthrough_id, event_definition_id, fired_at_turn, fired_at, outcome, room_session_id, character_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(pid, eventDefinitionId, f.fired_at_turn, f.fired_at, f.outcome, roomSessionId, characterId);
  }

  for (const m of entry.character_memories ?? []) {
    const characterId = resolveCharacter(m.character_name);
    if (characterId == null) continue;
    db.prepare(
      'INSERT INTO character_memories (playthrough_id, character_id, content, is_pinned, occurred_label, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(pid, characterId, m.content, m.is_pinned, m.occurred_label, m.source, m.created_at);
  }

  for (const p of entry.character_pregnancies ?? []) {
    const characterId = resolveCharacter(p.character_name);
    if (characterId == null) continue;
    const childCharacterId = p.child_character_name ? resolveCharacter(p.child_character_name) : null;
    db.prepare(
      `INSERT INTO character_pregnancies
        (playthrough_id, character_id, partner, conceived_day, known_from_day, ended_day, outcome, child_name, child_gender, child_character_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(pid, characterId, p.partner, p.conceived_day, p.known_from_day, p.ended_day, p.outcome, p.child_name, p.child_gender, childCharacterId, p.created_at);
  }

  for (const t of entry.playthrough_timers ?? []) {
    const characterId = t.character_name ? resolveCharacter(t.character_name) : null;
    db.prepare(
      'INSERT INTO playthrough_timers (playthrough_id, timer_key, character_id, start_day, due_day, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ).run(pid, t.timer_key, characterId, t.start_day, t.due_day, t.note, t.created_at);
  }

  for (const i of entry.playthrough_inventory ?? []) {
    const itemId = itemIdByName.get(i.item_name);
    if (itemId == null) {
      warnings.push(`アイテム「${i.item_name}」が見つからず、在庫を1件スキップしました`);
      continue;
    }
    const ownerCharacterId = i.owner_character_name ? resolveCharacter(i.owner_character_name) : null;
    db.prepare(
      'INSERT INTO playthrough_inventory (playthrough_id, item_id, owner_character_id, quantity, acquired_at) VALUES (?, ?, ?, ?, ?)',
    ).run(pid, itemId, ownerCharacterId, i.quantity, i.acquired_at);
  }

  for (const r of entry.playthrough_room_discoveries ?? []) {
    const roomTemplateId = roomTemplateIdByName.get(r.room_template_name);
    if (roomTemplateId == null) continue;
    db.prepare('INSERT INTO playthrough_room_discoveries (playthrough_id, room_template_id, discovered_at) VALUES (?, ?, ?)').run(
      pid,
      roomTemplateId,
      r.discovered_at,
    );
  }

  for (const r of entry.playthrough_room_available_items ?? []) {
    const roomTemplateId = roomTemplateIdByName.get(r.room_template_name);
    const itemId = itemIdByName.get(r.item_name);
    if (roomTemplateId == null || itemId == null) continue;
    db.prepare(
      'INSERT INTO playthrough_room_available_items (playthrough_id, room_template_id, item_id, added_at, revealed) VALUES (?, ?, ?, ?, ?)',
    ).run(pid, roomTemplateId, itemId, r.added_at, r.revealed);
  }

  return { playthrough: getPlaythrough(pid), autoCreatedCharacters: autoCreated, warnings };
}
