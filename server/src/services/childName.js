// 子キャラの名前を組み立てる。姓は母から引き継ぎ、名は World の様式から抽選する。
//
// 「妊娠の発覚・終了」アクションで名前が明示されていればそちらが優先で、
// ここが呼ばれるのは名前が空欄のときだけ(childCharacter.js)。

// 母の full_name から「継承する部分」と「様式」を検出する(不具合報告
// 2026-08-06項目5)。characters.name は姓名が繋がった1カラム(「桜井みお」)で
// 切れ目が無いため、区切りのある full_name(「桜井 澪」)の側から取る。
//
//   ・を含む → 洋風順(名・姓、ミドルネーム等の複合姓もそのまま)。先頭が
//     個人の名、それ以降を「・」で繋いだ全体を継承対象とする(例:
//     「メアリー・ジェーン・スミス」なら「ジェーン・スミス」を継承——
//     姓とミドルネームを機械的に見分けようとして間違えるより、先頭以外を
//     まるごと家系の部分として引き継ぐ方が安全)
//   スペースのみ → 和風順(姓 名、先頭が姓)
//
// **どちらも見つからなければ継承部分なし**にする。既存データには full_name
// が空のキャラや、区切りの無い「立花香織」のような行が混じっており、字数で
// 機械的に切ると「南こころ」(1文字姓)と「一ノ瀬かえで」(3文字姓)のどちらかを
// 必ず誤る。姓が取れない母の子は名だけになる——推測して間違った姓を付ける
// よりはよい。
function detectNameStyle(mother) {
  const fullName = `${mother?.full_name ?? ''}`;
  if (fullName.includes('・')) {
    const parts = fullName.split('・').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return { style: '洋名', familyName: parts.slice(1).join('・') };
  }
  const spaceParts = fullName.split(/[\s　]+/).filter(Boolean);
  if (spaceParts.length >= 2) return { style: '和名', familyName: spaceParts[0] };
  return { style: null, familyName: '' };
}

export function familyNameOf(mother) {
  return detectNameStyle(mother).familyName;
}

// 名の候補。様式ごとに持ち、種族別の候補があればそちらを優先する
// (RACE_GIVEN_NAMES に無い種族は様式の候補にフォールバック)。
const GIVEN_NAMES = {
  和名: [
    'さくら', 'ひなた', 'あおい', 'つむぎ', 'いちか', 'ゆい', 'ここな', 'みお',
    'りん', 'ひまり', 'すみれ', 'なな', 'ほのか', 'あかり', 'つばき', 'かえで',
    'しずく', 'ひかり', 'そら', 'ゆず', 'のどか', 'まなか',
  ],
  // 日本語専用ゲームのため、洋名は必ずカタカナ転写で持つ(ラテン文字は
  // 「・」区切りルール——母の書式が「エマ・ワトソン」のようにカタカナ＋・で
  // あることが前提——と表記が食い違うため)。
  洋名: [
    'エマ', 'オリビア', 'ソフィア', 'イザベラ', 'ミア', 'シャーロット', 'アメリア',
    'リリー', 'クララ', 'ノラ', 'アイビー', 'エルシー', 'ローザ', 'ヘーゼル', 'アイリス', 'メイヴ',
  ],
};

// 種族別の上書き。今は空で、必要になった種族だけ足せばよい形にしてある。
const RACE_GIVEN_NAMES = {};

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// 様式ごとの並べ方。和名は姓名を続けて書き(既存キャラの characters.name と同じ形)、
// 洋名は名・姓の順に「・」で繋ぐ(母の書式と揃える——絶対ルール)。
function joinName(style, familyName, givenName) {
  if (!familyName) return givenName;
  return style === '洋名' ? `${givenName}・${familyName}` : `${familyName}${givenName}`;
}

export function generateChildName(mother, world) {
  const detected = detectNameStyle(mother);
  // 母の名前から様式を検出できればそれを優先(血のつながりを感じさせる —
  // 家族なら同じ命名様式のはず)。検出できなければ従来通りWorldの既定様式。
  const style = detected.style && GIVEN_NAMES[detected.style]
    ? detected.style
    : GIVEN_NAMES[world?.child_name_style]
      ? world.child_name_style
      : '和名';
  const pool = RACE_GIVEN_NAMES[mother?.race] ?? GIVEN_NAMES[style];
  return joinName(style, detected.familyName, pick(pool));
}
