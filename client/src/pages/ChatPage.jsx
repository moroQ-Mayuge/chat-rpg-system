import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoomSession, useRoomSessionMutations } from '../hooks/useRoomSession.js';
import { playthroughsApi } from '../api/playthroughs.js';

export default function ChatPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: session, isLoading } = useRoomSession(id);
  const { sendMessage, exit } = useRoomSessionMutations(id);
  const [draft, setDraft] = useState('');

  const { data: playthrough } = useQuery({
    queryKey: ['playthroughs', session?.playthrough_id],
    queryFn: () => playthroughsApi.get(session.playthrough_id),
    enabled: session != null,
  });

  async function handleSend() {
    if (!draft.trim()) return;
    await sendMessage.mutateAsync(draft.trim());
    setDraft('');
  }

  async function handleExit() {
    await exit.mutateAsync();
    navigate(`/playthroughs/${session.playthrough_id}/pick-room`);
  }

  if (isLoading || !session || !playthrough) return <p>読み込み中...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
          {playthrough.name} ／ {playthrough.current_day}日目 {playthrough.current_time_slot_label} ／{' '}
          {playthrough.current_weather} ／ {session.current_location_text}
        </p>
        <button onClick={handleExit}>部屋を退出する</button>
      </div>

      <p style={{ fontSize: 11, color: '#888' }}>
        参加キャラ: {session.participants.map((p) => p.name).join('、') || 'なし'}
      </p>

      <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8, height: 300, overflowY: 'auto', marginBottom: 8 }}>
        {session.messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 6, textAlign: m.sender_type === 'user' ? 'right' : 'left' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '6px 10px',
                borderRadius: 8,
                background: m.sender_type === 'user' ? '#eee' : '#dbeafe',
                fontSize: 13,
              }}
            >
              {m.content}
            </span>
          </div>
        ))}
        {session.messages.length === 0 && <p style={{ color: '#999', fontSize: 12 }}>まだメッセージがありません</p>}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          style={{ flex: 1 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="メッセージを入力"
        />
        <button onClick={handleSend}>送信</button>
      </div>
    </div>
  );
}
