import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useWorlds } from '../hooks/useWorlds.js';
import { useAllPropCategories } from '../hooks/usePropCategories.js';
import {
  useRoomTemplate,
  useRoomTemplateMutations,
  useRoomWorlds,
  useRoomWorldMutations,
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
  worldview_mode: 'inherit',
  initial_situation: '',
  location_text: '',
  location_tags: [],
  atmosphere_text: '',
  atmosphere_tags: [],
  worldview: '',
  slots: [],
  prop_category_ids: [],
  turns_per_time_slot_enabled: false,
  turns_per_time_slot: 15,
  attribute_tags: [],
  is_place: false,
};

// Room master data now: what a room IS, shared across every World that
// attaches it (see 0030_room_world_decoupling.sql). World-specific concerns
// — who actually fills a participant slot, which exact props are placed,
// the connection graph — live on RoomWorldConfigPage.jsx instead.
export default function RoomTemplateEditPage() {
  const { id } = useParams();
  const isNew = id === undefined;
  const navigate = useNavigate();
  const { data: worlds } = useWorlds();
  const { data: propCategories } = useAllPropCategories();
  const { data: existing } = useRoomTemplate(isNew ? null : id);
  const { create, update, uploadBackgroundImage, generateBackgroundImage } = useRoomTemplateMutations();
  const { data: attachedWorlds } = useRoomWorlds(isNew ? null : id);
  const { attach, detach } = useRoomWorldMutations(isNew ? null : id);
  const [form, setForm] = useState(emptyForm);
  const [policyHint, setPolicyHint] = useState('');
  const [bgGenerating, setBgGenerating] = useState(false);
  const [bgGenerateError, setBgGenerateError] = useState(null);
  const [bgGenerateWorldId, setBgGenerateWorldId] = useState('');
  const [attachWorldId, setAttachWorldId] = useState('');

  useEffect(() => {
    if (!existing) return;
    setForm({
      name: existing.name,
      worldview_mode: existing.worldview_mode,
      initial_situation: existing.initial_situation,
      location_text: existing.location_text,
      location_tags: tagsToArray(existing.location_tags),
      atmosphere_text: existing.atmosphere_text,
      atmosphere_tags: tagsToArray(existing.atmosphere_tags),
      worldview: existing.worldview || '',
      slots: existing.slots.map((s) => ({ id: s.id, attribute_tags: tagsToArray(s.attribute_tags), note: s.note })),
      prop_category_ids: existing.candidate_prop_categories.map((c) => c.id),
      turns_per_time_slot_enabled: existing.turns_per_time_slot != null,
      turns_per_time_slot: existing.turns_per_time_slot ?? 15,
      background_image_path: existing.background_image_path,
      attribute_tags: tagsToArray(existing.attribute_tags),
      is_place: Boolean(existing.is_place),
    });
  }, [existing]);

  useEffect(() => {
    if (attachedWorlds?.length > 0 && !bgGenerateWorldId) setBgGenerateWorldId(String(attachedWorlds[0].id));
  }, [attachedWorlds, bgGenerateWorldId]);

  function addSlot() {
    setForm((f) => ({ ...f, slots: [...f.slots, { attribute_tags: [], note: '' }] }));
  }

  function updateSlot(index, patch) {
    setForm((f) => ({ ...f, slots: f.slots.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  }

  function removeSlot(index) {
    setForm((f) => ({ ...f, slots: f.slots.filter((_, i) => i !== index) }));
  }

  function toggleCategory(categoryId) {
    setForm((f) => ({
      ...f,
      prop_category_ids: f.prop_category_ids.includes(categoryId)
        ? f.prop_category_ids.filter((id2) => id2 !== categoryId)
        : [...f.prop_category_ids, categoryId],
    }));
  }

  async function save() {
    const payload = {
      name: form.name,
      worldview_mode: form.worldview_mode,
      initial_situation: form.initial_situation,
      location_text: form.location_text,
      location_tags: tagsToText(form.location_tags),
      atmosphere_text: form.atmosphere_text,
      atmosphere_tags: tagsToText(form.atmosphere_tags),
      worldview: form.worldview_mode === 'custom' ? form.worldview : null,
      slots: form.slots.map((s, i) => ({ attribute_tags: tagsToText(s.attribute_tags), note: s.note, sort_order: i })),
      prop_category_ids: form.prop_category_ids,
      turns_per_time_slot: form.turns_per_time_slot_enabled ? form.turns_per_time_slot : null,
      attribute_tags: tagsToText(form.attribute_tags),
      is_place: form.is_place,
    };
    if (isNew) {
      const created = await create.mutateAsync(payload);
      navigate(`/rooms/${created.id}/edit`);
    } else {
      await update.mutateAsync({ id, data: payload });
      navigate('/rooms');
    }
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
      await generateBackgroundImage.mutateAsync({ id, mode, worldId: bgGenerateWorldId ? Number(bgGenerateWorldId) : null });
    } catch (err) {
      setBgGenerateError(err.message);
    } finally {
      setBgGenerating(false);
    }
  }

  async function handleAttachWorld() {
    if (!attachWorldId) return;
    await attach.mutateAsync(Number(attachWorldId));
    setAttachWorldId('');
  }

  const attachedWorldIds = new Set((attachedWorlds ?? []).map((w) => w.id));
  const attachCandidates = (worlds ?? []).filter((w) => !w.is_unassigned_bucket && !attachedWorldIds.has(w.id));

  if (!worlds || !propCategories) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>{isNew ? '新規部屋（共通マスタ）' : '部屋（共通マスタ）を編集'}</h2>
      <p style={{ fontSize: 11, color: '#888', marginTop: -8 }}>
        ここで編集する内容は複数の世界観で共有されます。誰が同席するか・どんなPropを置くか・どこへ移動できるかは、下のアタッチ済みWorldごとの設定画面で決めます。
      </p>

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
              <p style={{ fontSize: 12, color: '#666' }}>継承時は同席するWorldの世界観がそのまま使われます</p>
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
            {!isNew && (attachedWorlds?.length ?? 0) > 0 && (
              <label style={{ display: 'block', marginBottom: 6, fontSize: 12 }}>
                どのWorldのスタイルで生成するか
                <select
                  style={{ display: 'block', width: '100%' }}
                  value={bgGenerateWorldId}
                  onChange={(e) => setBgGenerateWorldId(e.target.value)}
                >
                  {attachedWorlds.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
            <p style={{ marginBottom: 4 }}>出現候補の設備・機材カテゴリ</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              ここでは大まかなカテゴリだけ選びます。実際にどの個体を置くかはWorldごとの設定画面で決めます。
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {propCategories.map((cat) => (
                <label
                  key={cat.id}
                  style={{
                    fontSize: 12,
                    padding: '3px 8px',
                    borderRadius: 999,
                    border: '1px solid #ccc',
                    background: form.prop_category_ids.includes(cat.id) ? '#dbeafe' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    style={{ marginRight: 4 }}
                    checked={form.prop_category_ids.includes(cat.id)}
                    onChange={() => toggleCategory(cat.id)}
                  />
                  {cat.name}
                </label>
              ))}
              {propCategories.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>カテゴリが登録されていません</p>}
            </div>
          </div>

          <div>
            <p style={{ marginBottom: 4 }}>参加キャラ枠</p>
            <p style={{ fontSize: 11, color: '#888', margin: '0 0 4px' }}>
              属性キーで抽象的に枠だけ定義します。どのキャラを実際に充てるかはWorldごとの設定画面で選びます。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {form.slots.map((slot, i) => (
                <div key={slot.id ?? `new-${i}`} style={{ border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <input
                      style={{ flex: 1, marginRight: 6 }}
                      placeholder="枠のメモ（例：部活の先輩）"
                      value={slot.note}
                      onChange={(e) => updateSlot(i, { note: e.target.value })}
                    />
                    <button onClick={() => removeSlot(i)}>削除</button>
                  </div>
                  <TagChips
                    tags={slot.attribute_tags}
                    onChange={(tags) => updateSlot(i, { attribute_tags: tags })}
                    placeholder="+ 属性キーを追加"
                  />
                </div>
              ))}
              {form.slots.length === 0 && <p style={{ fontSize: 12, color: '#888' }}>まだ枠がありません</p>}
            </div>
            <button style={{ marginTop: 6 }} onClick={addSlot}>
              + 枠を追加
            </button>
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
              他の部屋とつながりのある「場所」として扱う（移動先はWorldごとの設定画面で設定できます）
            </label>
          </div>

          {!isNew && (
            <div style={{ borderTop: '1px solid #ddd', paddingTop: 10 }}>
              <p style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>アタッチ済みWorld</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                {(attachedWorlds ?? []).map((w) => (
                  <div
                    key={w.id}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, border: '1px solid #eee', borderRadius: 6, padding: '4px 8px' }}
                  >
                    <span style={{ flex: 1 }}>{w.name}</span>
                    <Link to={`/rooms/${id}/worlds/${w.id}`}>
                      <button>設定</button>
                    </Link>
                    <button onClick={() => detach.mutateAsync(w.id)}>切り離す</button>
                  </div>
                ))}
                {(attachedWorlds ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888' }}>まだどのWorldにもアタッチされていません</p>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select style={{ flex: 1 }} value={attachWorldId} onChange={(e) => setAttachWorldId(e.target.value)}>
                  <option value="">アタッチするWorldを選択</option>
                  {attachCandidates.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
                <button onClick={handleAttachWorld} disabled={!attachWorldId}>
                  + アタッチ
                </button>
              </div>
            </div>
          )}
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
