import { useState } from 'react';
import { useRelationshipAxes, useRelationshipAxisMutations } from '../hooks/useRelationshipAxes.js';

const emptyForm = {
  name: '',
  min_value: 0,
  max_value: 100,
  default_value: 0,
  scope: 'relationship',
  regen_per_time_slot: '',
  llm_auto_update_enabled: true,
};

export default function RelationshipAxesPage() {
  const { data: axes, isLoading } = useRelationshipAxes();
  const { create, update, remove } = useRelationshipAxisMutations();
  const [form, setForm] = useState(emptyForm);

  async function handleCreate() {
    if (!form.name) return;
    await create.mutateAsync({
      ...form,
      regen_per_time_slot: form.regen_per_time_slot === '' ? null : Number(form.regen_per_time_slot),
    });
    setForm(emptyForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('この関係性軸を削除しますか？（キャラの初期値も失われます）')) return;
    await remove.mutateAsync(id);
  }

  // LLMによる状態値/関係値の自動増減（SPEC.md）の対象からこの軸を個別に除外/復帰する。
  // update APIは全フィールドを受け取る実装のため、既存値をそのまま引き回しつつ
  // このフラグだけ反転させて送る。
  async function handleToggleLlmAutoUpdate(axis) {
    await update.mutateAsync({
      id: axis.id,
      data: { ...axis, llm_auto_update_enabled: !axis.llm_auto_update_enabled },
    });
  }

  if (isLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>関係性軸／自己ステータスマスター</h2>
      <p style={{ fontSize: 11, color: '#888' }}>
        「関係性軸」はあなたに対する関係性（好感度等）、「自己ステータス」はキャラ自身のパラメータ（体力等）です。仕組みは共通（同じ値の範囲・初期値・時間経過での自然増減）で、区分はカテゴリ分け用です。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {axes.map((axis) => (
          <div
            key={axis.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
          >
            <span>
              {axis.name}{' '}
              <span style={{ fontSize: 11, color: '#888' }}>
                [{axis.scope === 'self_stat' ? '自己ステータス' : '関係性軸'}] {axis.min_value}〜{axis.max_value}（初期値既定 {axis.default_value}）
                {axis.regen_per_time_slot != null && `／時間帯ごとに${axis.regen_per_time_slot > 0 ? '+' : ''}${axis.regen_per_time_slot}`}
              </span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={Boolean(axis.llm_auto_update_enabled)} onChange={() => handleToggleLlmAutoUpdate(axis)} />
                LLM自動増減の対象
              </label>
              <button onClick={() => handleDelete(axis.id)}>削除</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>新規登録</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label>
            名前
            <input style={{ display: 'block', width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            区分
            <select style={{ display: 'block', width: '100%' }} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
              <option value="relationship">関係性軸（対あなた）</option>
              <option value="self_stat">自己ステータス（キャラ自身）</option>
            </select>
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label>
            最小値
            <input type="number" style={{ display: 'block', width: '100%' }} value={form.min_value} onChange={(e) => setForm({ ...form, min_value: Number(e.target.value) })} />
          </label>
          <label>
            最大値
            <input type="number" style={{ display: 'block', width: '100%' }} value={form.max_value} onChange={(e) => setForm({ ...form, max_value: Number(e.target.value) })} />
          </label>
          <label>
            既定初期値
            <input type="number" style={{ display: 'block', width: '100%' }} value={form.default_value} onChange={(e) => setForm({ ...form, default_value: Number(e.target.value) })} />
          </label>
          <label>
            時間帯ごとの自然増減（任意）
            <input
              type="number"
              style={{ display: 'block', width: '100%' }}
              value={form.regen_per_time_slot}
              onChange={(e) => setForm({ ...form, regen_per_time_slot: e.target.value })}
              placeholder="空欄で無効"
            />
          </label>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8, fontSize: 13 }}>
          <input
            type="checkbox"
            checked={form.llm_auto_update_enabled}
            onChange={(e) => setForm({ ...form, llm_auto_update_enabled: e.target.checked })}
          />
          LLMによる自動増減の対象にする（状態値は毎送信ごと、関係値はWorld設定の間隔ごと）
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleCreate} disabled={!form.name}>
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
