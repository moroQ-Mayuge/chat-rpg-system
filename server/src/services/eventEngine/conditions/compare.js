// 数値の比較(条件で共通)。対応する演算子は >= <= == > < != の6つ。
// 未知の演算子は false(従来の各条件の既定と同じ)。
export const NUMERIC_COMPARISONS = ['>=', '<=', '==', '>', '<', '!='];

export function compareNumber(value, comparison, target) {
  switch (comparison) {
    case '>=':
      return value >= target;
    case '<=':
      return value <= target;
    case '==':
      return value === target;
    case '>':
      return value > target;
    case '<':
      return value < target;
    case '!=':
      return value !== target;
    default:
      return false;
  }
}
