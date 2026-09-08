import { useState } from 'react';
import { useWorlds } from '../hooks/useWorlds.js';
import { useMobFlavorPresetsForWorld, useMobFlavorPresetMutations } from '../hooks/useMobFlavorPresets.js';

const emptyForm = { name: '', personality: '', speech_style: '', sentence_ending: '', first_person: '', call_user_as: '', call_others_as: '' };

function presetToForm(p) {
  return {
    name: p.name,
    personality: p.personality ?? '',
    speech_style: p.speech_style ?? '',
    sentence_ending: p.sentence_ending ?? '',
    first_person: p.first_person ?? '',
    call_user_as: p.call_user_as ?? '',
    call_others_as: p.call_others_as ?? '',
  };
}

export default function MobFlavorPresetsPage() {
  const { data: worlds, isLoading: worldsLoading } = useWorlds();
  const realWorlds = (worlds ?? []).filter((w) => !w.is_unassigned_bucket);
  const [worldId, setWorldId] = useState(null);
  const effectiveWorldId = worldId ?? realWorlds[0]?.id ?? null;

  const { data: presets, isLoading: presetsLoading } = useMobFlavorPresetsForWorld(effectiveWorldId);
  const { create, update, remove } = useMobFlavorPresetMutations();
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  function startEdit(p) {
    setEditingId(p.id);
    setForm(presetToForm(p));
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
  }

  async function handleSave() {
    if (!form.name || effectiveWorldId == null) return;
    if (editingId != null) {
      await update.mutateAsync({ id: editingId, data: form });
    } else {
      await create.mutateAsync({ ...form, world_id: effectiveWorldId });
    }
    cancelEdit();
  }

  async function handleDelete(id) {
    if (!window.confirm('このペルソナを削除しますか？')) return;
    if (editingId === id) cancelEdit();
    await remove.mutateAsync(id);
  }

  if (worldsLoading) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>モブのランダムペルソナ</h2>
      <p style={{ fontSize: 12, color: '#888', marginTop: -8, marginBottom: 16 }}>
        World設定「モブのランダムペルソナ付与」をON・生成モードを「プリセット抽選」にした場合、モブ属性キャラが部屋に登場する際にここから1件をランダムに選び、見た目はそのままに名前・口調・性格などを付与します（表示名の末尾に「（モブ）」が付きます）。1件＝名前・口調・性格などをセットにした1ペルソナ一式です。生成モードを「LLM都度生成」にした場合はここには使いません（自動生成された行が「LLM生成」バッジ付きで参考表示されます）。
      </p>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: '#888' }}>World</span>
        <select
          style={{ display: 'block', width: 260 }}
          value={effectiveWorldId ?? ''}
          onChange={(e) => {
            setWorldId(Number(e.target.value));
            cancelEdit();
          }}
        >
          {realWorlds.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>

      {presetsLoading ? (
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
                {p.name}
                {p.is_generated && (
                  <span style={{ fontSize: 10, color: '#2563eb', border: '1px solid #2563eb', borderRadius: 8, padding: '0 6px', marginLeft: 6 }}>
                    LLM生成
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
                  {[p.personality, p.speech_style].filter(Boolean).join(' / ')}
                </span>
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
          名前
          <input style={{ display: 'block', width: '100%' }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例: はなこ" />
        </label>
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
          <button onClick={handleSave} disabled={!form.name || effectiveWorldId == null}>
            {editingId != null ? '保存' : '追加'}
          </button>
        </div>
      </div>
    </div>
  );
}
