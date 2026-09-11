import { useState } from 'react';
import { useWorlds } from '../hooks/useWorlds.js';
import { useMobFlavorPresetsForWorld, useMobFlavorPresetMutations } from '../hooks/useMobFlavorPresets.js';
import { useMobNamePresetsForWorld, useMobNamePresetMutations } from '../hooks/useMobNamePresets.js';
import { useMobSurnamePresetsForWorld, useMobSurnamePresetMutations } from '../hooks/useMobSurnamePresets.js';

const emptyPersonaForm = { personality: '', speech_style: '', sentence_ending: '', first_person: '', call_user_as: '', call_others_as: '' };

function personaToForm(p) {
  return {
    personality: p.personality ?? '',
    speech_style: p.speech_style ?? '',
    sentence_ending: p.sentence_ending ?? '',
    first_person: p.first_person ?? '',
    call_user_as: p.call_user_as ?? '',
    call_others_as: p.call_others_as ?? '',
  };
}

// 苗字プールも名前・ペルソナのどちらとも紐付かない独立した抽選対象(0130)——
// NamePresetsSectionと同じ構造で、フィールド名だけsurnameに差し替えている。
function SurnamePresetsSection({ worldId }) {
  const { data: surnames, isLoading } = useMobSurnamePresetsForWorld(worldId);
  const { create, update, remove } = useMobSurnamePresetMutations();
  const [editingId, setEditingId] = useState(null);
  const [surname, setSurname] = useState('');

  function startEdit(s) {
    setEditingId(s.id);
    setSurname(s.surname);
  }

  function cancelEdit() {
    setEditingId(null);
    setSurname('');
  }

  async function handleSave() {
    if (!surname || worldId == null) return;
    if (editingId != null) {
      await update.mutateAsync({ id: editingId, data: { surname } });
    } else {
      await create.mutateAsync({ world_id: worldId, surname });
    }
    cancelEdit();
  }

  async function handleDelete(id) {
    if (!window.confirm('この苗字を削除しますか？')) return;
    if (editingId === id) cancelEdit();
    await remove.mutateAsync(id);
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>苗字プール</h3>
      <p style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        ランダムに選ばれる苗字だけの一覧です。下の名前プール・ペルソナとは紐付いておらず、部屋登場時に別々に抽選されて組み合わさります（苗字が無ければ名前だけが使われます）。
      </p>
      {isLoading ? (
        <p>読み込み中...</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {(surnames ?? []).map((s) => (
            <span
              key={s.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 4px 3px 10px',
                borderRadius: 14,
                border: editingId === s.id ? '1px solid #2563eb' : '1px solid #ddd',
                fontSize: 12,
              }}
            >
              {s.surname}
              {s.is_generated && (
                <span style={{ fontSize: 9, color: '#2563eb', border: '1px solid #2563eb', borderRadius: 8, padding: '0 4px' }}>LLM生成</span>
              )}
              <button onClick={() => startEdit(s)} style={{ fontSize: 10, padding: '1px 5px' }}>
                編集
              </button>
              <button onClick={() => handleDelete(s.id)} style={{ fontSize: 10, padding: '1px 5px' }}>
                削除
              </button>
            </span>
          ))}
          {(surnames ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888', margin: 0 }}>このWorldにはまだ苗字がありません。</p>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input style={{ width: 200 }} value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="例: 田中" />
        {editingId != null && <button onClick={cancelEdit}>キャンセル</button>}
        <button onClick={handleSave} disabled={!surname || worldId == null}>
          {editingId != null ? '保存' : '追加'}
        </button>
      </div>
    </div>
  );
}

// 名前プールとペルソナ(性格・口調)プールは互いに紐付かない独立した抽選対象
// (0129)——部屋登場時にそれぞれ別個にランダム選択して組み合わせる。片方しか
// 登録していなくても、登録した方だけが付与される。
function NamePresetsSection({ worldId }) {
  const { data: names, isLoading } = useMobNamePresetsForWorld(worldId);
  const { create, update, remove } = useMobNamePresetMutations();
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');

  function startEdit(n) {
    setEditingId(n.id);
    setName(n.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setName('');
  }

  async function handleSave() {
    if (!name || worldId == null) return;
    if (editingId != null) {
      await update.mutateAsync({ id: editingId, data: { name } });
    } else {
      await create.mutateAsync({ world_id: worldId, name });
    }
    cancelEdit();
  }

  async function handleDelete(id) {
    if (!window.confirm('この名前を削除しますか？')) return;
    if (editingId === id) cancelEdit();
    await remove.mutateAsync(id);
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>名前プール</h3>
      <p style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        ランダムに選ばれる名前だけの一覧です。下のペルソナ（性格・口調）とは紐付いておらず、部屋登場時に別々に抽選されて組み合わさります。
      </p>
      {isLoading ? (
        <p>読み込み中...</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {(names ?? []).map((n) => (
            <span
              key={n.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 4px 3px 10px',
                borderRadius: 14,
                border: editingId === n.id ? '1px solid #2563eb' : '1px solid #ddd',
                fontSize: 12,
              }}
            >
              {n.name}
              {n.is_generated && (
                <span style={{ fontSize: 9, color: '#2563eb', border: '1px solid #2563eb', borderRadius: 8, padding: '0 4px' }}>LLM生成</span>
              )}
              <button onClick={() => startEdit(n)} style={{ fontSize: 10, padding: '1px 5px' }}>
                編集
              </button>
              <button onClick={() => handleDelete(n.id)} style={{ fontSize: 10, padding: '1px 5px' }}>
                削除
              </button>
            </span>
          ))}
          {(names ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888', margin: 0 }}>このWorldにはまだ名前がありません。</p>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input style={{ width: 200 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="例: はなこ" />
        {editingId != null && <button onClick={cancelEdit}>キャンセル</button>}
        <button onClick={handleSave} disabled={!name || worldId == null}>
          {editingId != null ? '保存' : '追加'}
        </button>
      </div>
    </div>
  );
}

function PersonaPresetsSection({ worldId }) {
  const { data: presets, isLoading } = useMobFlavorPresetsForWorld(worldId);
  const { create, update, remove } = useMobFlavorPresetMutations();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyPersonaForm);

  function startEdit(p) {
    setEditingId(p.id);
    setForm(personaToForm(p));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyPersonaForm);
  }

  async function handleSave() {
    if (worldId == null) return;
    if (editingId != null) {
      await update.mutateAsync({ id: editingId, data: form });
    } else {
      await create.mutateAsync({ ...form, world_id: worldId });
    }
    cancelEdit();
  }

  async function handleDelete(id) {
    if (!window.confirm('このペルソナを削除しますか？')) return;
    if (editingId === id) cancelEdit();
    await remove.mutateAsync(id);
  }

  return (
    <div>
      <h3 style={{ fontSize: 14, marginBottom: 4 }}>ペルソナプール（性格・口調）</h3>
      <p style={{ fontSize: 11, color: '#888', marginBottom: 12 }}>
        名前を含まない、性格・口調だけの一覧です。上の名前プールとは独立に抽選されます。
      </p>
      {isLoading ? (
        <p>読み込み中...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {(presets ?? []).map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 8,
                border: editingId === p.id ? '1px solid #2563eb' : '1px solid #ddd',
                borderRadius: 6,
              }}
            >
              <span>
                {[p.personality, p.speech_style].filter(Boolean).join(' / ') || '（未設定）'}
                {p.is_generated && (
                  <span style={{ fontSize: 10, color: '#2563eb', border: '1px solid #2563eb', borderRadius: 8, padding: '0 6px', marginLeft: 6 }}>
                    LLM生成
                  </span>
                )}
              </span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => startEdit(p)}>編集</button>
                <button onClick={() => handleDelete(p.id)}>削除</button>
              </div>
            </div>
          ))}
          {(presets ?? []).length === 0 && <p style={{ fontSize: 12, color: '#888' }}>このWorldにはまだペルソナがありません。</p>}
        </div>
      )}

      <div style={{ border: '1px solid #ccc', borderRadius: 8, padding: 16 }}>
        <p style={{ fontWeight: 500 }}>{editingId != null ? '編集' : '新規登録'}</p>
        <label style={{ display: 'block', marginBottom: 8 }}>
          性格
          <input style={{ display: 'block', width: '100%' }} value={form.personality} onChange={(e) => setForm({ ...form, personality: e.target.value })} placeholder="例: 天真爛漫" />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          口調
          <input style={{ display: 'block', width: '100%' }} value={form.speech_style} onChange={(e) => setForm({ ...form, speech_style: e.target.value })} placeholder="例: タメ口" />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          語尾
          <input style={{ display: 'block', width: '100%' }} value={form.sentence_ending} onChange={(e) => setForm({ ...form, sentence_ending: e.target.value })} placeholder="例: 〜だよ" />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          一人称
          <input style={{ display: 'block', width: '100%' }} value={form.first_person} onChange={(e) => setForm({ ...form, first_person: e.target.value })} placeholder="例: あたし" />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          あなたの呼び方
          <input style={{ display: 'block', width: '100%' }} value={form.call_user_as} onChange={(e) => setForm({ ...form, call_user_as: e.target.value })} placeholder="例: せんぱい" />
        </label>
        <label style={{ display: 'block', marginBottom: 8 }}>
          他人の呼び方
          <input style={{ display: 'block', width: '100%' }} value={form.call_others_as} onChange={(e) => setForm({ ...form, call_others_as: e.target.value })} placeholder="例: 〜くん・〜さん" />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          {editingId != null && <button onClick={cancelEdit}>キャンセル</button>}
          <button onClick={handleSave} disabled={worldId == null}>
            {editingId != null ? '保存' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MobFlavorPresetsPage() {
  const { data: worlds, isLoading: worldsLoading } = useWorlds();
  const realWorlds = (worlds ?? []).filter((w) => !w.is_unassigned_bucket);
  const [worldId, setWorldId] = useState(null);
  const effectiveWorldId = worldId ?? realWorlds[0]?.id ?? null;

  if (worldsLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>モブのランダムペルソナ</h2>
      <p style={{ fontSize: 12, color: '#888', marginTop: -8, marginBottom: 16 }}>
        World設定「モブのペルソナ・同行」を「プリセット抽選」にした場合、モブ属性キャラが部屋に登場する際に下の苗字プール・名前プール・ペルソナプールからそれぞれ独立に1件ずつランダムに選び、見た目はそのままに付与します（表示名は「苗字 名前（モブ）」の末尾に「（モブ）」が付きます）。苗字・名前・ペルソナは互いに紐付いていないため、いずれか一部しか登録していなくても構いません。「LLM都度生成」モードではここは使いません（自動生成された名前・ペルソナが「LLM生成」バッジ付きで参考表示されます）。
      </p>

      <label style={{ display: 'block', marginBottom: 24 }}>
        <span style={{ fontSize: 11, color: '#888' }}>World</span>
        <select
          style={{ display: 'block', width: 260 }}
          value={effectiveWorldId ?? ''}
          onChange={(e) => setWorldId(Number(e.target.value))}
        >
          {realWorlds.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>

      <SurnamePresetsSection worldId={effectiveWorldId} />
      <NamePresetsSection worldId={effectiveWorldId} />
      <PersonaPresetsSection worldId={effectiveWorldId} />
    </div>
  );
}
