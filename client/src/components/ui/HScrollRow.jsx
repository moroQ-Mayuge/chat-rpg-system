import { useEffect, useRef } from 'react';

// 1行の横スクロール(カルーセル)行。子は折り返さず、はみ出した分は横に送る
// (.h-scroll-rowのCSSは global.css)。PCのマウスホイール(縦回転)は横スクロールに
// 変換する——端まで行ったら通常の縦スクロールに戻す。
export default function HScrollRow({ gap = 6, style, children }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    function onWheel(e) {
      if (e.deltaX !== 0 || el.scrollWidth <= el.clientWidth) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    }
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div ref={ref} className="h-scroll-row" style={{ gap, ...style }}>
      {children}
    </div>
  );
}
