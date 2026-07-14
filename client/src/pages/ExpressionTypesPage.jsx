import { useState } from 'react';
import { useExpressionTypes, useExpressionTypeMutations } from '../hooks/useExpressionTypes.js';

const emptyForm = { name: '', llm_tag_key: '', danbooru_tag: '' };

export default function ExpressionTypesPage() {
  const { data: expressionTypes, isLoading } = useExpressionTypes();
  const { create, update, remove } = useExpressionTypeMutations();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  function startEdit(et) {
    setEditingId(et.id);
    setForm({ name: et.name, llm_tag_key: et.llm_tag_key, danbooru_tag: et.danbooru_tag ?? '' });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSave() {
    if (!form.name || !form.llm_tag_key) return;
    if (editingId != null) {
      await update.mutateAsync({ id: editingId, data: form });
    } else {
      await create.mutateAsync(form);
    }
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('この表情タイプを削除しますか？')) return;
    if (editingId === id) cancelEdit();
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
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 8,
              border: editingId === et.id ? '1px solid #2563eb' : '1px solid #ddd',
              borderRadius: 6,
            }}
          >
            <span>
              {et.name} <span style={{ fontSize: 11, color: '#888' }}>[EMOTION:{et.llm_tag_key}]</span>
              {et.danbooru_tag && <span style={{ fontSize: 11, color: '#888' }}> [画像生成タグ: {et.danbooru_tag}]</span>}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => startEdit(et)}>編集</button>
              <button onClick={() => handleDelete(et.id)}>削除</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>{editingId != null ? '編集' : '新規登録'}</p>
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
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span>画像生成用danbooruタグ（任意・未指定はLLMタグキーを使用）</span>
          <input
            style={{ display: 'block', width: '100%' }}
            value={form.danbooru_tag}
            onChange={(e) => setForm({ ...form, danbooru_tag: e.target.value })}
            placeholder="例: excited, open_mouth"
          />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {editingId != null && <button onClick={cancelEdit}>キャンセル</button>}
          <button onClick={handleSave} disabled={!form.name || !form.llm_tag_key}>
            {editingId != null ? '保存' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
