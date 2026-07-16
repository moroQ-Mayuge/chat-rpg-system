import { useEffect, useRef, useState } from 'react';
import styles from './TagChips.module.css';

function parseTags(text) {
  return (text || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .map((tag) => ({ tag, enabled: true }));
}

function joinEnabled(chips) {
  return chips
    .filter((c) => c.enabled)
    .map((c) => c.tag)
    .join(', ');
}

export default function DanbooruTagEditor({ value, onChange }) {
  const [chips, setChips] = useState(() => parseTags(value));
  const [draft, setDraft] = useState('');
  const [previewText, setPreviewText] = useState(value || '');
  // Tracks the last value *we* emitted via onChange, so the re-sync effect
  // below can tell "parent echoed our own edit back" (joinEnabled strips
  // disabled tags, so re-parsing that echo would silently drop them) apart
  // from "caller swapped to a genuinely different value" (e.g. switching to
  // another character's outfit -- this component isn't remounted, so the
  // lazy useState initializers above only run once and would otherwise keep
  // showing the previous character's chips/preview).
  const lastEmitted = useRef(value);

  useEffect(() => {
    setPreviewText(joinEnabled(chips));
  }, [chips]);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    setChips(parseTags(value));
    setPreviewText(value || '');
    lastEmitted.current = value;
  }, [value]);

  function commitChips(next) {
    setChips(next);
    const joined = joinEnabled(next);
    lastEmitted.current = joined;
    onChange(joined);
  }

  function toggleChip(index) {
    commitChips(chips.map((c, i) => (i === index ? { ...c, enabled: !c.enabled } : c)));
  }

  function addChip() {
    const value = draft.trim();
    if (!value) return;
    commitChips([...chips, { tag: value, enabled: true }]);
    setDraft('');
  }

  function handlePreviewBlur() {
    const next = parseTags(previewText);
    commitChips(next);
  }

  return (
    <div>
      <div className={styles.chips}>
        {chips.map((chip, index) => (
          <button
            key={`${chip.tag}-${index}`}
            type="button"
            onClick={() => toggleChip(index)}
            className={styles.chip}
            style={{
              border: 'none',
              cursor: 'pointer',
              opacity: chip.enabled ? 1 : 0.5,
              textDecoration: chip.enabled ? 'none' : 'line-through',
            }}
          >
            {chip.tag} {chip.enabled ? '✓' : '✗'}
          </button>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addChip();
          }
        }}
        onBlur={addChip}
        placeholder="+ タグ追加"
        className={styles.input}
      />
      <p style={{ fontSize: 11, color: '#888', margin: '10px 0 4px' }}>最終タグプレビュー（直接編集可）</p>
      <textarea
        style={{ width: '100%', height: 44, fontSize: 12, boxSizing: 'border-box' }}
        value={previewText}
        onChange={(e) => setPreviewText(e.target.value)}
        onBlur={handlePreviewBlur}
      />
      <p style={{ fontSize: 10, color: '#999', margin: '4px 0 0' }}>
        チップのON/OFFと双方向に同期。並び順や重み付け記法(tag:1.2)などの微調整はここで直接行う
      </p>
    </div>
  );
}
