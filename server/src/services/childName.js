// 子キャラの名前を組み立てる。姓は母から引き継ぎ、名は World の様式から抽選する。
//
// 「妊娠の発覚・終了」アクションで名前が明示されていればそちらが優先で、
// ここが呼ばれるのは名前が空欄のときだけ(childCharacter.js)。

// 母の姓。characters.name は姓名が繋がった1カラム(「桜井みお」)で切れ目が無いため、
// 区切りのある full_name(「桜井 澪」)の側から取る。
//
// **分割できなければ姓なし**にする。既存データには full_name が空のキャラや、
// 区切りの無い「立花香織」のような行が混じっており、字数で機械的に切ると
// 「南こころ」(1文字姓)と「一ノ瀬かえで」(3文字姓)のどちらかを必ず誤る。
// 姓が取れない母の子は名だけになる——推測して間違った姓を付けるよりはよい。
export function familyNameOf(mother) {
  const parts = `${mother?.full_name ?? ''}`.split(/[\s　]+/).filter(Boolean);
  return parts.length >= 2 ? parts[0] : '';
}

// 名の候補。様式ごとに持ち、種族別の候補があればそちらを優先する
// (RACE_GIVEN_NAMES に無い種族は様式の候補にフォールバック)。
const GIVEN_NAMES = {
  和名: [
    'さくら', 'ひなた', 'あおい', 'つむぎ', 'いちか', 'ゆい', 'ここな', 'みお',
    'りん', 'ひまり', 'すみれ', 'なな', 'ほのか', 'あかり', 'つばき', 'かえで',
    'しずく', 'ひかり', 'そら', 'ゆず', 'のどか', 'まなか',
  ],
  洋名: [
    'Emma', 'Olivia', 'Sophia', 'Isabella', 'Mia', 'Charlotte', 'Amelia',
    'Lily', 'Clara', 'Nora', 'Ivy', 'Elsie', 'Rosa', 'Hazel', 'Iris', 'Maeve',
  ],
};

// 種族別の上書き。今は空で、必要になった種族だけ足せばよい形にしてある。
const RACE_GIVEN_NAMES = {};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// 様式ごとの並べ方。和名は姓名を続けて書き(既存キャラの characters.name と同じ形)、
// 洋名は名 姓 の順に空白で繋ぐ。
function joinName(style, familyName, givenName) {
  if (!familyName) return givenName;
  return style === '洋名' ? `${givenName} ${familyName}` : `${familyName}${givenName}`;
}

export function generateChildName(mother, world) {
  const style = GIVEN_NAMES[world?.child_name_style] ? world.child_name_style : '和名';
  const pool = RACE_GIVEN_NAMES[mother?.race] ?? GIVEN_NAMES[style];
  return joinName(style, familyNameOf(mother), pick(pool));
}
