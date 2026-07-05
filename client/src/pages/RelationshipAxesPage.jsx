import { useState } from 'react';
import { useRelationshipAxes, useRelationshipAxisMutations } from '../hooks/useRelationshipAxes.js';

const emptyForm = { name: '', min_value: 0, max_value: 100, default_value: 0 };

export default function RelationshipAxesPage() {
  const { data: axes, isLoading } = useRelationshipAxes();
  const { create, remove } = useRelationshipAxisMutations();
  const [form, setForm] = useState(emptyForm);

  async function handleCreate() {
    if (!form.name) return;
    await create.mutateAsync(form);
    setForm(emptyForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('この関係性軸を削除しますか？（キャラの初期値も失われます）')) return;
    await remove.mutateAsync(id);
  }

  if (isLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>関係性軸マスター</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {axes.map((axis) => (
          <div
            key={axis.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
          >
            <span>
              {axis.name} <span style={{ fontSize: 11, color: '#888' }}>{axis.min_value}〜{axis.max_value}（初期値既定 {axis.default_value}）</span>
            </span>
            <button onClick={() => handleDelete(axis.id)}>削除</button>
          </div>
        ))}
      </div>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>新規登録</p>
        <label style={{ display: 'block', marginBottom: 8 }}>
          名前
          <input style={{ display: 'block', width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
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
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleCreate} disabled={!form.name}>
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
