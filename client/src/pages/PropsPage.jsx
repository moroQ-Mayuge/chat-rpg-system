import { useState } from 'react';
import { useProps, usePropMutations } from '../hooks/useProps.js';

const emptyForm = { name: '', danbooru_tags: '', category: '', description: '' };

export default function PropsPage() {
  const { data: props, isLoading } = useProps();
  const { create, remove } = usePropMutations();
  const [form, setForm] = useState(emptyForm);

  async function handleCreate() {
    if (!form.name) return;
    await create.mutateAsync(form);
    setForm(emptyForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('この設備・機材を削除しますか？')) return;
    await remove.mutateAsync(id);
  }

  if (isLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>設備・機材ライブラリ</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {props.map((prop) => (
          <div
            key={prop.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 8,
              border: '1px solid #ddd',
              borderRadius: 6,
            }}
          >
            <span>
              {prop.name} <span style={{ fontSize: 11, color: '#888' }}>{prop.danbooru_tags}</span>
            </span>
            <button onClick={() => handleDelete(prop.id)}>削除</button>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>新規登録</p>
        <label style={{ display: 'block', marginBottom: 8 }}>
          名前
          <input
            style={{ display: 'block', width: '100%' }}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          画像生成用danbooruタグ
          <input
            style={{ display: 'block', width: '100%' }}
            value={form.danbooru_tags}
            onChange={(e) => setForm({ ...form, danbooru_tags: e.target.value })}
            placeholder="blackboard, classroom"
          />
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
