import { useState } from 'react';
import styles from './TagChips.module.css';

export default function TagChips({ tags, onChange, placeholder }) {
  const [draft, setDraft] = useState('');

  function addTag() {
    const value = draft.trim();
    if (!value || tags.includes(value)) {
      setDraft('');
      return;
    }
    onChange([...tags, value]);
    setDraft('');
  }

  function removeTag(index) {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div className={styles.chips}>
        {tags.map((tag, index) => (
          <span key={`${tag}-${index}`} className={styles.chip}>
            {tag}
            <button
              type="button"
              className={styles.removeButton}
              aria-label={`${tag}を削除`}
              onClick={() => removeTag(index)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            addTag();
          }
        }}
        onBlur={addTag}
        placeholder={placeholder}
        className={styles.input}
      />
    </div>
  );
}
