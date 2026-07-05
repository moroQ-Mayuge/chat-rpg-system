import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useWorlds } from '../hooks/useWorlds.js';
import { usePlaythroughsForWorld, usePlaythroughMutations } from '../hooks/usePlaythroughs.js';
import { playthroughsApi } from '../api/playthroughs.js';

export default function PlaythroughsPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const { data: worlds } = useWorlds();
  const { data: playthroughs, isLoading } = usePlaythroughsForWorld(worldId);
  const { create } = usePlaythroughMutations(worldId);
  const [newName, setNewName] = useState('');

  const world = worlds?.find((w) => String(w.id) === worldId);

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
          <div
            key={p.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 10,
              border: '1px solid #ddd',
              borderRadius: 8,
            }}
          >
            <div>
              <p style={{ margin: 0 }}>{p.name}</p>
              <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888' }}>
                {p.current_day}日目 {p.current_time_slot_label} ／ {p.current_weather} ／ {p.current_season_label}
              </p>
            </div>
            <button onClick={() => resume(p.id)}>続きから</button>
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
