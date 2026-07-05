import { useState } from 'react';
import { useExpressionTypes, useExpressionTypeMutations } from '../hooks/useExpressionTypes.js';

const emptyForm = { name: '', llm_tag_key: '' };

export default function ExpressionTypesPage() {
  const { data: expressionTypes, isLoading } = useExpressionTypes();
  const { create, remove } = useExpressionTypeMutations();
  const [form, setForm] = useState(emptyForm);

  async function handleCreate() {
    if (!form.name || !form.llm_tag_key) return;
    await create.mutateAsync(form);
    setForm(emptyForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('この表情タイプを削除しますか？')) return;
    await remove.mutateAsync(id);
  }

  if (isLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>表情マスター</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {expressionTypes.map((et) => (
          <div
            key={et.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
          >
            <span>
              {et.name} <span style={{ fontSize: 11, color: '#888' }}>[EMOTION:{et.llm_tag_key}]</span>
            </span>
            <button onClick={() => handleDelete(et.id)}>削除</button>
          </div>
        ))}
      </div>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>新規登録</p>
        <label style={{ display: 'block', marginBottom: 8 }}>
          名前
          <input style={{ display: 'block', width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          LLMタグキー
          <input
            style={{ display: 'block', width: '100%' }}
            value={form.llm_tag_key}
            onChange={(e) => setForm({ ...form, llm_tag_key: e.target.value })}
            placeholder="例: excited"
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleCreate} disabled={!form.name || !form.llm_tag_key}>
            追加
          </button>
        </div>
      </div>
    </div>
  );
}
