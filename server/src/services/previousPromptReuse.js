// 「直前に生成された画像のプロンプトを元にする」ための、プロンプト文字列の組み替え。
//
// 前回のプロンプト(カンマ区切りのタグ列)から、そのキャラの前回のキャラタグだけを取り除き、
// 今の状態のキャラタグを元あった位置へ差し込む。場所・雰囲気・設備・他のキャラのタグや、
// イベントが足した動作の指定など、それ以外の部分は前回のまま残る。

function splitTags(text) {
  return (text ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

// previousPrompt: 前回の画像のプロンプト全体
// oldCharacterTags: そのキャラについて前回記録したキャラタグ
// newCharacterTags: そのキャラの今のキャラタグ(脱衣状態・ポーズ反映済み)
//
// 前回のタグは「1回ずつ」だけ取り除く(複数キャラが同じ`1girl`等を持っていても、
// 他のキャラの分まで消さない)。差し込み位置は、最初に取り除いたタグがあった位置
// (1つも見つからなければ末尾)。
export function swapCharacterTags(previousPrompt, oldCharacterTags, newCharacterTags) {
  const tokens = splitTags(previousPrompt);
  const remaining = [...splitTags(oldCharacterTags)];
  const kept = [];
  let insertAt = -1;
  for (const token of tokens) {
    const idx = remaining.indexOf(token);
    if (idx >= 0) {
      remaining.splice(idx, 1);
      if (insertAt < 0) insertAt = kept.length;
      continue;
    }
    kept.push(token);
  }
  const fresh = splitTags(newCharacterTags);
  if (insertAt < 0) insertAt = kept.length;
  kept.splice(insertAt, 0, ...fresh);
  return kept.join(', ');
}
