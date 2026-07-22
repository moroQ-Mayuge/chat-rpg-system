import { useLocalStorageState } from '../../hooks/useLocalStorageState.js';

const setSerialize = (s) => JSON.stringify([...s]);
const setDeserialize = (s) => new Set(JSON.parse(s));

// Generalizes RoomTemplatesPage.jsx's original collapsible-World-group
// implementation so it can be shared by any list screen. Layout-agnostic —
// item rendering (narrow sidebar rows vs a card grid) is entirely up to
// renderGroupItems, this component only owns the group header + collapse
// state.
// storageKey (optional): when passed, which groups are collapsed persists to
// localStorage per-caller (e.g. "characters" vs "events") so it survives a
// reload instead of resetting to all-expanded every time.
export default function GroupedList({ groups, renderGroupItems, emptyMessage, storageKey }) {
  const [collapsedGroups, setCollapsedGroups] = useLocalStorageState(
    storageKey ? `groupedList:${storageKey}:collapsed` : null,
    new Set(),
    { serialize: setSerialize, deserialize: setDeserialize },
  );

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
