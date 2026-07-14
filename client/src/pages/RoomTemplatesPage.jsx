import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRoomTemplates } from '../hooks/useRoomTemplates.js';
import { useWorlds } from '../hooks/useWorlds.js';
import { contentBundleApi, formatBundleImportSummary } from '../api/contentBundle.js';

export default function RoomTemplatesPage() {
  const queryClient = useQueryClient();
  const { data: templates, isLoading } = useRoomTemplates();
  const { data: worlds } = useWorlds();
  const [exportPanelRoomId, setExportPanelRoomId] = useState(null);
  const [exportIncludeCharacters, setExportIncludeCharacters] = useState(false);
  const [importTargetWorldId, setImportTargetWorldId] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  function toggleGroup(worldId) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(worldId)) next.delete(worldId);
      else next.add(worldId);
      return next;
    });
  }

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
  // room can legitimately appear in more than one World's group here.
  // Rooms attached to zero Worlds fall into a synthetic "未接続" group.
  const groups = new Map();
  for (const template of templates) {
    const worldIds = template.world_ids.length > 0 ? template.world_ids : [null];
    for (const worldId of worldIds) {
      if (!groups.has(worldId)) {
        const world = worldId != null ? worlds.find((w) => w.id === worldId) : null;
        groups.set(worldId, { worldId, worldName: world?.name ?? '未接続', isUnassigned: worldId == null, items: [] });
      }
      groups.get(worldId).items.push(template);
    }
  }
  const sortedGroups = [...groups.values()].sort((a, b) => Number(a.isUnassigned) - Number(b.isUnassigned));

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

      {sortedGroups.length === 0 && <p>まだ部屋がありません</p>}

      {sortedGroups.map((group) => {
        const collapsed = collapsedGroups.has(group.worldId);
        return (
        <div key={group.worldId ?? 'unattached'} style={{ marginBottom: 20 }}>
          <p
            style={{ fontWeight: 500, color: group.isUnassigned ? '#888' : '#2563eb', cursor: 'pointer', userSelect: 'none' }}
            onClick={() => toggleGroup(group.worldId)}
          >
            {collapsed ? '▶' : '▼'} {group.worldName}（{group.items.length}）
          </p>
          {!collapsed && (
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
        </div>
        );
      })}
    </div>
  );
}
