// World単位でカスタマイズ可能な日付表示テンプレート（WorldsPage.jsx）。
//
// promptTemplate.js の renderPromptTemplate はdanbooruタグ用にカンマ区切りの
// 後処理(空セグメント除去)をしており、日付フォーマットには無関係な挙動なので
// あえて再利用せず、素の${key}置換だけを行う専用の関数にしてある。
const PLACEHOLDER_PATTERN = /\$\{(\w+)\}/g;

export function renderDateTemplate(template, variables) {
  return (template || '').replace(PLACEHOLDER_PATTERN, (match, key) => variables[key] ?? '');
}

// 各プレースホルダは呼び出し側で条件文を書けない(素の置換のみ)ため、値そのものに
// 自然な接尾語を含めてある(${year}→"1年目"、${day}→"01日"等)。こうしておけば
// ユーザーは `${year}/${season}/${day}/${weather}` のようにplaceholderを並べる
// だけで自然な日本語になる。
export function buildDateTemplateVariables(breakdown, { timeSlotLabel, weather }) {
  return {
    year: `${breakdown.year}年目`,
    season: `${breakdown.seasonLabel}の月`,
    day: `${String(breakdown.dayOfSeason).padStart(2, '0')}日`,
    weekday: `${breakdown.dayOfWeekLabel}曜日`,
    // holiday: 曜日ベースの休日(毎週土日等)・名前付き特別日どちらでも立つ汎用マーカー。
    // holiday_name: world_calendar_holidays に登録された特定の日付だけが持つ名前
    // (例:「文化祭」)。曜日ベースの休日には名前が無いので、その日は空文字のまま
    // ——「・」を前置した自己完結な形にしてあるので、そのまま他のプレースホルダの
    // 後ろに続けて書ける(未設定なら何も付け足さない)。
    holiday: breakdown.isHoliday ? '（休日）' : '',
    holiday_name: breakdown.holidayName ? `・${breakdown.holidayName}` : '',
    time_slot: timeSlotLabel ?? '',
    weather: weather ?? '',
    absolute_day: String(breakdown.day),
    // day_of_year: 年内の通し日数(1年目1日目=1、年をまたぐと1に戻る)。dayが季節
    // 内でリセットされるのに対し、こちらは年内で一貫した日数を知りたい場合用。
    day_of_year: String(breakdown.dayOfYear),
  };
}

export const DEFAULT_DATE_FORMAT_TEMPLATE = '${year} ${season} ${day}（${weekday}${holiday}${holiday_name}） ${time_slot}・${weather}';
