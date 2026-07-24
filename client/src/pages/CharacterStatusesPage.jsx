import { useState } from 'react';
import { useWorlds } from '../hooks/useWorlds.js';
import { useAllCharacterStatuses, useCharacterStatusMutations, useStatusWorlds, useStatusWorldMutations } from '../hooks/useCharacterStatuses.js';
import { useRelationshipAxes } from '../hooks/useRelationshipAxes.js';
import { useAxisStatusTriggers, useAxisStatusTriggerMutations } from '../hooks/useAxisStatusTriggers.js';

const emptyForm = {
  name: '',
  persistence_scope: 'session',
  removes_from_session: false,
  exclusive_group: '',
  default_address_on_grant: '',
  suppresses_outfit_fields: '',
  disturbs_outfit_field: '',
  disturbance_style: '',
  disturbs_torn: false,
};

// The 4 OUTFIT_TAG_FIELDS the undress-state ladder actually tracks
// (undressState.js's UNDRESS_STATE_TRACKS) -- the other 15 outfit tag
// columns have no undress-ladder concept, so they're excluded here.
const DISTURBABLE_FIELDS = [
  ['clothing_upper', '服装：上半身'],
  ['clothing_upper_outer', '上着：上半身'],
  ['clothing_lower', '服装：下半身'],
  ['clothing_lower_outer', '上着：下半身'],
  ['underwear_upper', '下着：上半身'],
  ['underwear_lower', '下着：下半身'],
];

const DISTURBANCE_STYLES = [
  ['open', '開く（ボタン式シャツ等）'],
  ['pull', 'ずらす（チューブトップ等）'],
  ['lift', 'たくし上げる（スカート等）'],
  ['aside', '横にずらす（首掛けワンピ等）'],
];

const SCOPE_LABELS = {
  playthrough: '永続（部屋を移動しても持続）',
  session: 'セッション単位（部屋を移動・再入室でリセット）',
  accompanying: '同行中のみ継続（同行が続く限り引き継ぎ）',
};

// undress_state_upper_*/undress_state_lower_* (undressState.js's 4-track
// convention) share status names across the two tracks by design (e.g. both
// upper and lower have their own "なし"), which makes same-named rows hard
// to tell apart at a glance in this flat list -- surface a colored badge
// instead of making the reader parse the raw exclusive_group string.
function undressBodyPartLabel(exclusiveGroup) {
  if (!exclusiveGroup) return null;
  if (exclusiveGroup.includes('_upper_')) return '上半身';
  if (exclusiveGroup.includes('_lower_')) return '下半身';
  return null;
}

function statusToForm(s) {
  return {
    name: s.name,
    persistence_scope: s.persistence_scope,
    removes_from_session: s.removes_from_session,
    exclusive_group: s.exclusive_group ?? '',
    default_address_on_grant: s.default_address_on_grant ?? '',
    suppresses_outfit_fields: s.suppresses_outfit_fields ?? '',
    disturbs_outfit_field: s.disturbs_outfit_field ?? '',
    disturbance_style: s.disturbance_style ?? '',
    disturbs_torn: Boolean(s.disturbs_torn),
  };
}

export default function CharacterStatusesPage() {
  const { data: worlds, isLoading: worldsLoading } = useWorlds();
  const { data: statuses, isLoading } = useAllCharacterStatuses();
  const { create, update, remove } = useCharacterStatusMutations();
  const [selectedId, setSelectedId] = useState(null);
  const isNew = selectedId === 'new';
  const [form, setForm] = useState(emptyForm);

  function selectStatus(id) {
    setSelectedId(id);
    if (id === 'new' || id == null) {
      setForm(emptyForm);
    } else {
      const found = statuses.find((s) => s.id === id);
      if (found) setForm(statusToForm(found));
    }
  }

  async function handleSave() {
    if (!form.name) return;
    if (isNew) {
      await create.mutateAsync(form);
      setSelectedId(null);
    } else {
      await update.mutateAsync({ id: selectedId, data: form });
    }
    setForm(emptyForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('このキャラ状態を削除しますか？')) return;
    await remove.mutateAsync(id);
    if (selectedId === id) selectStatus(null);
  }

  if (worldsLoading || isLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>キャラ状態マスター</h2>
      <p style={{ fontSize: 11, color: '#888' }}>
        気絶・死亡など、数値ではなくカテゴリ的な状態を管理します。持続範囲（永続／セッション単位／同行中のみ継続）は状態ごとに設定します。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {statuses.map((s) => (
          <div
            key={s.id}
            onClick={() => selectStatus(s.id)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 8,
              border: selectedId === s.id ? '1px solid #6366f1' : '1px solid #ddd',
              borderRadius: 6,
              cursor: 'pointer',
              background: selectedId === s.id ? '#eef2ff' : 'transparent',
            }}
          >
            <span>
              {undressBodyPartLabel(s.exclusive_group) && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#fff',
                    background: undressBodyPartLabel(s.exclusive_group) === '上半身' ? '#2563eb' : '#ea580c',
                    borderRadius: 4,
                    padding: '1px 5px',
                    marginRight: 6,
                  }}
                >
                  {undressBodyPartLabel(s.exclusive_group)}
                </span>
              )}
              {s.name}{' '}
              <span style={{ fontSize: 11, color: '#888' }}>
                {SCOPE_LABELS[s.persistence_scope]}
                {s.removes_from_session ? '／セッション参加者から自動除外' : ''}
                {s.exclusive_group ? `／排他グループ:${s.exclusive_group}` : ''}
                {s.default_address_on_grant ? `／付与時に呼び方を「${s.default_address_on_grant}」へ変更` : ''}
                {s.suppresses_outfit_fields ? `／抑制する衣装タグ:${s.suppresses_outfit_fields}` : ''}
                {s.disturbs_outfit_field && s.disturbance_style ? `／乱れ:${s.disturbs_outfit_field}=${s.disturbance_style}` : ''}
                {s.disturbs_outfit_field && s.disturbs_torn ? `／${s.disturbance_style ? '+' : ''}torn:${s.disturbs_outfit_field}` : ''}
              </span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(s.id);
              }}
            >
              削除
            </button>
          </div>
        ))}
        {statuses.length === 0 && <p style={{ fontSize: 12, color: '#999' }}>まだキャラ状態がありません</p>}
        {selectedId !== 'new' && <button onClick={() => selectStatus('new')}>+ 新規登録</button>}
      </div>

      {selectedId != null && (
        <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
          <p style={{ fontWeight: 500 }}>{isNew ? '新規登録' : '編集'}</p>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>名前</span>
            <input style={{ width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：気絶" />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>持続範囲</span>
            <select
              style={{ width: '100%' }}
              value={form.persistence_scope}
              onChange={(e) => setForm({ ...form, persistence_scope: e.target.value })}
            >
              {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={form.removes_from_session}
              onChange={(e) => setForm({ ...form, removes_from_session: e.target.checked })}
            />
            この状態が付与されたキャラをセッション参加者から自動的に除外する
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>排他グループ（任意）</span>
              <input
                style={{ width: '100%' }}
                value={form.exclusive_group}
                onChange={(e) => setForm({ ...form, exclusive_group: e.target.value })}
                placeholder="例：関係（同じグループ内は常に1つだけアクティブになる）"
              />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>付与時に呼び方を自動変更（任意）</span>
              <input
                style={{ width: '100%' }}
                value={form.default_address_on_grant}
                onChange={(e) => setForm({ ...form, default_address_on_grant: e.target.value })}
                placeholder="例：あなた♡（空欄なら呼び方は変更しない）"
              />
            </label>
          </div>
          <label style={{ display: 'block', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>抑制する衣装タグ列（カンマ区切り、任意）</span>
            <input
              style={{ width: '100%' }}
              value={form.suppresses_outfit_fields}
              onChange={(e) => setForm({ ...form, suppresses_outfit_fields: e.target.value })}
              placeholder="例：clothing_upper_outer,clothing_upper（このステータスがアクティブな間、画像生成タグから除外）"
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>乱れ対象フィールド（任意）</span>
              <select
                style={{ width: '100%' }}
                value={form.disturbs_outfit_field}
                onChange={(e) => setForm({ ...form, disturbs_outfit_field: e.target.value })}
              >
                <option value="">なし</option>
                {DISTURBABLE_FIELDS.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>乱れスタイル（任意）</span>
              <select
                style={{ width: '100%' }}
                value={form.disturbance_style}
                onChange={(e) => setForm({ ...form, disturbance_style: e.target.value })}
              >
                <option value="">なし</option>
                {DISTURBANCE_STYLES.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={form.disturbs_torn}
              onChange={(e) => setForm({ ...form, disturbs_torn: e.target.checked })}
            />
            「破る（torn）」を同時に適用する（乱れスタイルとは排他ではなく併用可）
          </label>
          <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
            このステータスがアクティブな間、指定フィールドは（抑制されていなければ）タグを表示したまま、先頭のタグ（主たる構造語、例：shirt）だけを書き換えます。乱れスタイルが衣装側の「操作可能」設定に含まれていない場合はスタイル語のみ落ち、torn単独/併用は常に適用されます（例：shirt lift / torn shirt / torn shirt lift）。
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSave} disabled={!form.name}>
              {isNew ? '追加' : '保存'}
            </button>
          </div>

          {!isNew && <StatusWorldsSection statusId={selectedId} worlds={worlds} />}
        </div>
      )}

      <AxisStatusTriggersSection statuses={statuses} />
    </div>
  );
}

function StatusWorldsSection({ statusId, worlds }) {
  const { data: attachedWorlds } = useStatusWorlds(statusId);
  const { attach, detach } = useStatusWorldMutations(statusId);
  const [attachWorldId, setAttachWorldId] = useState('');

  const attachedIds = new Set((attachedWorlds ?? []).map((w) => w.id));
  const attachCandidates = (worlds ?? []).filter((w) => !attachedIds.has(w.id));

  async function handleAttach() {
    if (!attachWorldId) return;
    await attach.mutateAsync(Number(attachWorldId));
    setAttachWorldId('');
  }

  return (
    <div style={{ borderTop: '1px solid #ddd', paddingTop: 10, marginTop: 16 }}>
      <p style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>アタッチ済みWorld</p>
      <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
        どのWorldにもアタッチされていない場合は共通（全Worldで使用可能）として扱われます。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
        {(attachedWorlds ?? []).map((w) => (
          <div
            key={w.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, border: '1px solid #eee', borderRadius: 6, padding: '4px 8px' }}
          >
            <span style={{ flex: 1 }}>{w.name}</span>
            <button onClick={() => detach.mutateAsync(w.id)}>切り離す</button>
          </div>
        ))}
        {(attachedWorlds ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888' }}>共通（全Worldで使用可能）</p>}
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
        <button onClick={handleAttach} disabled={!attachWorldId}>
          + アタッチ
        </button>
      </div>
    </div>
  );
}

const emptyTriggerForm = { relationship_axis_id: '', comparison: '<=', threshold_value: 0, status_id: '' };

function AxisStatusTriggersSection({ statuses }) {
  const { data: axes, isLoading: axesLoading } = useRelationshipAxes();
  const { data: triggers, isLoading: triggersLoading } = useAxisStatusTriggers();
  const { create, remove } = useAxisStatusTriggerMutations();
  const [form, setForm] = useState(emptyTriggerForm);

  async function handleCreate() {
    if (!form.relationship_axis_id || !form.status_id) return;
    await create.mutateAsync({
      relationship_axis_id: Number(form.relationship_axis_id),
      comparison: form.comparison,
      threshold_value: Number(form.threshold_value),
      status_id: Number(form.status_id),
    });
    setForm(emptyTriggerForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('このしきい値トリガーを削除しますか？')) return;
    await remove.mutateAsync(id);
  }

  if (axesLoading || triggersLoading) return null;

  const axisName = (id) => axes.find((a) => a.id === id)?.name ?? `軸#${id}`;
  const statusName = (id) => statuses.find((s) => s.id === id)?.name ?? `状態#${id}`;

  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 15 }}>しきい値トリガー</h3>
      <p style={{ fontSize: 11, color: '#888' }}>
        自己ステータスや関係性軸の値が条件を満たす／外れるとキャラ状態を自動的に付与／解除します。状態がロックされている間は自動解除されません（自動付与は既にロック中でも妨げません）。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {triggers.map((t) => (
          <div
            key={t.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
          >
            <span>
              {axisName(t.relationship_axis_id)} {t.comparison} {t.threshold_value} → 「{statusName(t.status_id)}」を自動付与／それ以外で自動解除
            </span>
            <button onClick={() => handleDelete(t.id)}>削除</button>
          </div>
        ))}
        {triggers.length === 0 && <p style={{ fontSize: 12, color: '#999' }}>まだしきい値トリガーがありません</p>}
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>新規登録</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <label style={{ flex: 2 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>軸</span>
            <select
              style={{ width: '100%' }}
              value={form.relationship_axis_id}
              onChange={(e) => setForm({ ...form, relationship_axis_id: e.target.value })}
            >
              <option value="">選択してください</option>
              {axes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>比較</span>
            <select style={{ width: '100%' }} value={form.comparison} onChange={(e) => setForm({ ...form, comparison: e.target.value })}>
              {['>=', '<=', '==', '>', '<'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>しきい値</span>
            <input
              style={{ width: '100%' }}
              type="number"
              value={form.threshold_value}
              onChange={(e) => setForm({ ...form, threshold_value: e.target.value })}
            />
          </label>
          <label style={{ flex: 2 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>キャラ状態</span>
            <select style={{ width: '100%' }} value={form.status_id} onChange={(e) => setForm({ ...form, status_id: e.target.value })}>
              <option value="">選択してください</option>
              {statuses.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleCreate} disabled={!form.relationship_axis_id || !form.status_id}>
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
