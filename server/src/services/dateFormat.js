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
    holiday: breakdown.isHoliday ? '（休日）' : '',
    time_slot: timeSlotLabel ?? '',
    weather: weather ?? '',
    absolute_day: String(breakdown.day),
  };
}

export const DEFAULT_DATE_FORMAT_TEMPLATE = '${year} ${season} ${day}（${weekday}${holiday}） ${time_slot}・${weather}';
