import { useState } from 'react';
import { usePoseMasters, usePoseMasterMutations } from '../hooks/usePoseMasters.js';

const emptyForm = { name: '', llm_tag_key: '', danbooru_tag: '' };

export default function PoseMastersPage() {
  const { data: poseMasters, isLoading } = usePoseMasters();
  const { create, update, remove } = usePoseMasterMutations();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  function startEdit(pm) {
    setEditingId(pm.id);
    setForm({ name: pm.name, llm_tag_key: pm.llm_tag_key, danbooru_tag: pm.danbooru_tag ?? '' });
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
    if (!window.confirm('このポーズを削除しますか？')) return;
    if (editingId === id) cancelEdit();
    await remove.mutateAsync(id);
  }

  if (isLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>ポーズマスタ</h2>
      <p style={{ fontSize: 12, color: '#888', marginTop: -8, marginBottom: 16 }}>
        キャラクターの姿勢（座っている・立っている・倒れている等）を管理します。部屋の初期ポーズやイベントの「ポーズ変更」アクション・「現在のポーズ」条件、LLMの任意の[POSE:xxx]タグから参照されます。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {poseMasters.map((pm) => (
          <div
            key={pm.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 8,
              border: editingId === pm.id ? '1px solid #2563eb' : '1px solid #ddd',
              borderRadius: 6,
            }}
          >
            <span>
              {pm.name} <span style={{ fontSize: 11, color: '#888' }}>[POSE:{pm.llm_tag_key}]</span>
              {pm.danbooru_tag && <span style={{ fontSize: 11, color: '#888' }}> [画像生成タグ: {pm.danbooru_tag}]</span>}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={() => startEdit(pm)}>編集</button>
              <button onClick={() => handleDelete(pm.id)}>削除</button>
            </div>
          </div>
        ))}
      </div>
      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>{editingId != null ? '編集' : '新規登録'}</p>
        <label style={{ display: 'block', marginBottom: 8 }}>
          名前
          <input style={{ display: 'block', width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: 座っている" />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          LLMタグキー
          <input
            style={{ display: 'block', width: '100%' }}
            value={form.llm_tag_key}
            onChange={(e) => setForm({ ...form, llm_tag_key: e.target.value })}
            placeholder="例: sitting"
          />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span>画像生成用danbooruタグ</span>
          <input
            style={{ display: 'block', width: '100%' }}
            value={form.danbooru_tag}
            onChange={(e) => setForm({ ...form, danbooru_tag: e.target.value })}
            placeholder="例: sitting, on chair"
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
