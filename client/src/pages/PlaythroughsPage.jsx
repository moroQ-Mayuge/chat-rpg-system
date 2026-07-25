import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorlds } from '../hooks/useWorlds.js';
import {
  usePlaythroughsForWorld,
  usePlaythroughMutations,
  useCharacterMemories,
  useCharacterMemoryMutations,
} from '../hooks/usePlaythroughs.js';
import { useCharacters } from '../hooks/useCharacters.js';
import { playthroughsApi } from '../api/playthroughs.js';

const emptyProtagonistForm = {
  use_custom_protagonist: false,
  protagonist_name: '',
  protagonist_nickname: '',
  protagonist_occupation: '',
  protagonist_appearance: '',
  protagonist_gender: '',
  protagonist_notes: '',
  protagonist_mode: 'character',
};

function ProtagonistSettingsPanel({ playthrough, world }) {
  const { updateProtagonist } = usePlaythroughMutations(world.id);
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState(emptyProtagonistForm);

  useEffect(() => {
    setForm({
      use_custom_protagonist: Boolean(playthrough.use_custom_protagonist),
      protagonist_name: playthrough.protagonist_name ?? '',
      protagonist_nickname: playthrough.protagonist_nickname ?? '',
      protagonist_occupation: playthrough.protagonist_occupation ?? '',
      protagonist_appearance: playthrough.protagonist_appearance ?? '',
      protagonist_gender: playthrough.protagonist_gender ?? '',
      protagonist_notes: playthrough.protagonist_notes ?? '',
      protagonist_mode: playthrough.protagonist_mode ?? 'character',
    });
  }, [playthrough]);

  function set(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    await updateProtagonist.mutateAsync({ id: playthrough.id, data: form });
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button style={{ fontSize: 11 }} onClick={() => setExpanded((e) => !e)}>
        {expanded ? '主人公設定を閉じる ▲' : '主人公設定 ▼'}
      </button>

      {expanded && (
        <div style={{ marginTop: 8, border: '1px solid #ddd', borderRadius: 6, padding: 10, background: '#fafafa' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={form.use_custom_protagonist}
              onChange={(e) => set('use_custom_protagonist', e.target.checked)}
            />
            このルート専用の主人公設定を使う（オフなら「{world.name}」の既定値を継承）
          </label>

          {form.use_custom_protagonist && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'block' }}>
                <span style={{ fontSize: 11, color: '#888', display: 'block' }}>ユーザーの立ち位置</span>
                <select style={{ width: '100%' }} value={form.protagonist_mode} onChange={(e) => set('protagonist_mode', e.target.value)}>
                  <option value="character">登場人物として参加する</option>
                  <option value="narrator">ナレーター／神視点（登場人物ではなく場面を直接指示する）</option>
                </select>
              </label>

              {form.protagonist_mode === 'character' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <label>
                      <span style={{ fontSize: 11, color: '#888', display: 'block' }}>名前</span>
                      <input style={{ width: '100%' }} value={form.protagonist_name} onChange={(e) => set('protagonist_name', e.target.value)} />
                    </label>
                    <label>
                      <span style={{ fontSize: 11, color: '#888', display: 'block' }}>あだ名（未指定なら「あなた」）</span>
                      <input style={{ width: '100%' }} value={form.protagonist_nickname} onChange={(e) => set('protagonist_nickname', e.target.value)} />
                    </label>
                    <label>
                      <span style={{ fontSize: 11, color: '#888', display: 'block' }}>性別</span>
                      <input style={{ width: '100%' }} value={form.protagonist_gender} onChange={(e) => set('protagonist_gender', e.target.value)} />
                    </label>
                    <label>
                      <span style={{ fontSize: 11, color: '#888', display: 'block' }}>職業・立場</span>
                      <input style={{ width: '100%' }} value={form.protagonist_occupation} onChange={(e) => set('protagonist_occupation', e.target.value)} />
                    </label>
                    <label>
                      <span style={{ fontSize: 11, color: '#888', display: 'block' }}>容貌</span>
                      <input style={{ width: '100%' }} value={form.protagonist_appearance} onChange={(e) => set('protagonist_appearance', e.target.value)} />
                    </label>
                  </div>
                  <label style={{ display: 'block' }}>
                    <span style={{ fontSize: 11, color: '#888', display: 'block' }}>その他情報</span>
                    <textarea
                      style={{ display: 'block', width: '100%', height: 40 }}
                      value={form.protagonist_notes}
                      onChange={(e) => set('protagonist_notes', e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={save} disabled={updateProtagonist.isPending}>
              {updateProtagonist.isPending ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Route-scoped episodic memory editor (0068). Lives on the route rather than
// the character edit screen because a characters row is shared master data
// across Worlds/routes while its memories belong to one specific route.
// Hidden entirely when the World turns off memory_editing_visible (so a
// finished World doesn't expose authoring controls to whoever plays it).
function MemoriesPanel({ playthrough }) {
  const [expanded, setExpanded] = useState(false);
  // Only fetch once opened -- most routes are never expanded in a given visit.
  const { data: memories } = useCharacterMemories(playthrough.id, expanded);
  const { data: characters } = useCharacters();
  const { add, update, remove } = useCharacterMemoryMutations(playthrough.id);
  const [newCharacterId, setNewCharacterId] = useState('');
  const [newContent, setNewContent] = useState('');

  // Mobs deliberately can't hold route-persistent state, so they're not
  // offerable targets (the server rejects them too).
  const eligibleCharacters = (characters ?? []).filter((c) => !c.is_mob);
  const nameFor = (id) => characters?.find((c) => c.id === id)?.name ?? `#${id}`;

  const byCharacter = new Map();
  for (const m of memories ?? []) {
    if (!byCharacter.has(m.character_id)) byCharacter.set(m.character_id, []);
    byCharacter.get(m.character_id).push(m);
  }

  async function handleAdd() {
    if (!newCharacterId || !newContent.trim()) return;
    await add.mutateAsync({ character_id: Number(newCharacterId), content: newContent.trim() });
    setNewContent('');
  }

  return (
    <div style={{ marginTop: 6 }}>
      <button style={{ fontSize: 11 }} onClick={() => setExpanded((e) => !e)}>
        {expanded ? '記憶を閉じる ▲' : '記憶 ▼'}
      </button>

      {expanded && (
        <div style={{ marginTop: 8, border: '1px solid #ddd', borderRadius: 6, padding: 10, background: '#fafafa' }}>
          <p style={{ fontSize: 11, color: '#888', margin: '0 0 8px' }}>
            このルートでの出来事の記録です。📌のものは件数上限の枠外で必ずプロンプトに載ります。
          </p>

          {[...byCharacter.entries()].map(([characterId, rows]) => (
            <div key={characterId} style={{ marginBottom: 10 }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 'bold' }}>{nameFor(characterId)}</p>
              {rows.map((m) => (
                <div key={m.id} style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 3 }}>
                  <button
                    style={{ fontSize: 11, padding: '2px 5px', opacity: m.is_pinned ? 1 : 0.35 }}
                    title={m.is_pinned ? 'ピン留めを解除' : 'ピン留めする'}
                    onClick={() => update.mutate({ memoryId: m.id, data: { is_pinned: !m.is_pinned } })}
                  >
                    📌
                  </button>
                  <span style={{ fontSize: 10, color: '#888', flexShrink: 0, width: 70 }}>{m.occurred_label}</span>
                  <input
                    style={{ flex: 1, fontSize: 12 }}
                    defaultValue={m.content}
                    onBlur={(e) => {
                      if (e.target.value !== m.content) update.mutate({ memoryId: m.id, data: { content: e.target.value } });
                    }}
                  />
                  <span style={{ fontSize: 10, color: '#aaa', flexShrink: 0 }}>
                    {{ manual: '手動', event: 'イベント', auto: '自動' }[m.source] ?? m.source}
                  </span>
                  <button style={{ fontSize: 11, padding: '2px 5px' }} onClick={() => remove.mutate(m.id)}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ))}
          {(memories?.length ?? 0) === 0 && <p style={{ fontSize: 12, color: '#888' }}>まだ記憶がありません</p>}

          <div style={{ display: 'flex', gap: 4, marginTop: 8, borderTop: '1px solid #e5e5e5', paddingTop: 8 }}>
            <select style={{ fontSize: 12 }} value={newCharacterId} onChange={(e) => setNewCharacterId(e.target.value)}>
              <option value="">キャラを選択</option>
              {eligibleCharacters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              style={{ flex: 1, fontSize: 12 }}
              placeholder="例：無理やりキスをされて、とても怖い思いをした"
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
            />
            <button style={{ fontSize: 11 }} onClick={handleAdd} disabled={add.isPending || !newCharacterId || !newContent.trim()}>
              追加
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlaythroughsPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const { data: worlds } = useWorlds();
  const { data: playthroughs, isLoading } = usePlaythroughsForWorld(worldId);
  const { create, remove } = usePlaythroughMutations(worldId);
  const [newName, setNewName] = useState('');

  const world = worlds?.find((w) => String(w.id) === worldId);

  async function handleDelete(playthrough) {
    if (!window.confirm(`ルート「${playthrough.name}」を削除しますか？(このルートのチャット履歴・部屋滞在も全て削除されます。元に戻せません)`)) return;
    await remove.mutateAsync(playthrough.id);
  }

  async function resume(playthroughId) {
    const activeSession = await playthroughsApi.getActiveSession(playthroughId);
    if (activeSession) {
      navigate(`/room-sessions/${activeSession.id}/chat`);
    } else {
      navigate(`/playthroughs/${playthroughId}/pick-room`);
    }
  }

  async function startNew() {
    const name = window.prompt('新しいルートの名前（例：純愛ルート）');
    if (!name) return;
    const playthrough = await create.mutateAsync(name);
    navigate(`/playthroughs/${playthrough.id}/pick-room`);
  }

  if (isLoading || !worlds) return <p>読み込み中...</p>;

  return (
    <div>
      <h2>{world?.name ?? '世界'} — ルート一覧</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {playthroughs.map((p) => (
          <div key={p.id} style={{ padding: 10, border: '1px solid #ddd', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ margin: 0 }}>{p.name}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888' }}>
                  {p.current_day}日目 {p.current_time_slot_label} ／ {p.current_weather} ／ {p.current_season_label}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => resume(p.id)}>続きから</button>
                <button onClick={() => handleDelete(p)} disabled={remove.isPending}>
                  削除
                </button>
              </div>
            </div>
            {world && <ProtagonistSettingsPanel playthrough={p} world={world} />}
            {world?.memory_editing_visible && <MemoriesPanel playthrough={p} />}
          </div>
        ))}
        {playthroughs.length === 0 && <p>まだルートがありません</p>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={startNew}>+ 新しいルートを始める</button>
      </div>
    </div>
  );
}
