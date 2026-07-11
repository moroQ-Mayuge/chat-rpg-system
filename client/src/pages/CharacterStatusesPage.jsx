import { useState } from 'react';
import { useWorlds } from '../hooks/useWorlds.js';
import { useAllCharacterStatuses, useCharacterStatusMutations } from '../hooks/useCharacterStatuses.js';
import { useRelationshipAxes } from '../hooks/useRelationshipAxes.js';
import { useAxisStatusTriggers, useAxisStatusTriggerMutations } from '../hooks/useAxisStatusTriggers.js';

const emptyForm = {
  world_id: '',
  name: '',
  persistence_scope: 'session',
  removes_from_session: false,
  exclusive_group: '',
  default_address_on_grant: '',
};

const SCOPE_LABELS = {
  playthrough: '永続（部屋を移動しても持続）',
  session: 'セッション単位（部屋を移動・再入室でリセット）',
  accompanying: '同行中のみ継続（同行が続く限り引き継ぎ）',
};

function worldLabel(worldId, worlds) {
  if (worldId == null) return '共通';
  return worlds.find((w) => w.id === worldId)?.name ?? `World#${worldId}`;
}

export default function CharacterStatusesPage() {
  const { data: worlds, isLoading: worldsLoading } = useWorlds();
  const { data: statuses, isLoading } = useAllCharacterStatuses();
  const { create, remove } = useCharacterStatusMutations();
  const [form, setForm] = useState(emptyForm);

  async function handleCreate() {
    if (!form.name) return;
    await create.mutateAsync({ ...form, world_id: form.world_id ? Number(form.world_id) : null });
    setForm(emptyForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('このキャラ状態を削除しますか？')) return;
    await remove.mutateAsync(id);
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
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
          >
            <span>
              {s.name}{' '}
              <span style={{ fontSize: 11, color: '#888' }}>
                [{worldLabel(s.world_id, worlds)}] {SCOPE_LABELS[s.persistence_scope]}
                {s.removes_from_session ? '／セッション参加者から自動除外' : ''}
                {s.exclusive_group ? `／排他グループ:${s.exclusive_group}` : ''}
                {s.default_address_on_grant ? `／付与時に呼び方を「${s.default_address_on_grant}」へ変更` : ''}
              </span>
            </span>
            <button onClick={() => handleDelete(s.id)}>削除</button>
          </div>
        ))}
        {statuses.length === 0 && <p style={{ fontSize: 12, color: '#999' }}>まだキャラ状態がありません</p>}
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>新規登録</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>名前</span>
            <input style={{ width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：気絶" />
          </label>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>所属World</span>
            <select style={{ width: '100%' }} value={form.world_id} onChange={(e) => setForm({ ...form, world_id: e.target.value })}>
              <option value="">共通</option>
              {worlds.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        </div>
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
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleCreate} disabled={!form.name}>
            追加
          </button>
        </div>
      </div>

      <AxisStatusTriggersSection statuses={statuses} />
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
