import { useState } from 'react';
import { useWorlds } from '../hooks/useWorlds.js';
import { useProps, usePropMutations } from '../hooks/useProps.js';
import { useAllPropCategories, usePropCategoryMutations } from '../hooks/usePropCategories.js';

const emptyForm = { name: '', danbooru_tags: '', category_id: '', description: '' };
const emptyCategoryForm = { world_id: '', name: '' };

function worldLabel(worldId, worlds) {
  if (worldId == null) return '共通';
  return worlds.find((w) => w.id === worldId)?.name ?? `World#${worldId}`;
}

function PropCategoriesSection({ worlds }) {
  const { data: categories, isLoading } = useAllPropCategories();
  const { create, remove } = usePropCategoryMutations();
  const [form, setForm] = useState(emptyCategoryForm);

  async function handleCreate() {
    if (!form.name) return;
    await create.mutateAsync({ ...form, world_id: form.world_id ? Number(form.world_id) : null });
    setForm(emptyCategoryForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('このカテゴリを削除しますか？（使用中の設備・機材がある場合は削除できません）')) return;
    await remove.mutateAsync(id);
  }

  if (isLoading) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3>設備・機材カテゴリ</h3>
      <p style={{ fontSize: 11, color: '#888' }}>
        部屋マスタは「このカテゴリの設備・機材が出現候補」という形で登録し、実際にどの個体を配置するかはWorld側の部屋設定で選びます。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {categories.map((c) => (
          <div
            key={c.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
          >
            <span>
              {c.name} <span style={{ fontSize: 11, color: '#888' }}>[{worldLabel(c.world_id, worlds)}]</span>
            </span>
            <button onClick={() => handleDelete(c.id)}>削除</button>
          </div>
        ))}
        {categories.length === 0 && <p style={{ fontSize: 12, color: '#999' }}>まだカテゴリがありません</p>}
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>新規登録</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>名前</span>
            <input style={{ width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：家具" />
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
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleCreate} disabled={!form.name}>
            追加
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PropsPage() {
  const { data: worlds } = useWorlds();
  const { data: props, isLoading } = useProps();
  const { data: categories } = useAllPropCategories();
  const { create, remove } = usePropMutations();
  const [form, setForm] = useState(emptyForm);

  function categoryLabel(categoryId) {
    return (categories ?? []).find((c) => c.id === categoryId)?.name ?? '未分類';
  }

  async function handleCreate() {
    if (!form.name) return;
    await create.mutateAsync({ ...form, category_id: form.category_id ? Number(form.category_id) : null });
    setForm(emptyForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('この設備・機材を削除しますか？')) return;
    await remove.mutateAsync(id);
  }

  if (isLoading || !worlds || !categories) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>設備・機材ライブラリ</h2>
      <PropCategoriesSection worlds={worlds} />

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
              {prop.name} <span style={{ fontSize: 11, color: '#888' }}>[{categoryLabel(prop.category_id)}] {prop.danbooru_tags}</span>
            </span>
            <button onClick={() => handleDelete(prop.id)}>削除</button>
          </div>
        ))}
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>新規登録</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>名前</span>
            <input
              style={{ width: '100%' }}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>カテゴリ</span>
            <select style={{ width: '100%' }} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
              <option value="">未分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  [{worldLabel(c.world_id, worlds)}] {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#888', display: 'block' }}>画像生成用danbooruタグ</span>
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
