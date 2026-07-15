// Generalizes RoomTemplatesPage.jsx's original Map-based World grouping so
// CharactersPage/EventsPage/ItemsPage/RoomTemplatesPage can share one
// implementation. Records can belong to zero, one, or many groups
// (getKeys returns an array) -- a record with zero keys falls into a single
// synthetic "unassigned" bucket (key: null), sorted last.
export function groupByKeys(records, getKeys, keyToLabel, unassignedLabel = '未分類') {
  const groups = new Map();
  for (const record of records) {
    const keys = getKeys(record);
    const effectiveKeys = keys.length > 0 ? keys : [null];
    for (const key of effectiveKeys) {
      if (!groups.has(key)) {
        groups.set(key, { key, label: key == null ? unassignedLabel : keyToLabel(key), isUnassigned: key == null, items: [] });
      }
      groups.get(key).items.push(record);
    }
  }
  return [...groups.values()].sort((a, b) => Number(a.isUnassigned) - Number(b.isUnassigned));
}
