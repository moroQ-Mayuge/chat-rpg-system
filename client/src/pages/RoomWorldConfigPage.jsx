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
  const { data: characters } = useCharacters();
  const { data: allProps } = useProps();
  const { data: config, isLoading } = useRoomWorldConfig(id, worldIdNum);
  const { save } = useRoomWorldConfigMutations(id, worldIdNum);
  const { data: connections } = useRoomConnections(id, worldIdNum);
  const connectionMutations = useRoomConnectionMutations(id, worldIdNum);
  const { data: worldRooms } = useRoomTemplates(worldIdNum);

  const [assignments, setAssignments] = useState(null);
  const [propIds, setPropIds] = useState(null);
  const [freeProps, setFreeProps] = useState(null);
  const [newConnectionTargetId, setNewConnectionTargetId] = useState('');
  const [newConnectionLabel, setNewConnectionLabel] = useState('');
  const [newConnectionCost, setNewConnectionCost] = useState(1);

  const world = worlds?.find((w) => w.id === worldIdNum);

  if (isLoading || !worlds || !characters || !allProps || !config) return <p>読み込み中...</p>;

  const currentAssignments =
    assignments ??
    Object.fromEntries(
      config.slot_assignments.map((slot) => [
        slot.slot_id,
        slot.assignments.map((a) => ({ character_id: a.character_id, time_slot_indices: a.time_slot_indices })),
      ]),
    );
  const currentPropIds = propIds ?? config.props.map((p) => p.id);
  const currentFreeProps = freeProps ?? config.free_props.map((p) => p.description);

  const candidateCategoryIds = new Set(config.candidate_prop_categories.map((c) => c.id));
  const candidateProps = allProps.filter((p) => candidateCategoryIds.has(p.category_id));

  function addAssignmentRow(slotId) {
    const firstCharacterId = characters[0]?.id;
    if (firstCharacterId == null) return;
    setAssignments({
      ...currentAssignments,
      [slotId]: [...(currentAssignments[slotId] ?? []), { character_id: firstCharacterId, time_slot_indices: [] }],
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
          character_id: Number(a.character_id),
          time_slot_indices: a.time_slot_indices,
        })),
      })),
      prop_ids: currentPropIds,
      free_props: currentFreeProps,
    });
    setAssignments(null);
    setPropIds(null);
    setFreeProps(null);
  }

  async function handleAddConnection() {
    if (!newConnectionTargetId) return;
    await connectionMutations.create.mutateAsync({
      to_room_template_id: Number(newConnectionTargetId),
      label: newConnectionLabel,
      movement_cost: newConnectionCost,
    });
    setNewConnectionTargetId('');
    setNewConnectionLabel('');
    setNewConnectionCost(1);
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
                              value={row.character_id}
                              onChange={(e) => updateAssignmentRow(slot.slot_id, index, { character_id: Number(e.target.value) })}
                            >
                              {characters.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {tagMatchedIds.has(c.id) ? `★ ${c.name}` : c.name}
                                </option>
                              ))}
                            </select>
                            <button onClick={() => removeAssignmentRow(slot.slot_id, index)}>削除</button>
                          </div>
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
                    <button onClick={() => connectionMutations.remove.mutateAsync(c.id)}>削除</button>
                  </div>
                ))}
                {(connections ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888' }}>まだ設定されていません</p>}
              </div>
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
                <button onClick={handleAddConnection} disabled={!newConnectionTargetId}>
                  + 追加
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={() => navigate(`/rooms/${id}/edit`)}>部屋マスタ編集に戻る</button>
        <button onClick={handleSave}>保存</button>
      </div>
    </div>
  );
}
