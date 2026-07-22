import { useState, useEffect } from 'react';

// Persists a piece of UI-only display preference (sort order, collapsed-group
// set, etc.) to localStorage so it survives a page reload/reopen --
// deliberately client-only (no DB round-trip, no per-user sync) since this
// is just a per-browser convenience, not shared app data. `key` may be null
// to opt out of persistence entirely while still behaving like plain
// useState (lets callers make persistence conditional without violating the
// rules of hooks).
export function useLocalStorageState(key, defaultValue, { serialize = JSON.stringify, deserialize = JSON.parse } = {}) {
  const [value, setValue] = useState(() => {
    if (!key) return defaultValue;
    try {
      const stored = localStorage.getItem(key);
      return stored != null ? deserialize(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    if (!key) return;
    try {
      localStorage.setItem(key, serialize(value));
    } catch {
      // private browsing / quota exceeded -- state still works in-memory
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value]);

  return [value, setValue];
}
