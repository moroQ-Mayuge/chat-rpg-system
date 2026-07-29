// 妊娠の進行段階(0076_character_pregnancies.sql)。fertilityCycle.js と同型で、
// 保存された conceived_day と playthroughs.current_day の差分から毎回導出する
// だけ。日付を進める処理と別に妊娠の状態を更新して回る必要がない。

export const PREGNANCY_STAGES = ['未発覚', '兆候', '発覚可能', '安定期', '後期', '臨月'];

// 妊娠期間に対する割合で定義しているので、期間を21日にしても280日にしても
// 段階の並びと比率が保たれる(周期の PHASE_BANDS と同じ理由)。
const STAGE_BANDS = [
  [0.12, '未発覚'],
  [0.22, '兆候'],
  [0.35, '発覚可能'],
  [0.7, '安定期'],
  [0.92, '後期'],
  [1.01, '臨月'],
];

// 周期(phaseForRatio)と違い、ここでは1を超えた分を畳まない。妊娠は繰り返さない
// ので、出産イベントを書き忘れて期間を過ぎても「臨月」に留まるのが正しい。
export function stageForRatio(ratio) {
  if (!(ratio >= 0)) return PREGNANCY_STAGES[0];
  for (const [upperBound, stage] of STAGE_BANDS) {
    if (ratio < upperBound) return stage;
  }
  return '臨月';
}

// 受胎日を1日目とした経過日数。
export function pregnancyDayFor(currentDay, conceivedDay) {
  return Math.max(1, currentDay - conceivedDay + 1);
}

// Worldが妊娠を無効にしている・妊娠が無い・既に終了している場合は null を返し、
// 呼び出し側は行を一切出力しない(cyclePhaseFor と同じ呼び出し規約)。
export function pregnancyStateFor(pregnancy, playthrough, world) {
  if (!world?.pregnancy_enabled || !pregnancy || pregnancy.ended_day != null) return null;
  const gestationDays = world.gestation_days > 0 ? world.gestation_days : 84;
  const dayInPregnancy = pregnancyDayFor(playthrough.current_day, pregnancy.conceived_day);
  return {
    stage: stageForRatio((dayInPregnancy - 1) / gestationDays),
    dayInPregnancy,
    gestationDays,
    // 本人が気づいているか。未発覚のうちはプロンプトに妊娠を載せないための判定で、
    // 段階そのものとは独立している(発覚可能な段階でも、発覚イベントが起きるまでは
    // 本人は知らないままでいられる)。
    known: pregnancy.known_from_day != null,
  };
}
