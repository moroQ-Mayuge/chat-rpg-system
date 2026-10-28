import { useState } from 'react';
import { createRoot } from 'react-dom/client';

const CHOICES = [
  { value: 'overwrite', label: '上書き' },
  { value: 'new', label: '別名で新規' },
  { value: 'skip', label: 'スキップ' },
];

const KIND_HINTS = {
  world: '設定を更新します(通貨・妊娠など、ファイルに含まれない設定は今のまま)。',
  room_template: '部屋の項目・サブ部屋・参加枠を更新します(ファイルに無いサブ部屋・枠は残ります)。',
  character: '項目・初期値・衣装を更新します(衣装は名前で照合し、ファイルに無い衣装は残ります)。',
  character_status: '内容を更新します(付与済みの状態は維持されます)。',
  event_definition: '条件・アクション・分岐を入れ替えます(発火履歴は維持されます)。',
  outfit_master: '内容を更新します(価格など、ファイルに含まれない項目は今のまま)。',
};

function ConflictDialog({ fileName, conflicts, onDone }) {
  // 既定は「別名で新規」: 既存を壊さず、ファイルの内容も取り込める。
  const [choices, setChoices] = useState(() => Object.fromEntries(conflicts.map((c) => [`${c.kind}:${c.name}`, 'new'])));

  const setAll = (value) => setChoices(Object.fromEntries(conflicts.map((c) => [`${c.kind}:${c.name}`, value])));
  const countOf = (value) => Object.values(choices).filter((v) => v === value).length;

  const kinds = [...new Set(conflicts.map((c) => c.kind))];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="同名のデータがあります"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        style={{
          background: '#fff',
          color: '#222',
          borderRadius: 8,
          width: 'min(720px, 100%)',
          maxHeight: '90dvh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
        }}
      >
        <div style={{ padding: '14px 16px 8px' }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>同名のデータがあります（{conflicts.length}件）</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#666', wordBreak: 'break-all' }}>{fileName}</p>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#444' }}>
            1件ごとに取り込み方を選んでください。「別名で新規」は名前の末尾に「（インポート）」を付けて追加します。「スキップ」は既存のデータに何も変更しません。
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#666' }}>すべて:</span>
            {CHOICES.map((c) => (
              <button key={c.value} type="button" onClick={() => setAll(c.value)} style={{ fontSize: 12 }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '0 16px', flex: 1, minHeight: 0 }}>
          {kinds.map((kind) => (
            <div key={kind} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#555', padding: '6px 0 2px', borderBottom: '1px solid #eee' }}>
                {conflicts.find((c) => c.kind === kind).kind_label}
                <span style={{ fontWeight: 400, color: '#888', marginLeft: 8 }}>{KIND_HINTS[kind]}</span>
              </div>
              {conflicts
                .filter((c) => c.kind === kind)
                .map((c) => {
                  const key = `${c.kind}:${c.name}`;
                  return (
                    <div
                      key={key}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid #f3f3f3', flexWrap: 'wrap' }}
                    >
                      <div style={{ flex: '1 1 200px', minWidth: 0, wordBreak: 'break-all' }}>
                        <span style={{ fontSize: 14 }}>{c.name}</span>
                        {c.detail && <span style={{ fontSize: 11, color: '#888', marginLeft: 6 }}>（{c.detail}）</span>}
                      </div>
                      <div role="radiogroup" aria-label={`${c.name}の取り込み方`} style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                        {CHOICES.map((choice) => (
                          <label key={choice.value} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 13, whiteSpace: 'nowrap' }}>
                            <input
                              type="radio"
                              name={key}
                              value={choice.value}
                              checked={choices[key] === choice.value}
                              onChange={() => setChoices((prev) => ({ ...prev, [key]: choice.value }))}
                            />
                            {choice.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>

        <div
          style={{
            padding: '10px 16px 14px',
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            borderTop: '1px solid #eee',
          }}
        >
          <span style={{ fontSize: 12, color: '#666' }}>
            上書き {countOf('overwrite')} / 別名で新規 {countOf('new')} / スキップ {countOf('skip')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => onDone(null)}>
              キャンセル
            </button>
            <button type="button" onClick={() => onDone(choices)} style={{ fontWeight: 700 }}>
              取り込む
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 同名の確認ダイアログを開き、利用者の選択を待つ。決定すると { "<種別>:<名前>": 'overwrite'|'new'|'skip' }、
// キャンセルすると null。各ページは alert/confirm と同じ感覚で await するだけでよいよう、
// Reactツリーの外に一時的なルートを作って描画する。
export function askImportDecisions({ fileName, conflicts }) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    function onDone(decisions) {
      root.unmount();
      host.remove();
      resolve(decisions);
    }
    root.render(<ConflictDialog fileName={fileName} conflicts={conflicts} onDone={onDone} />);
  });
}
