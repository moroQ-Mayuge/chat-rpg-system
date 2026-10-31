import { useEffect, useState } from 'react';

// 背景画像のサムネイル。画像があるときはクリックで画面いっぱいに拡大表示し、
// 背景クリックまたはEscで閉じる。`style`はサムネイル側(サイズ・角丸など)に適用される。
export default function ZoomableBackground({ src, style, children }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // 画像が差し替わった/外れたときに拡大表示だけ残らないようにする
  useEffect(() => {
    if (!src) setOpen(false);
  }, [src]);

  return (
    <>
      <div
        style={{
          ...style,
          background: src ? `url(${src}) center/cover` : '#eee',
          cursor: src ? 'zoom-in' : undefined,
        }}
        onClick={src ? () => setOpen(true) : undefined}
        title={src ? 'クリックで拡大表示' : undefined}
      >
        {children}
      </div>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            cursor: 'zoom-out',
          }}
        >
          <img src={src} alt="" style={{ maxWidth: '95vw', maxHeight: '95vh', objectFit: 'contain' }} />
        </div>
      )}
    </>
  );
}
