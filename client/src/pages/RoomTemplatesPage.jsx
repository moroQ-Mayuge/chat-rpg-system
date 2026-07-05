import { Link } from 'react-router-dom';
import { useRoomTemplates } from '../hooks/useRoomTemplates.js';

export default function RoomTemplatesPage() {
  const { data: templates, isLoading } = useRoomTemplates();

  if (isLoading) return <p>読み込み中...</p>;

  const groups = new Map();
  for (const template of templates) {
    const key = template.world_id;
    if (!groups.has(key)) {
      groups.set(key, { worldName: template.world_name, isUnassigned: template.world_is_unassigned_bucket, items: [] });
    }
    groups.get(key).items.push(template);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => Number(a.isUnassigned) - Number(b.isUnassigned));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>部屋一覧</h2>
        <Link to="/rooms/new">
          <button>+ 新規部屋</button>
        </Link>
      </div>

      {sortedGroups.length === 0 && <p>まだ部屋がありません</p>}

      {sortedGroups.map((group) => (
        <div key={group.worldName} style={{ marginBottom: 20 }}>
          <p style={{ fontWeight: 500, color: group.isUnassigned ? '#888' : '#2563eb' }}>{group.worldName}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
            {group.items.map((room) => (
              <div key={room.id} style={{ border: '1px solid #ddd', borderRadius: 12, overflow: 'hidden' }}>
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
                <div style={{ padding: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{room.name}</span>
                    <Link to={`/rooms/${room.id}/edit`}>
                      <button style={{ fontSize: 12 }}>編集</button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
