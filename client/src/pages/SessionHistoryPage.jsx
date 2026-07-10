import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { playthroughsApi } from '../api/playthroughs.js';
import { useSessionsForPlaythrough } from '../hooks/usePlaythroughs.js';
import { useWorlds } from '../hooks/useWorlds.js';

export default function SessionHistoryPage() {
  const { playthroughId } = useParams();
  const { data: playthrough } = useQuery({
    queryKey: ['playthroughs', playthroughId],
    queryFn: () => playthroughsApi.get(playthroughId),
  });
  const { data: worlds } = useWorlds();
  const { data: sessions, isLoading } = useSessionsForPlaythrough(playthroughId);

  if (isLoading || !playthrough || !worlds) return <p>読み込み中...</p>;

  const world = worlds.find((w) => w.id === playthrough.world_id);
  const timeSlotLabel = (index) => world?.time_slot_labels?.[index] ?? index;

  return (
    <div>
      <p style={{ fontSize: 12, color: '#888' }}>{playthrough.name} の会話ログ</p>
      <h2>セッション履歴</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(sessions ?? []).map((s) => (
          <Link
            key={s.id}
            to={`/room-sessions/${s.id}/log`}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 10,
              border: '1px solid #ddd',
              borderRadius: 8,
              textDecoration: 'none',
              color: 'inherit',
            }}
          >
            <span>
              {s.room_name}
              <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
                {s.entered_day}日目 {timeSlotLabel(s.entered_time_slot_index)}
              </span>
              {s.status === 'active' && (
                <span style={{ fontSize: 11, color: '#2563eb', marginLeft: 8 }}>進行中</span>
              )}
            </span>
            <span style={{ fontSize: 11, color: '#888' }}>{s.message_count}件のメッセージ</span>
          </Link>
        ))}
        {(sessions ?? []).length === 0 && <p style={{ color: '#888', fontSize: 12 }}>まだ会話履歴がありません</p>}
      </div>
    </div>
  );
}
