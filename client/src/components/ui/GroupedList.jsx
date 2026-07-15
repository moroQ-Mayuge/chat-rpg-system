import { useState } from 'react';

// Generalizes RoomTemplatesPage.jsx's original collapsible-World-group
// implementation so it can be shared by any list screen. Layout-agnostic —
// item rendering (narrow sidebar rows vs a card grid) is entirely up to
// renderGroupItems, this component only owns the group header + collapse
// state.
export default function GroupedList({ groups, renderGroupItems, emptyMessage }) {
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  function toggleGroup(key) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (groups.length === 0) return emptyMessage ? <p>{emptyMessage}</p> : null;

  return (
    <div>
      {groups.map((group) => {
        const collapsed = collapsedGroups.has(group.key);
        return (
          <div key={group.key ?? 'unassigned'} style={{ marginBottom: 16 }}>
            <p
              style={{ fontWeight: 500, color: group.isUnassigned ? '#888' : '#2563eb', cursor: 'pointer', userSelect: 'none', margin: '0 0 6px' }}
              onClick={() => toggleGroup(group.key)}
            >
              {collapsed ? '▶' : '▼'} {group.label}（{group.items.length}）
            </p>
            {!collapsed && renderGroupItems(group)}
          </div>
        );
      })}
    </div>
  );
}
