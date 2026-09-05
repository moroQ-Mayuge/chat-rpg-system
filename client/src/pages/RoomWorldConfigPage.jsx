import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorlds } from '../hooks/useWorlds.js';
import { useCharacters } from '../hooks/useCharacters.js';
import { useProps } from '../hooks/useProps.js';
import {
  useRoomWorldConfig,
  useRoomWorldConfigMutations,
  useRoomConnections,
  useRoomConnectionMutations,
  useRoomTemplates,
} from '../hooks/useRoomTemplates.js';
import TagChips from '../components/ui/TagChips.jsx';

function tagsToArray(text) {
  return (text || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

// The World-specific instance of a shared room master (see
// RoomTemplateEditPage.jsx / 0030_room_world_decoupling.sql): who actually
// fills each abstract participant slot, which concrete props are placed
// (from the master's candidate categories), and the outgoing connection
// graph — all scoped to this one (room, World) pair.
export default function RoomWorldConfigPage() {
  const { id, worldId } = useParams();
  const navigate = useNavigate();
  const worldIdNum = Number(worldId);
  const { data: worlds } = useWorlds();
  const { data: allCharacters } = useCharacters();
  // イベント定義と同じ理由で、特定ルートに紐づいたキャラ(0079)はスロット割当の
  // 選択肢に出さない。スロット割当は World 単位の設定なので、特定ルートの子を
  // 置くと他のルートにも出てしまう。
  const characters = allCharacters?.filter((c) => c.origin_playthrough_id == null);
  const { data: allProps } = useProps();
  const { data: config, isLoading } = useRoomWorldConfig(id, worldIdNum);
  const { save } = useRoomWorldConfigMutations(id, worldIdNum);
  const { data: connections } = useRoomConnections(id, worldIdNum);
  const connectionMutations = useRoomConnectionMutations(id, worldIdNum);
  const { data: worldRooms } = useRoomTemplates(worldIdNum);

  const [assignments, setAssignments] = useState(null);
  const [propIds, setPropIds] = useState(null);
  const [freeProps, setFreeProps] = useState(null);
  const [tagMatchMaxCount, setTagMatchMaxCount] = useState(undefined); // undefined = follow config
  const [newConnectionTargetId, setNewConnectionTargetId] = useState('');
  const [newConnectionLabel, setNewConnectionLabel] = useState('');
  const [newConnectionCost, setNewConnectionCost] = useState(1);
  const [newConnectionEndsSession, setNewConnectionEndsSession] = useState(false);

  const world = worlds?.find((w) => w.id === worldIdNum);

  if (isLoading || !worlds || !characters || !allProps || !config) return <p>読み込み中...</p>;

  // Per-slot fallback: a slot the user hasn't touched this session must
  // always read from the current `config` (fresh from the server), not a
  // frozen full-map snapshot taken at the moment of the FIRST edit anywhere
  // on the page. The old `currentAssignments` built that snapshot once via
  // Object.fromEntries and never revisited it, so a slot absent from the
  // snapshot (e.g. one added server-side after the snapshot was taken, or
  // simply missed because `assignments` only ever gets one shallow copy)
  // would fall back to `?? []` on save and silently wipe its real rows.
  function rowsForSlot(slot) {
    const local = assignments?.[slot.slot_id];
    if (local) return local;
    return slot.assignments.map((a) => ({
      character_id: a.character_id,
      time_slot_indices: a.time_slot_indices,
      random_fill_mode: a.random_fill_mode ?? 'always',
      random_probability: a.random_probability ?? 1,
    }));
  }
  const currentAssignments = Object.fromEntries(config.slot_assignments.map((slot) => [slot.slot_id, rowsForSlot(slot)]));
  const currentPropIds = propIds ?? config.props.map((p) => p.id);
  const currentFreeProps = freeProps ?? config.free_props.map((p) => p.description);
  const currentTagMatchMaxCount = tagMatchMaxCount !== undefined ? tagMatchMaxCount : config.tag_match_max_count;

  const candidateCategoryIds = new Set(config.candidate_prop_categories.map((c) => c.id));
  const candidateProps = allProps.filter((p) => candidateCategoryIds.has(p.category_id));

  function addAssignmentRow(slotId) {
    const firstCharacterId = characters[0]?.id;
    if (firstCharacterId == null) return;
    setAssignments({
      ...currentAssignments,
      [slotId]: [
        ...(currentAssignments[slotId] ?? []),
        { character_id: firstCharacterId, time_slot_indices: [], random_fill_mode: 'always', random_probability: 1 },
      ],
    });
  }

  function updateAssignmentRow(slotId, index, patch) {
    const rows = currentAssignments[slotId] ?? [];
    setAssignments({
      ...currentAssignments,
      [slotId]: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  }

  function removeAssignmentRow(slotId, index) {
    const rows = currentAssignments[slotId] ?? [];
    setAssignments({ ...currentAssignments, [slotId]: rows.filter((_, i) => i !== index) });
  }

  function toggleProp(propId) {
    setPropIds(currentPropIds.includes(propId) ? currentPropIds.filter((i) => i !== propId) : [...currentPropIds, propId]);
  }

  async function handleSave() {
    await save.mutateAsync({
      slot_assignments: config.slot_assignments.map((slot) => ({
        slot_id: slot.slot_id,
        assignments: (currentAssignments[slot.slot_id] ?? []).map((a) => ({
          character_id: a.character_id === null ? null : Number(a.character_id),
          time_slot_indices: a.time_slot_indices,
          random_fill_mode: a.random_fill_mode ?? 'always',
          random_probability: a.random_probability ?? 1,
        })),
      })),
      prop_ids: currentPropIds,
      free_props: currentFreeProps,
      tag_match_max_count: currentTagMatchMaxCount,
    });
    setAssignments(null);
    setPropIds(null);
    setFreeProps(null);
    setTagMatchMaxCount(undefined);
  }

  async function handleAddConnection() {
    if (!newConnectionTargetId) return;
    await connectionMutations.create.mutateAsync({
      to_room_template_id: Number(newConnectionTargetId),
      label: newConnectionLabel,
      movement_cost: newConnectionCost,
      ends_session: newConnectionEndsSession,
    });
    setNewConnectionTargetId('');
    setNewConnectionLabel('');
    setNewConnectionCost(1);
    setNewConnectionEndsSession(false);
  }

  // 継続セッション(0121/0122)が有効なWorldでも、この経路を通る移動は常に
  // 場面を区切る(evaluateBoundaryのconnection.ends_sessionトリガー)。
  function toggleConnectionEndsSession(c, checked) {
    return connectionMutations.update.mutateAsync({
      connectionId: c.id,
      data: { to_room_template_id: c.to_room_template_id, label: c.label, movement_cost: c.movement_cost, ends_session: checked },
    });
  }

  const connectionTargetCandidates = (worldRooms ?? []).filter((rt) => rt.id !== Number(id));

  return (
    <div>
      <h2>
        {config.name} ／ {world?.name ?? `World#${worldIdNum}`} での設定
      </h2>
      <p style={{ fontSize: 11, color: '#888', marginTop: -8 }}>
        部屋自体の名前・場所文・雰囲気などは共通マスタ側で編集してください。ここではこのWorldだけの参加キャラ・Prop・移動先を設定します。
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <p style={{ marginBottom: 4 }}>参加キャラ枠の割り当て</p>
            <label style={{ display: 'block', fontSize: 12, marginBottom: 8 }}>
              属性キー一致での最大人数（空欄=無制限）
              <input
                type="number"
                min={0}
                style={{ width: 80, marginLeft: 6 }}
                value={currentTagMatchMaxCount ?? ''}
                onChange={(e) => setTagMatchMaxCount(e.target.value === '' ? null : Number(e.target.value))}
              />
              <span style={{ color: '#888', marginLeft: 6 }}>
                超過時は重み付きランダムで抽選（部屋の属性キーに一致する全キャラが自動同席する仕組みの人数上限）
              </span>
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {config.slot_assignments.map((slot) => {
                const slotTags = new Set(tagsToArray(slot.attribute_tags));
                const tagMatched = characters.filter(
                  (c) => slotTags.size > 0 && tagsToArray(c.attribute_tags).some((t) => slotTags.has(t)),
                );
                const tagMatchedIds = new Set(tagMatched.map((c) => c.id));
                const rows = currentAssignments[slot.slot_id] ?? [];
                return (
                  <div key={slot.slot_id} style={{ border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
                    <p style={{ fontSize: 12, margin: '0 0 4px' }}>
                      {slot.note || '（無題の枠）'}
                      {slot.attribute_tags && <span style={{ color: '#888' }}> [{slot.attribute_tags}]</span>}
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {rows.map((row, index) => (
                        <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid #f0f0f0', borderRadius: 4, padding: 4 }}>
                          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            <select
                              style={{ flex: 1 }}
                              value={row.character_id ?? 'random'}
                              onChange={(e) =>
                                updateAssignmentRow(slot.slot_id, index, {
                                  character_id: e.target.value === 'random' ? null : Number(e.target.value),
                                })
                              }
                            >
                              <option value="random" disabled={slotTags.size === 0}>
                                ★ ランダム（属性該当キャラ）
                              </option>
                              {characters.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {tagMatchedIds.has(c.id) ? `★ ${c.name}` : c.name}
                                </option>
                              ))}
                            </select>
                            <button onClick={() => removeAssignmentRow(slot.slot_id, index)}>削除</button>
                          </div>
                          {row.character_id === null && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 11 }}>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <input
                                  type="radio"
                                  name={`fill-mode-${slot.slot_id}-${index}`}
                                  checked={row.random_fill_mode !== 'probability'}
                                  onChange={() => updateAssignmentRow(slot.slot_id, index, { random_fill_mode: 'always' })}
                                />
                                ランダム枠は必ず埋める
                              </label>
                              <label style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <input
                                  type="radio"
                                  name={`fill-mode-${slot.slot_id}-${index}`}
                                  checked={row.random_fill_mode === 'probability'}
                                  onChange={() => updateAssignmentRow(slot.slot_id, index, { random_fill_mode: 'probability' })}
                                />
                                ランダム枠は指定の確率で出現
                              </label>
                              {row.random_fill_mode === 'probability' && (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    style={{ width: 50 }}
                                    value={Math.round((row.random_probability ?? 1) * 100)}
                                    onChange={(e) =>
                                      updateAssignmentRow(slot.slot_id, index, {
                                        random_probability: Math.max(0, Math.min(100, Number(e.target.value))) / 100,
                                      })
                                    }
                                  />
                                  %
                                </span>
                              )}
                              {slotTags.size === 0 && <span style={{ color: '#888' }}>このスロットに属性キー未設定のため対象キャラがいません</span>}
                            </div>
                          )}
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {(world?.time_slot_labels ?? []).map((label, tsIndex) => (
                              <label key={tsIndex} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11 }}>
                                <input
                                  type="checkbox"
                                  checked={row.time_slot_indices.includes(tsIndex)}
                                  onChange={(e) =>
                                    updateAssignmentRow(slot.slot_id, index, {
                                      time_slot_indices: e.target.checked
                                        ? [...row.time_slot_indices, tsIndex]
                                        : row.time_slot_indices.filter((i) => i !== tsIndex),
                                    })
                                  }
                                />
                                {label}
                              </label>
                            ))}
                            {row.time_slot_indices.length === 0 && (
                              <span style={{ fontSize: 10, color: '#888' }}>（未選択＝常に在室）</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {rows.length === 0 && <p style={{ fontSize: 11, color: '#888' }}>未割当</p>}
                      <button onClick={() => addAssignmentRow(slot.slot_id)}>+ キャラを追加</button>
                    </div>
                  </div>
                );
              })}
              {config.slot_assignments.length === 0 && (
                <p style={{ fontSize: 12, color: '#888' }}>このマスタにはまだ参加キャラ枠がありません（部屋マスタ編集画面で追加できます）</p>
              )}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <p style={{ marginBottom: 4 }}>設備・機材（候補カテゴリ内から選択）</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {candidateProps.map((prop) => (
                <label
                  key={prop.id}
                  style={{
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid #ccc',
                    background: currentPropIds.includes(prop.id) ? '#dbeafe' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input type="checkbox" style={{ marginRight: 4 }} checked={currentPropIds.includes(prop.id)} onChange={() => toggleProp(prop.id)} />
                  {prop.name}
                </label>
              ))}
              {candidateProps.length === 0 && (
                <p style={{ fontSize: 12, color: '#888' }}>候補カテゴリに属する設備・機材がありません（部屋マスタでカテゴリを追加してください）</p>
              )}
            </div>
            <TagChips
              tags={currentFreeProps}
              onChange={(tags) => setFreeProps(tags)}
              placeholder="自由記述で追加（画像生成には未反映）"
            />
          </div>

          {config.is_place && (
            <div style={{ borderTop: '1px solid #ddd', paddingTop: 10 }}>
              <p style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>移動先（つながり）</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {(connections ?? []).map((c) => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, border: '1px solid #eee', borderRadius: 6, padding: '4px 8px' }}>
                    <span style={{ flex: 1 }}>
                      → {c.to_room_name}
                      {c.label && `（${c.label}）`} / 消費{c.movement_cost}
                    </span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(c.ends_session)}
                        onChange={(e) => toggleConnectionEndsSession(c, e.target.checked)}
                      />
                      場面の切れ目
                    </label>
                    <button onClick={() => connectionMutations.remove.mutateAsync(c.id)}>削除</button>
                  </div>
                ))}
                {(connections ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888' }}>まだ設定されていません</p>}
              </div>
              <p style={{ fontSize: 11, color: '#888', margin: '0 0 6px' }}>
                「場面の切れ目」をONにした経路は、場面を継続するWorld設定でも、この経路を通る移動では必ず場面が区切られます（例: 校門・自宅玄関など）。
              </p>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select style={{ flex: 1 }} value={newConnectionTargetId} onChange={(e) => setNewConnectionTargetId(e.target.value)}>
                  <option value="">移動先の部屋を選択</option>
                  {connectionTargetCandidates.map((rt) => (
                    <option key={rt.id} value={rt.id}>
                      {rt.name}
                    </option>
                  ))}
                </select>
                <input style={{ width: 100 }} placeholder="ラベル（任意）" value={newConnectionLabel} onChange={(e) => setNewConnectionLabel(e.target.value)} />
                <input type="number" min="1" style={{ width: 60 }} value={newConnectionCost} onChange={(e) => setNewConnectionCost(Number(e.target.value))} />
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
                  <input type="checkbox" checked={newConnectionEndsSession} onChange={(e) => setNewConnectionEndsSession(e.target.checked)} />
                  場面の切れ目
                </label>
                <button onClick={handleAddConnection} disabled={!newConnectionTargetId}>
                  + 追加
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={() => navigate(`/worlds?edit=${worldIdNum}`)}>世界観の設定に戻る</button>
        <button onClick={() => navigate(`/rooms/${id}/edit`)}>部屋マスタ編集に戻る</button>
        <button onClick={handleSave}>保存</button>
      </div>
    </div>
  );
}
