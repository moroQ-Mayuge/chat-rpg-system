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

// 出産後、子が登場できるようになるまでの状態。妊娠と同じく ended_day からの
// 差分で毎回導出するだけで、可変状態はどこにも持たない。
//
// 早熟(child_appearance = 'early')でのみ日数で進む。'none' は永久に登場せず、
// 'on_time_skip' は跳躍の実装待ちなので、どちらもここでは null を返す。
export function childGrowthStateFor(pregnancy, playthrough, world) {
  if (!world?.pregnancy_enabled) return null;
  if (pregnancy?.outcome !== '出産' || pregnancy.ended_day == null) return null;
  if (world.child_appearance !== 'early') return null;
  // 既にキャラとして登場済みなら、もう「待っている」状態ではない。
  if (pregnancy.child_character_id != null) return null;

  const maturationDays = world.child_maturation_days >= 0 ? world.child_maturation_days : 30;
  const daysSinceBirth = Math.max(0, playthrough.current_day - pregnancy.ended_day);
  return {
    daysSinceBirth,
    maturationDays,
    daysRemaining: Math.max(0, maturationDays - daysSinceBirth),
    ready: daysSinceBirth >= maturationDays,
  };
}

// 登場時の年齢。World設定の下限〜上限に収めたうえで、母親より年下に制限する。
// 母の age_real が空・数値でない場合は上限をそのまま使う——プレイヤー側には
// 年齢の項目自体が無いので、判定に使えるのは母の年齢だけ。
export function childAppearanceAge(world, motherAgeReal) {
  const min = world.child_age_min ?? 0;
  const max = Math.max(min, world.child_age_max ?? min);
  const motherAge = Number.parseInt(motherAgeReal, 10);
  if (!Number.isFinite(motherAge) || motherAge <= 0) return max;
  return Math.max(min, Math.min(max, motherAge - 1));
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
