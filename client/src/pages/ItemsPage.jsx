import { useState } from 'react';
import { useWorlds } from '../hooks/useWorlds.js';
import { useAllItems, useItemMutations } from '../hooks/useItems.js';
import { useAllActionCommands, useActionCommandMutations } from '../hooks/useActionCommands.js';

const emptyItemForm = { world_id: '', name: '', description: '', image_tags: '' };
const emptyCommandForm = { world_id: '', label: '', icon: '', command_type: 'keyword', keyword_text: '', sort_order: 0 };

const COMMAND_TYPE_LABELS = {
  keyword: 'キーワード送信',
  item_pickup: 'アイテム入手',
  item_check: '持ち物確認',
  item_use: 'アイテム使用',
  free_text: '自由入力',
};

function worldLabel(worldId, worlds) {
  if (worldId == null) return '共通';
  return worlds.find((w) => w.id === worldId)?.name ?? `World#${worldId}`;
}

function ItemsSection({ worlds }) {
  const { data: items, isLoading } = useAllItems();
  const { create, remove } = useItemMutations();
  const [form, setForm] = useState(emptyItemForm);

  async function handleCreate() {
    if (!form.name) return;
    await create.mutateAsync({ ...form, world_id: form.world_id ? Number(form.world_id) : null });
    setForm(emptyItemForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('このアイテムを削除しますか？')) return;
    await remove.mutateAsync(id);
  }

  if (isLoading) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3>アイテム</h3>
      <p style={{ fontSize: 11, color: '#888' }}>
        「共通」は全World、それ以外は指定したWorldでのみ使用できます（World単位の実効一覧＝共通＋そのWorld固有分）。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
          >
            <span>
              {item.name}{' '}
              <span style={{ fontSize: 11, color: '#888' }}>
                [{worldLabel(item.world_id, worlds)}] {item.description}
              </span>
            </span>
            <button onClick={() => handleDelete(item.id)}>削除</button>
          </div>
        ))}
        {items.length === 0 && <p style={{ fontSize: 12, color: '#999' }}>まだアイテムがありません</p>}
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>新規登録</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
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
        </div>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#888', display: 'block' }}>説明（LLM文脈用の自由記述）</span>
          <input style={{ width: '100%' }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#888', display: 'block' }}>画像生成用danbooruタグ（任意）</span>
          <input style={{ width: '100%' }} value={form.image_tags} onChange={(e) => setForm({ ...form, image_tags: e.target.value })} />
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

function ActionCommandsSection({ worlds }) {
  const { data: commands, isLoading } = useAllActionCommands();
  const { create, remove } = useActionCommandMutations();
  const [form, setForm] = useState(emptyCommandForm);

  async function handleCreate() {
    if (!form.label) return;
    await create.mutateAsync({ ...form, world_id: form.world_id ? Number(form.world_id) : null, sort_order: Number(form.sort_order) });
    setForm(emptyCommandForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('この行動コマンドを削除しますか？')) return;
    await remove.mutateAsync(id);
  }

  if (isLoading) return null;

  return (
    <div>
      <h3>行動コマンド</h3>
      <p style={{ fontSize: 11, color: '#888' }}>
        チャット画面の入力欄上にアイコン一覧として表示されます。「キーワード送信」はタップすると入力したテキストをそのまま発言として送信します（イベントのキーワード条件を簡単に発火させる用途）。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {commands.map((cmd) => (
          <div
            key={cmd.id}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 8, border: '1px solid #ddd', borderRadius: 6 }}
          >
            <span>
              {cmd.icon} {cmd.label}{' '}
              <span style={{ fontSize: 11, color: '#888' }}>
                [{worldLabel(cmd.world_id, worlds)}] {COMMAND_TYPE_LABELS[cmd.command_type]}
                {cmd.command_type === 'keyword' && ` (${cmd.keyword_text})`}
              </span>
            </span>
            <button onClick={() => handleDelete(cmd.id)}>削除</button>
          </div>
        ))}
        {commands.length === 0 && <p style={{ fontSize: 12, color: '#999' }}>まだ行動コマンドがありません</p>}
      </div>

      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>新規登録</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>ラベル</span>
            <input style={{ width: '100%' }} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </label>
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>アイコン（絵文字）</span>
            <input style={{ width: '100%' }} value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="🔍" />
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
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>種別</span>
            <select style={{ width: '100%' }} value={form.command_type} onChange={(e) => setForm({ ...form, command_type: e.target.value })}>
              {Object.entries(COMMAND_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {form.command_type === 'keyword' && (
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>送信するキーワード</span>
              <input style={{ width: '100%' }} value={form.keyword_text} onChange={(e) => setForm({ ...form, keyword_text: e.target.value })} />
            </label>
          )}
          <label>
            <span style={{ fontSize: 11, color: '#888', display: 'block' }}>表示順</span>
            <input type="number" style={{ width: '100%' }} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
          </label>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleCreate} disabled={!form.label}>
            追加
          </button>
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
      <h2>アイテム・行動コマンド</h2>
      <ItemsSection worlds={worlds} />
      <ActionCommandsSection worlds={worlds} />
    </div>
  );
}
