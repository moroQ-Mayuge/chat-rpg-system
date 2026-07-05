import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { playthroughsApi } from '../api/playthroughs.js';
import { useRoomTemplates } from '../hooks/useRoomTemplates.js';
import { usePlaythroughMutations } from '../hooks/usePlaythroughs.js';

export default function RoomPickerPage() {
  const { playthroughId } = useParams();
  const navigate = useNavigate();
  const { data: playthrough } = useQuery({
    queryKey: ['playthroughs', playthroughId],
    queryFn: () => playthroughsApi.get(playthroughId),
  });
  const { data: templates, isLoading } = useRoomTemplates();
  const { createRoomSession } = usePlaythroughMutations();

  async function enterRoom(roomTemplateId) {
    const session = await createRoomSession.mutateAsync({ playthroughId, roomTemplateId });
    navigate(`/room-sessions/${session.id}/chat`);
  }

  if (isLoading || !playthrough) return <p>読み込み中...</p>;

  const roomsInWorld = templates.filter((t) => t.world_id === playthrough.world_id);

  return (
    <div>
      <p style={{ fontSize: 12, color: '#888' }}>
        {playthrough.name} ／ {playthrough.current_day}日目 {playthrough.current_time_slot_label} ／ {playthrough.current_weather}
      </p>
      <h2>どの部屋に入りますか？</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {roomsInWorld.map((room) => (
          <div
            key={room.id}
            onClick={() => enterRoom(room.id)}
            style={{ border: '1px solid #ddd', borderRadius: 12, overflow: 'hidden', cursor: 'pointer' }}
          >
            <div
              style={{
                aspectRatio: '16 / 9',
                background: room.background_image_path ? `url(${room.background_image_path}) center/cover` : '#eee',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#999',
                fontSize: 12,
              }}
            >
              {!room.background_image_path && '背景未設定'}
            </div>
            <div style={{ padding: 8 }}>{room.name}</div>
          </div>
        ))}
        {roomsInWorld.length === 0 && <p>この世界観にはまだ部屋がありません</p>}
      </div>
    </div>
  );
}
