import { useEffect, useState } from 'react';
import { useWorlds } from '../hooks/useWorlds.js';
import { useAllItems, useItemMutations } from '../hooks/useItems.js';
import { useAllItemCategories, useItemCategoryMutations } from '../hooks/useItemCategories.js';
import { useAllOutfitMasters } from '../hooks/useOutfitMasters.js';
import GroupedList from '../components/ui/GroupedList.jsx';
import { groupByKeys } from '../utils/grouping.js';
import { useMobileListToggle } from '../hooks/useMobileListToggle.js';

const emptyItemForm = {
  world_id: '',
  name: '',
  description: '',
  image_tags: '',
  category_id: '',
  buy_price: '',
  sell_price: '',
  outfit_master_id: '',
  // '' = カテゴリ設定に従う(null)、'1' = 消費型、'0' = 永続型 のアイテム個別上書き(0108)
  is_consumable: '',
};
const emptyCategoryForm = { world_id: '', name: '', is_consumable: false };

function worldLabel(worldId, worlds) {
  if (worldId == null) return '共通';
  return worlds.find((w) => w.id === worldId)?.name ?? `World#${worldId}`;
}

function ItemCategoriesSection({ worlds }) {
  const { data: categories, isLoading } = useAllItemCategories();
  const { create, remove } = useItemCategoryMutations();
  const [form, setForm] = useState(emptyCategoryForm);

  async function handleCreate() {
    if (!form.name) return;
    await create.mutateAsync({ ...form, world_id: form.world_id ? Number(form.world_id) : null });
    setForm(emptyCategoryForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('このカテゴリを削除しますか？（使用中のアイテムがある場合は削除できません）')) return;
    await remove.mutateAsync(id);
  }

  if (isLoading) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3>アイテムカテゴリ</h3>
      <p style={{ fontSize: 11, color: '#888' }}>
        アイテムが消費型（使うと所持数が減る）かどうかは、基本的にカテゴリ単位で決まります。動的にアイテムが生成される際も、このカテゴリ一覧からLLMが選びます。個々のアイテム側で「消費型／永続型」を明示した場合は、そちらがカテゴリ設定より優先されます（クラフトの完成品はLLMがこれを判定します）。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {categories.map((c) => (
          <div
            key={c.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
          >
            <span>
              {c.name}{' '}
              <span style={{ fontSize: 11, color: '#888' }}>
                [{worldLabel(c.world_id, worlds)}] {c.is_consumable ? '消費型' : '永続型'}
              </span>
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
            <input style={{ width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例：消耗品" />
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
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <input
            type="checkbox"
            checked={form.is_consumable}
            onChange={(e) => setForm({ ...form, is_consumable: e.target.checked })}
          />
          消費型（このカテゴリのアイテムは「使う」で所持数が減る）
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

function ItemsSection({ worlds }) {
  const { data: items, isLoading } = useAllItems();
  const { data: categories } = useAllItemCategories();
  const { data: outfitMasters } = useAllOutfitMasters();
  const { create, update, remove } = useItemMutations();
  const { mobileListOpen, openList, closeList } = useMobileListToggle();
  const [selectedId, setSelectedId] = useState(null);
  const isNew = selectedId === 'new';
  const [form, setForm] = useState(emptyItemForm);

  useEffect(() => {
    if (isNew || selectedId == null) {
      setForm(emptyItemForm);
      return;
    }
    const found = items?.find((i) => i.id === selectedId);
    if (found) {
      setForm({
        world_id: found.world_id ?? '',
        name: found.name,
        description: found.description ?? '',
        image_tags: found.image_tags ?? '',
        category_id: found.category_id ?? '',
        buy_price: found.buy_price ?? '',
        sell_price: found.sell_price ?? '',
        outfit_master_id: found.outfit_master_id ?? '',
        is_consumable: found.is_consumable == null ? '' : String(found.is_consumable),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, items]);

  function selectItem(id) {
    setSelectedId(id);
    closeList();
  }

  function startNew() {
    setSelectedId('new');
    closeList();
  }

  async function handleSave() {
    if (!form.name) return;
    const payload = {
      ...form,
      world_id: form.world_id ? Number(form.world_id) : null,
      category_id: form.category_id ? Number(form.category_id) : null,
      buy_price: form.buy_price === '' ? null : Number(form.buy_price),
      sell_price: form.sell_price === '' ? null : Number(form.sell_price),
      outfit_master_id: form.outfit_master_id ? Number(form.outfit_master_id) : null,
      is_consumable: form.is_consumable === '' ? null : form.is_consumable === '1',
    };
    if (isNew) {
      const created = await create.mutateAsync(payload);
      setSelectedId(created.id);
    } else {
      await update.mutateAsync({ id: selectedId, data: payload });
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('このアイテムを削除しますか？')) return;
    await remove.mutateAsync(id);
    if (selectedId === id) setSelectedId(null);
  }

  if (isLoading || !categories) return null;

  function categoryLabel(categoryId) {
    const c = categories.find((cat) => cat.id === categoryId);
    return c ? `${c.name}${c.is_consumable ? '・消費型' : ''}` : '未設定';
  }

  const groups = groupByKeys(items, (item) => (item.world_id != null ? [item.world_id] : []), (worldId) => worldLabel(worldId, worlds), '共通');

  function renderItemRow(item) {
    return (
      <div
        key={item.id}
        onClick={() => selectItem(item.id)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 6,
          borderRadius: 6,
          cursor: 'pointer',
          background: selectedId === item.id ? '#dbeafe' : 'transparent',
        }}
      >
        <span>
          {item.name} <span style={{ fontSize: 11, color: '#888' }}>[{categoryLabel(item.category_id)}]</span>
        </span>
        <button
          style={{ fontSize: 11 }}
          onClick={(e) => {
            e.stopPropagation();
            handleDelete(item.id);
          }}
        >
          削除
        </button>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <h3>アイテム</h3>
      <p style={{ fontSize: 11, color: '#888' }}>
        「共通」は全World、それ以外は指定したWorldでのみ使用できます（World単位の実効一覧＝共通＋そのWorld固有分）。
      </p>
      <div className={`sidebar-layout${mobileListOpen ? ' mobile-list-open' : ''}`} style={{ '--sidebar-width': '220px' }}>
        <div className="sidebar-pane" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderRight: '1px solid #ddd', paddingRight: 12 }}>
          <GroupedList groups={groups} storageKey="items" renderGroupItems={(group) => group.items.map(renderItemRow)} emptyMessage="まだアイテムがありません" />
          <button onClick={startNew}>+ 新規アイテム</button>
        </div>

        <div>
          <button className="mobile-list-toggle" onClick={openList} style={{ marginBottom: 8 }}>
            ☰ 一覧を表示
          </button>
          {selectedId == null && <p>左の一覧からアイテムを選択するか、新規作成してください</p>}

          {selectedId != null && (
            <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
              <p style={{ fontWeight: 500 }}>{isNew ? '新規登録' : '編集'}</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <label>
                  <span style={{ fontSize: 11, color: '#888', display: 'block' }}>名前</span>
                  <input style={{ width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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
                <label>
                  <span style={{ fontSize: 11, color: '#888', display: 'block' }}>カテゴリ</span>
                  <select style={{ width: '100%' }} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                    <option value="">未設定</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{worldLabel(c.world_id, worlds)}] {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span style={{ fontSize: 11, color: '#888', display: 'block' }}>消費型（このアイテム個別の指定）</span>
                  <select
                    style={{ width: '100%' }}
                    value={form.is_consumable}
                    onChange={(e) => setForm({ ...form, is_consumable: e.target.value })}
                  >
                    <option value="">カテゴリの設定に従う</option>
                    <option value="1">消費型（「使う」で所持数が減る）</option>
                    <option value="0">永続型（使っても減らない）</option>
                  </select>
                </label>
              </div>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#888', display: 'block' }}>
                  紐づく衣装マスタ（任意・設定すると「着る」行動コマンドで着用できるアイテムになる）
                </span>
                <select
                  style={{ width: '100%' }}
                  value={form.outfit_master_id}
                  onChange={(e) => setForm({ ...form, outfit_master_id: e.target.value })}
                >
                  <option value="">なし（通常のアイテム）</option>
                  {(outfitMasters ?? []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#888', display: 'block' }}>説明（LLM文脈用の自由記述）</span>
                <input style={{ width: '100%' }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </label>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#888', display: 'block' }}>画像生成用danbooruタグ（任意）</span>
                <input style={{ width: '100%' }} value={form.image_tags} onChange={(e) => setForm({ ...form, image_tags: e.target.value })} />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <label>
                  <span style={{ fontSize: 11, color: '#888', display: 'block' }}>購入額（空欄=買い物部屋で販売不可）</span>
                  <input
                    type="number"
                    min="0"
                    style={{ width: '100%' }}
                    value={form.buy_price}
                    onChange={(e) => setForm({ ...form, buy_price: e.target.value })}
                  />
                </label>
                <label>
                  <span style={{ fontSize: 11, color: '#888', display: 'block' }}>売却額（空欄=売却不可）</span>
                  <input
                    type="number"
                    min="0"
                    style={{ width: '100%' }}
                    value={form.sell_price}
                    onChange={(e) => setForm({ ...form, sell_price: e.target.value })}
                  />
                </label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleSave} disabled={!form.name}>
                  {isNew ? '追加' : '保存'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ItemsPage() {
  const { data: worlds, isLoading } = useWorlds();
  if (isLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>アイテム</h2>
      <ItemCategoriesSection worlds={worlds} />
      <ItemsSection worlds={worlds} />
    </div>
  );
}
