// 「妊娠しやすさ」のゲーム内指標(0070_character_gender_and_cycle.sql)。
// 月経周期そのものの再現ではなく、受胎しやすさだけを段階で表す尺度として
// 扱う——出血・生理痛・PMSといった側面は意図的に対象外。
//
// 値は playthroughs.current_day から毎回導出するだけで、可変状態をどこにも
// 持たない。日付を進める処理と別に周期の状態を更新して回る必要がなく、
// あとから日付が変わってもズレようがない(季節・曜日が
// playthroughsRepo.js の calendarInfoForDay で導出されているのと同じ考え方)。

export const CYCLE_PHASES = ['安全', 'やや安全', 'やや危険', '危険', '最危険'];

// 周期内の位置(0..1)に対する段階。排卵日に向けて数日かけて上がり、直後に
// 急落する非対称な形にしてある——危険な期間が排卵の「前側」に広くなる。
// 割合で定義しているので、周期長を28日から14日等に変えても形が保たれる。
const PHASE_BANDS = [
  [0.21, '安全'],
  [0.32, 'やや安全'],
  [0.39, 'やや危険'],
  [0.46, '危険'],
  [0.52, '最危険'],
  [0.58, '危険'],
  [0.64, 'やや危険'],
  [0.7, 'やや安全'],
  [1.01, '安全'],
];

export function phaseForRatio(ratio) {
  const r = ((ratio % 1) + 1) % 1; // 負値・1以上でも周期内に畳む
  for (const [upperBound, phase] of PHASE_BANDS) {
    if (r < upperBound) return phase;
  }
  return '安全';
}

// 周期内の何日目か(1始まり)。オフセットでキャラごとに位相をずらす。
export function cycleDayFor(currentDay, offsetDay, cycleLength) {
  const length = cycleLength > 0 ? cycleLength : 28;
  return ((((currentDay - 1 + (offsetDay || 0)) % length) + length) % length) + 1;
}

// World・キャラの両方が有効な場合だけ段階を返す。どちらかがOFFなら null で、
// 呼び出し側は行を一切出力しない。
export function cyclePhaseFor(character, playthrough, world) {
  if (!world?.cycle_enabled || !character?.cycle_enabled) return null;
  const length = world.cycle_length_days > 0 ? world.cycle_length_days : 28;
  const dayInCycle = cycleDayFor(playthrough.current_day, character.cycle_offset_day, length);
  return phaseForRatio((dayInCycle - 1) / length);
}
