import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorlds } from '../hooks/useWorlds.js';
import { useProps } from '../hooks/useProps.js';
import { useCharacters } from '../hooks/useCharacters.js';
import {
  useRoomTemplates,
  useRoomTemplate,
  useRoomTemplateMutations,
  useRoomConnections,
  useRoomConnectionMutations,
} from '../hooks/useRoomTemplates.js';
import TagChips from '../components/ui/TagChips.jsx';

function tagsToArray(text) {
  return (text || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function tagsToText(tags) {
  return tags.join(', ');
}

const emptyForm = {
  name: '',
  world_id: null,
  worldview_mode: 'inherit',
  initial_situation: '',
  location_text: '',
  location_tags: [],
  atmosphere_text: '',
  atmosphere_tags: [],
  worldview: '',
  prop_ids: [],
  free_props: [],
  character_ids: [],
  turns_per_time_slot_enabled: false,
  turns_per_time_slot: 15,
  attribute_tags: [],
  is_place: false,
};

export default function RoomTemplateEditPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { data: worlds } = useWorlds();
  const { data: propsLibrary } = useProps();
  const { data: characters } = useCharacters();
  const { data: allRoomTemplates } = useRoomTemplates();
  const { data: existing } = useRoomTemplate(isNew ? null : id);
  const { create, update, uploadBackgroundImage, generateBackgroundImage } = useRoomTemplateMutations();
  const { data: connections } = useRoomConnections(isNew ? null : id);
  const connectionMutations = useRoomConnectionMutations(isNew ? null : id);
  const [form, setForm] = useState(emptyForm);
  const [policyHint, setPolicyHint] = useState('');
  const [bgGenerating, setBgGenerating] = useState(false);
  const [bgGenerateError, setBgGenerateError] = useState(null);
  const [newConnectionTargetId, setNewConnectionTargetId] = useState('');
  const [newConnectionLabel, setNewConnectionLabel] = useState('');
  const [newConnectionCost, setNewConnectionCost] = useState(1);

  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name,
      world_id: existing.world_id,
      worldview_mode: existing.worldview_mode,
      initial_situation: existing.initial_situation,
      location_text: existing.location_text,
      location_tags: tagsToArray(existing.location_tags),
      atmosphere_text: existing.atmosphere_text,
      atmosphere_tags: tagsToArray(existing.atmosphere_tags),
      worldview: existing.worldview || '',
      prop_ids: existing.prop_ids,
      free_props: existing.free_props.map((p) => p.description),
      character_ids: existing.character_ids,
      turns_per_time_slot_enabled: existing.turns_per_time_slot != null,
      turns_per_time_slot: existing.turns_per_time_slot ?? 15,
      background_image_path: existing.background_image_path,
      attribute_tags: tagsToArray(existing.attribute_tags),
      is_place: Boolean(existing.is_place),
    });
  }, [existing]);

  const selectedWorld = worlds?.find((w) => w.id === (form.world_id ?? worlds?.find((w2) => w2.is_unassigned_bucket)?.id));

  // Attribute-key auto-matching (chat enhancement backlog item 23): purely a
  // visual suggestion here — actual "auto include" happens via character_join
  // event actions using selection_mode 'tag_match'. This just highlights
  // which characters would already be eligible, to help authoring.
  const contextTags = new Set([...form.attribute_tags, ...tagsToArray(selectedWorld?.attribute_tags)]);
  const tagMatchedCharacterIds = new Set(
    (characters ?? [])
      .filter((c) => contextTags.size > 0 && tagsToArray(c.attribute_tags).some((t) => contextTags.has(t)))
      .map((c) => c.id),
  );

  function toggleProp(propId) {
    setForm((f) => ({
      ...f,
      prop_ids: f.prop_ids.includes(propId) ? f.prop_ids.filter((id2) => id2 !== propId) : [...f.prop_ids, propId],
    }));
  }

  function toggleCharacter(characterId) {
    setForm((f) => ({
      ...f,
      character_ids: f.character_ids.includes(characterId)
        ? f.character_ids.filter((id2) => id2 !== characterId)
        : [...f.character_ids, characterId],
    }));
  }

  async function save() {
    const payload = {
      name: form.name,
      world_id: form.world_id,
      worldview_mode: form.worldview_mode,
      initial_situation: form.initial_situation,
      location_text: form.location_text,
      location_tags: tagsToText(form.location_tags),
      atmosphere_text: form.atmosphere_text,
      atmosphere_tags: tagsToText(form.atmosphere_tags),
      worldview: form.worldview_mode === 'custom' ? form.worldview : null,
      prop_ids: form.prop_ids,
      free_props: form.free_props,
      character_ids: form.character_ids,
      turns_per_time_slot: form.turns_per_time_slot_enabled ? form.turns_per_time_slot : null,
      attribute_tags: tagsToText(form.attribute_tags),
      is_place: form.is_place,
    };
    if (isNew) {
      await create.mutateAsync(payload);
    } else {
      await update.mutateAsync({ id, data: payload });
    }
    navigate('/rooms');
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

  async function handleBackgroundUpload(e) {
    const file = e.target.files[0];
    if (!file || isNew) return;
    await uploadBackgroundImage.mutateAsync({ id, file });
  }

  async function handleGenerateBackground(mode) {
    if (isNew) return;
    setBgGenerating(true);
    setBgGenerateError(null);
    try {
      await generateBackgroundImage.mutateAsync({ id, mode });
    } catch (err) {
      setBgGenerateError(err.message);
    } finally {
      setBgGenerating(false);
    }
  }

  const connectionTargetCandidates = (allRoomTemplates ?? []).filter(
    (rt) => rt.world_id === form.world_id && rt.id !== Number(id),
  );

  if (!worlds || !propsLibrary || !characters) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>{isNew ? '新規部屋' : '部屋を編集'}</h2>

      <div style={{ border: '1px solid var(--border-accent, #93c5fd)', borderRadius: 8, padding: 10, marginBottom: 14 }}>
        <p style={{ fontWeight: 500, margin: '0 0 6px' }}>LLMでランダム作成</p>
        <p style={{ margin: '0 0 4px' }}>方針（自由記述）</p>
        <textarea
          style={{ width: '100%', height: 40 }}
          value={policyHint}
          onChange={(e) => setPolicyHint(e.target.value)}
          placeholder="例：現代学園、放課後の静かな教室、恋愛イベント向け"
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button disabled title="KoboldCpp連携（Phase 5/6）実装後に有効化されます">
            この方針でランダム生成
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label>
            部屋名
            <input
              style={{ display: 'block', width: '100%' }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>

          <label>
            所属世界観
            <select
              style={{ display: 'block', width: '100%' }}
              value={form.world_id ?? ''}
              onChange={(e) => setForm({ ...form, world_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">未指定（未所属）</option>
              {worlds
                .filter((w) => !w.is_unassigned_bucket)
                .map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
            </select>
          </label>

          <div>
            <p style={{ marginBottom: 4 }}>世界観モード</p>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <button
                style={{ fontWeight: form.worldview_mode === 'inherit' ? 700 : 400 }}
                onClick={() => setForm({ ...form, worldview_mode: 'inherit' })}
              >
                継承
              </button>
              <button
                style={{ fontWeight: form.worldview_mode === 'custom' ? 700 : 400 }}
                onClick={() => setForm({ ...form, worldview_mode: 'custom' })}
              >
                独自
              </button>
            </div>
            {form.worldview_mode === 'inherit' ? (
              <p style={{ fontSize: 12, color: '#666' }}>プレビュー：「{selectedWorld?.worldview || '(世界観未設定)'}」</p>
            ) : (
              <textarea
                style={{ width: '100%', height: 46 }}
                value={form.worldview}
                onChange={(e) => setForm({ ...form, worldview: e.target.value })}
                placeholder="この部屋固有の世界観"
              />
            )}
          </div>

          <label>
            開始時のシチュエーション
            <textarea
              style={{ display: 'block', width: '100%', height: 46 }}
              value={form.initial_situation}
              onChange={(e) => setForm({ ...form, initial_situation: e.target.value })}
            />
          </label>

          <div>
            <p style={{ marginBottom: 4 }}>場所</p>
            <input
              style={{ display: 'block', width: '100%', marginBottom: 4 }}
              value={form.location_text}
              onChange={(e) => setForm({ ...form, location_text: e.target.value })}
            />
            <TagChips
              tags={form.location_tags}
              onChange={(tags) => setForm({ ...form, location_tags: tags })}
              placeholder="+ 画像生成用タグを追加"
            />
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>雰囲気</p>
            <input
              style={{ display: 'block', width: '100%', marginBottom: 4 }}
              value={form.atmosphere_text}
              onChange={(e) => setForm({ ...form, atmosphere_text: e.target.value })}
            />
            <TagChips
              tags={form.atmosphere_tags}
              onChange={(tags) => setForm({ ...form, atmosphere_tags: tags })}
              placeholder="+ 画像生成用タグを追加"
            />
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>属性キー</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              ここに設定したキーとキャラクターの属性キーが一致すると、そのキャラはこの部屋に自動同席できる対象になります
            </p>
            <TagChips
              tags={form.attribute_tags}
              onChange={(tags) => setForm({ ...form, attribute_tags: tags })}
              placeholder="例: 部活, 図書委員"
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div>
            <p style={{ marginBottom: 4 }}>背景イメージ</p>
            <div
              style={{
                aspectRatio: '16 / 9',
                background: form.background_image_path ? `url(${form.background_image_path}) center/cover` : '#eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#999',
                fontSize: 12,
                marginBottom: 6,
              }}
            >
              {!form.background_image_path && '未設定'}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <label style={{ flex: 1 }}>
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleBackgroundUpload} disabled={isNew} />
                <span style={{ display: 'block', textAlign: 'center', border: '1px solid #ccc', borderRadius: 6, padding: 6, cursor: isNew ? 'not-allowed' : 'pointer' }}>
                  アップロード{isNew && '（先に保存してください）'}
                </span>
              </label>
              <button style={{ flex: 1 }} onClick={() => handleGenerateBackground('fresh')} disabled={isNew || bgGenerating}>
                {bgGenerating ? '生成中...' : '新規生成'}
              </button>
              <button
                style={{ flex: 1 }}
                onClick={() => handleGenerateBackground('refine')}
                disabled={isNew || bgGenerating || !form.background_image_path}
                title={!form.background_image_path ? '既存の背景画像がある場合のみ使用できます' : '現在の画像を基に調整して再生成'}
              >
                {bgGenerating ? '生成中...' : '現在の画像から調整'}
              </button>
            </div>
            {bgGenerateError && <p style={{ color: 'red', fontSize: 11, marginTop: 4 }}>エラー: {bgGenerateError}</p>}
            {isNew && <p style={{ fontSize: 11, color: '#888', marginTop: 4 }}>画像生成は先に保存してから行えます</p>}
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>設備・機材</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
              {propsLibrary.map((prop) => (
                <label
                  key={prop.id}
                  style={{
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid #ccc',
                    background: form.prop_ids.includes(prop.id) ? '#dbeafe' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ marginRight: 4 }}
                    checked={form.prop_ids.includes(prop.id)}
                    onChange={() => toggleProp(prop.id)}
                  />
                  {prop.name}
                </label>
              ))}
            </div>
            <TagChips
              tags={form.free_props}
              onChange={(tags) => setForm({ ...form, free_props: tags })}
              placeholder="自由記述で追加（画像生成には未反映）"
            />
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>初期参加キャラクター</p>
            {tagMatchedCharacterIds.size > 0 && (
              <p style={{ fontSize: 11, color: '#2563eb', margin: '0 0 4px' }}>
                ★ = 属性キーが一致（この部屋またはWorldに自動同席可能な候補）
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {characters.map((c) => (
                <label
                  key={c.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    fontSize: 11,
                    gap: 2,
                    padding: 4,
                    borderRadius: 6,
                    background: tagMatchedCharacterIds.has(c.id) ? '#eff6ff' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.character_ids.includes(c.id)}
                    onChange={() => toggleCharacter(c.id)}
                  />
                  {tagMatchedCharacterIds.has(c.id) ? `★ ${c.name}` : c.name}
                </label>
              ))}
              {characters.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>キャラクターが登録されていません</p>}
            </div>
          </div>

          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.turns_per_time_slot_enabled}
                onChange={(e) => setForm({ ...form, turns_per_time_slot_enabled: e.target.checked })}
              />
              この部屋の会話ターン数で自動的にルートの時間帯を進める
            </label>
            {form.turns_per_time_slot_enabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <span>何ターンで進めるか</span>
                <input
                  type="number"
                  min="1"
                  style={{ width: 70 }}
                  value={form.turns_per_time_slot}
                  onChange={(e) => setForm({ ...form, turns_per_time_slot: Number(e.target.value) })}
                />
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #ddd', paddingTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={form.is_place}
                onChange={(e) => setForm({ ...form, is_place: e.target.checked })}
              />
              他の部屋とつながりのある「場所」として扱う（移動先を設定できます）
            </label>
            <p style={{ fontSize: 11, color: '#888', margin: '4px 0 0' }}>
              オンの部屋はチャット画面で「退出する」の代わりに移動先ボタンが表示され、移動には時間経過（サブカウント）が消費されます
            </p>

            {form.is_place && !isNew && (
              <div style={{ marginTop: 10 }}>
                <p style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>移動先（つながり）</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                  {(connections ?? []).map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        border: '1px solid #eee',
                        borderRadius: 6,
                        padding: '4px 8px',
                      }}
                    >
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
                  <select
                    style={{ flex: 1 }}
                    value={newConnectionTargetId}
                    onChange={(e) => setNewConnectionTargetId(e.target.value)}
                  >
                    <option value="">移動先の部屋を選択</option>
                    {connectionTargetCandidates.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.name}
                      </option>
                    ))}
                  </select>
                  <input
                    style={{ width: 100 }}
                    placeholder="ラベル（任意）"
                    value={newConnectionLabel}
                    onChange={(e) => setNewConnectionLabel(e.target.value)}
                  />
                  <input
                    type="number"
                    min="1"
                    style={{ width: 60 }}
                    value={newConnectionCost}
                    onChange={(e) => setNewConnectionCost(Number(e.target.value))}
                  />
                  <button onClick={handleAddConnection} disabled={!newConnectionTargetId}>
                    + 追加
                  </button>
                </div>
              </div>
            )}
            {form.is_place && isNew && (
              <p style={{ fontSize: 11, color: '#888', marginTop: 6 }}>移動先の設定は先に保存してから行えます</p>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={() => navigate('/rooms')}>キャンセル</button>
        <button onClick={save} disabled={!form.name}>
          保存
        </button>
      </div>
    </div>
  );
}
