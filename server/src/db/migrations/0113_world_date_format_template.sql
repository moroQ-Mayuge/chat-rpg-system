-- Worldごとにカスタマイズ可能な日付表示テンプレート(services/dateFormat.js)。
-- 「年」の概念がこれまでコード上どこにも存在せず(current_year列も無ければ
-- どの画面にも表示されない)、季節が一巡しても年が変わったことが分からない
-- という報告があったため、年・季節内日数を含む正式なカレンダー表示を導入する。
ALTER TABLE worlds ADD COLUMN date_format_template TEXT NOT NULL DEFAULT '${year} ${season} ${day}（${weekday}${holiday}） ${time_slot}・${weather}';
