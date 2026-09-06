import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRoomTemplates } from '../hooks/useRoomTemplates.js';
import { useWorlds } from '../hooks/useWorlds.js';
import { contentBundleApi, formatBundleImportSummary } from '../api/contentBundle.js';
import GroupedList from '../components/ui/GroupedList.jsx';
import { groupByKeys } from '../utils/grouping.js';

export default function RoomTemplatesPage() {
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useRoomTemplates();
  const { data: worlds } = useWorlds();
  const [exportPanelRoomId, setExportPanelRoomId] = useState(null);
  const [exportIncludeCharacters, setExportIncludeCharacters] = useState(false);
  const [importTargetWorldId, setImportTargetWorldId] = useState('');

  function toggleExportPanel(roomId) {
    setExportIncludeCharacters(false);
    setExportPanelRoomId((current) => (current === roomId ? null : roomId));
  }

  async function handleExportRoom(roomId) {
    try {
      await contentBundleApi.exportRoomTemplate(roomId, { includeCharacters: exportIncludeCharacters });
      setExportPanelRoomId(null);
    } catch (err) {
      window.alert(`エクスポートに失敗しました: ${err.message}`);
    }
  }

  async function handleImportBundle(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const result = await contentBundleApi.import(file, importTargetWorldId || undefined);
      window.alert(formatBundleImportSummary(result));
      queryClient.invalidateQueries({ queryKey: ['roomTemplates'] });
      queryClient.invalidateQueries({ queryKey: ['worlds'] });
    } catch (err) {
      window.alert(`インポートに失敗しました: ${err.message}`);
    }
  }

  if (isLoading || !worlds) return <p>読み込み中...</p>;

  // Rooms are shared master data now (0030_room_world_decoupling.sql) — a
  // room can legitimately appear in more than one World's group here. A room
  // attached to zero real Worlds always carries the real "未所属" World's id
  // in world_ids instead (worldRoomTemplatesRepo.js's auto attach/detach
  // fallback), so it groups under that World's own name here like any other
  // -- the groupByKeys `unassignedLabel` fallback below is now unreachable
  // for rooms specifically (kept as a defensive default, not load-bearing).
  const groups = groupByKeys(
    templates,
    (template) => template.world_ids,
    (worldId) => worlds.find((w) => w.id === worldId)?.name ?? `World#${worldId}`,
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>部屋一覧</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: '#888' }}>
            インポート先World（部屋単体のzipに使用）
          </span>
          <select value={importTargetWorldId} onChange={(e) => setImportTargetWorldId(e.target.value)} style={{ fontSize: 12 }}>
            <option value="">選択してください</option>
            {worlds.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <label style={{ fontSize: 12, cursor: 'pointer' }}>
            インポート（zip）
            <input type="file" accept=".zip" onChange={handleImportBundle} style={{ display: 'none' }} />
          </label>
          <Link to="/rooms/new">
            <button>+ 新規部屋</button>
          </Link>
        </div>
      </div>

      <GroupedList
        groups={groups}
        storageKey="room-templates"
        emptyMessage="まだ部屋がありません"
        renderGroupItems={(group) => (
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
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button style={{ fontSize: 12 }} onClick={() => toggleExportPanel(room.id)}>
                        エクスポート
                      </button>
                      <Link to={`/rooms/${room.id}/edit`}>
                        <button style={{ fontSize: 12 }}>編集</button>
                      </Link>
                    </div>
                  </div>
                  {exportPanelRoomId === room.id && (
                    <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="checkbox"
                          checked={exportIncludeCharacters}
                          onChange={(e) => setExportIncludeCharacters(e.target.checked)}
                        />
                        登場キャラクターを含める
                      </label>
                      <button onClick={() => handleExportRoom(room.id)}>ダウンロード</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      />
    </div>
  );
}
