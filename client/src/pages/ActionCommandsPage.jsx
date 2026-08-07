import { useState } from 'react';
import { useWorlds } from '../hooks/useWorlds.js';
import { useAllActionCommands, useActionCommandMutations } from '../hooks/useActionCommands.js';
import { useAllCharacterStatuses } from '../hooks/useCharacterStatuses.js';
import { useRoomTemplates } from '../hooks/useRoomTemplates.js';

const emptyForm = {
  world_id: '',
  label: '',
  icon: '',
  command_type: 'keyword',
  keyword_text: '',
  sort_order: 0,
  consumes_item: false,
  transfers_to_target: false,
  category: '',
  subcategory: '',
  sub_subcategory: '',
  visible_when_status_ids: [],
  visible_when_room_template_ids: [],
};

const COMMAND_TYPE_LABELS = {
  keyword: 'キーワード送信',
  item_pickup: 'アイテム入手',
  item_check: '持ち物確認',
  item_use: 'アイテム使用',
  item_wear: '着る',
  transform_request: '変身のお願い',
  free_text: '自由入力',
};

// Known top-level categories from the 2026-07-16 taxonomy decision (PC98風
// コマンド選択メニューを意識：はなす／するは独立トップレベル、それ以外は機能別)。
// category/subcategory/sub_subcategory は自由テキストなので、ここに無い値も
// 入力できる（将来「その他」枠へ再分類する等の拡張を見込んだ設計）。
const KNOWN_CATEGORIES = ['はなす', 'する', 'しらべる', 'もちもの', '脱衣'];

function worldLabel(worldId, worlds) {
  if (worldId == null) return '共通';
  return worlds.find((w) => w.id === worldId)?.name ?? `World#${worldId}`;
}

function formToPayload(form) {
  return {
    ...form,
    world_id: form.world_id ? Number(form.world_id) : null,
    sort_order: Number(form.sort_order),
    visible_when_status_ids: form.visible_when_status_ids.join(','),
    visible_when_room_template_ids: form.visible_when_room_template_ids.join(','),
  };
}

function commandToForm(cmd) {
  return {
    world_id: cmd.world_id ?? '',
    label: cmd.label,
    icon: cmd.icon ?? '',
    command_type: cmd.command_type,
    keyword_text: cmd.keyword_text ?? '',
    sort_order: cmd.sort_order ?? 0,
    consumes_item: !!cmd.consumes_item,
    transfers_to_target: !!cmd.transfers_to_target,
    category: cmd.category ?? '',
    subcategory: cmd.subcategory ?? '',
    sub_subcategory: cmd.sub_subcategory ?? '',
    visible_when_status_ids: (cmd.visible_when_status_ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number),
    visible_when_room_template_ids: (cmd.visible_when_room_template_ids ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number),
  };
}

function categoryPath(cmd) {
  return [cmd.category, cmd.subcategory, cmd.sub_subcategory].filter(Boolean).join(' / ') || '未分類';
}

export default function ActionCommandsPage() {
  const { data: worlds, isLoading: worldsLoading } = useWorlds();
  const { data: commands, isLoading: commandsLoading } = useAllActionCommands();
  const { data: statuses, isLoading: statusesLoading } = useAllCharacterStatuses();
  const { data: roomTemplates } = useRoomTemplates();
  const { create, update, remove } = useActionCommandMutations();
  const [selectedId, setSelectedId] = useState(null);
  const isNew = selectedId === 'new';
  const [form, setForm] = useState(emptyForm);

  function selectCommand(id) {
    setSelectedId(id);
    if (id === 'new' || id == null) {
      setForm(emptyForm);
    } else {
      const found = commands.find((c) => c.id === id);
      if (found) setForm(commandToForm(found));
    }
  }

  async function handleSave() {
    if (!form.label) return;
    if (isNew) {
      await create.mutateAsync(formToPayload(form));
      setSelectedId(null);
    } else {
      await update.mutateAsync({ id: selectedId, data: formToPayload(form) });
    }
    setForm(emptyForm);
  }

  async function handleDelete(id) {
    if (!window.confirm('この行動コマンドを削除しますか？')) return;
    await remove.mutateAsync(id);
    if (selectedId === id) selectCommand(null);
  }

  function toggleVisibleStatus(statusId) {
    setForm((f) => ({
      ...f,
      visible_when_status_ids: f.visible_when_status_ids.includes(statusId)
        ? f.visible_when_status_ids.filter((id) => id !== statusId)
        : [...f.visible_when_status_ids, statusId],
    }));
  }

  function toggleVisibleRoom(roomTemplateId) {
    setForm((f) => ({
      ...f,
      visible_when_room_template_ids: f.visible_when_room_template_ids.includes(roomTemplateId)
        ? f.visible_when_room_template_ids.filter((id) => id !== roomTemplateId)
        : [...f.visible_when_room_template_ids, roomTemplateId],
    }));
  }

  if (worldsLoading || commandsLoading || statusesLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>行動コマンド</h2>
      <p style={{ fontSize: 11, color: '#888' }}>
        チャット画面の入力欄上にアイコン一覧として表示されます。「キーワード送信」はタップすると入力したテキストをそのまま発言として送信します（イベントのキーワード条件を簡単に発火させる用途）。
        カテゴリ（category/subcategory/sub_subcategory）は自由記述の3段階で、コマンドバーの階層メニュー表示に使われます。「表示条件（キャラ状態）」「表示条件（部屋）」はそれぞれ1つ以上設定すると絞り込みが有効になり（未設定の条件は無視）、複数の条件種別を併用した場合はAND（両方満たす時のみ表示）、同じ条件種別内はOR（いずれか1つ満たせば表示）で判定されます。
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
        {commands.map((cmd) => (
          <div
            key={cmd.id}
            onClick={() => selectCommand(cmd.id)}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 8,
              border: selectedId === cmd.id ? '1px solid #6366f1' : '1px solid #ddd',
              borderRadius: 6,
              cursor: 'pointer',
              background: selectedId === cmd.id ? '#eef2ff' : 'transparent',
            }}
          >
            <span>
              {cmd.icon} {cmd.label}{' '}
              <span style={{ fontSize: 11, color: '#888' }}>
                [{worldLabel(cmd.world_id, worlds)}] {categoryPath(cmd)} ／ {COMMAND_TYPE_LABELS[cmd.command_type]}
                {cmd.command_type === 'keyword' && ` (${cmd.keyword_text})`}
                {cmd.command_type === 'item_use' &&
                  ` (${cmd.transfers_to_target ? '対象へ譲渡' : cmd.consumes_item ? '消費型' : '非消費'})`}
                {(cmd.visible_when_status_ids || cmd.visible_when_room_template_ids) && `／表示条件あり`}
              </span>
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(cmd.id);
              }}
            >
              削除
            </button>
          </div>
        ))}
        {commands.length === 0 && <p style={{ fontSize: 12, color: '#999' }}>まだ行動コマンドがありません</p>}
        {selectedId !== 'new' && <button onClick={() => selectCommand('new')}>+ 新規登録</button>}
      </div>

      {selectedId != null && (
        <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
          <p style={{ fontWeight: 500 }}>{isNew ? '新規登録' : '編集'}</p>
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

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 8 }}>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>カテゴリ</span>
              <input
                style={{ width: '100%' }}
                list="action-command-categories"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="例：はなす／する／しらべる／もちもの／脱衣"
              />
              <datalist id="action-command-categories">
                {KNOWN_CATEGORIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>サブカテゴリ（任意）</span>
              <input
                style={{ width: '100%' }}
                value={form.subcategory}
                onChange={(e) => setForm({ ...form, subcategory: e.target.value })}
                placeholder="例：上半身／下半身"
              />
            </label>
            <label>
              <span style={{ fontSize: 11, color: '#888', display: 'block' }}>サブサブカテゴリ（任意）</span>
              <input
                style={{ width: '100%' }}
                value={form.sub_subcategory}
                onChange={(e) => setForm({ ...form, sub_subcategory: e.target.value })}
              />
            </label>
          </div>

          {form.command_type === 'item_use' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.consumes_item}
                  onChange={(e) => setForm({ ...form, consumes_item: e.target.checked })}
                />
                実行すると所持数を1減らす（消費型として扱う）
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.transfers_to_target}
                  onChange={(e) => setForm({ ...form, transfers_to_target: e.target.checked })}
                />
                実行すると対象キャラクターへ所有権を移す（渡す系の挙動にする。対象選択が必須になる）
              </label>
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
              表示条件（キャラ状態、任意・複数選択可）— セッション参加者の誰かがこのいずれかの状態を持つ時だけ表示
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 140, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
              {statuses.map((s) => (
                <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, border: '1px solid #ddd', borderRadius: 4, padding: '2px 6px' }}>
                  <input
                    type="checkbox"
                    checked={form.visible_when_status_ids.includes(s.id)}
                    onChange={() => toggleVisibleStatus(s.id)}
                  />
                  {s.name}
                </label>
              ))}
              {statuses.length === 0 && <span style={{ fontSize: 11, color: '#999' }}>キャラ状態がまだ登録されていません</span>}
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#888', display: 'block', marginBottom: 4 }}>
              表示条件（部屋、任意・複数選択可）— 現在の部屋がこのいずれかの時だけ表示（キャラ状態条件と併用時はAND）
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 140, overflowY: 'auto', border: '1px solid #eee', borderRadius: 6, padding: 6 }}>
              {(roomTemplates ?? []).map((r) => (
                <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, border: '1px solid #ddd', borderRadius: 4, padding: '2px 6px' }}>
                  <input
                    type="checkbox"
                    checked={form.visible_when_room_template_ids.includes(r.id)}
                    onChange={() => toggleVisibleRoom(r.id)}
                  />
                  {r.name}
                </label>
              ))}
              {(roomTemplates ?? []).length === 0 && <span style={{ fontSize: 11, color: '#999' }}>部屋がまだ登録されていません</span>}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button onClick={handleSave} disabled={!form.label}>
              {isNew ? '追加' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
