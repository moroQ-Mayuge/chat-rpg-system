// LLM出力を日本語＋英語の文字種に限定するGBNF文法（KoboldCppのgrammarパラメータ用）。
//
// 多言語モデルはロールプレイ中にハングル・キリル・アラビア文字などを混ぜてくる
// ことがある。GBNFはUnicodeコードポイント範囲での絞り込みに対応しており
// (llama.cpp grammars/README.md が平仮名範囲そのものを例示している)、許可する
// 文字種のホワイトリストを与えることでこれを封じられる。
//
// 構造は制約せず文字種だけを絞る `root ::= char*` 形式にしてある。この形は常に
// accepting状態＝EOSがいつでも許可されるので、既存のstop文字列や終了判定、
// 台本形式のパース(responseParser.js)に一切干渉しない。
//
// 【原理的な限界】CJK統合漢字(U+4E00-U+9FFF)は日本語の漢字と中国語の漢字が
// 同一範囲を共有するため、範囲指定では中国語を排除できない。簡体字固有の字形
// だけは日本語で使わない別コードポイントなので下のブロックリストで弾けるが、
// 繁体字や共通漢字だけで書かれた短文は日本語と区別がつかず通過する。

// 日本語表記に現れない簡体字。中国語の高頻度な機能語・動詞・常用字を並べてあり、
// これらが1字も使えないと中国語の文はほぼ成立しない。
//
// 【この配列を編集する時は必ず検証すること】新旧字体が同じコードポイントの漢字
// (会・来・学・体・声・定・数・条・当・残・独・断・旧・機・猫 など)を「中国語でも
// 使うから」と入れてしまうと日本語出力が静かに壊れる。実際、初版では29字を
// 取り違えていた。下記のリストはJIS X 0208(Shift_JIS)に存在しないことを機械的に
// 確認済み——JISに入っている＝日本語で使う字なので、この判定が根拠になる。
//
// 追加・変更したら次を実行し、出力が「なし」であることを確認する:
//   node --input-type=module -e "
//   import iconv from 'iconv-lite';
//   import { __testing } from './server/src/services/llmGrammar.js';
//   const bad = [...new Set(__testing.SIMPLIFIED_ONLY_CHARS)]
//     .filter((c) => iconv.decode(iconv.encode(c, 'Shift_JIS'), 'Shift_JIS') === c);
//   console.log(bad.join(' ') || 'なし');"
const SIMPLIFIED_ONLY_CHARS = [
  // 代名詞・疑問詞・語気助詞（中国語の会話文の骨格）
  '们', '这', '么', '谁', '哪', '吗', '呢', '咱', '您', '你',
  // 高頻度の動詞・形容詞（日本語は旧字体側を使うため字形が異なる）
  '说', '话', '讲', '问', '见', '觉', '让', '给', '还', '过',
  '发', '现', '开', '关', '门', '进', '对', '错', '难', '应',
  '认', '识', '记', '语', '爱', '欢', '兴', '乐',
  '变', '换', '转', '动', '继', '续', '终', '结', '备', '复',
  '减', '创', '压', '响', '夺', '奋', '归', '战', '扫', '报',
  '挥', '损', '杀', '检', '测', '洁', '润', '渐', '灭', '炼',
  '烦', '烧', '猎',
  // 名詞・その他の常用字
  '东', '车', '马', '鸟', '鱼', '风', '书', '长', '时', '实',
  '为', '众', '传', '亚', '华', '单', '卖', '图', '团',
  '业', '产', '员', '队', '组', '织', '级', '统', '经', '济',
  '际', '边', '连', '选', '样', '种', '类', '园', '场', '间',
  '铁', '钱', '银', '头', '脸', '脑', '药', '疗', '养', '护',
  '卫', '闻', '块', '坚', '优', '农', '则', '刚', '务', '势',
  '协', '圆', '妇', '孙', '宁', '审', '宽', '岁', '岛', '币',
  '帐', '庆', '库', '张', '弹', '总', '术', '杂', '权', '极',
  '构', '枪', '柜', '标', '树', '桥', '汉', '汤', '沟', '浓',
  '满', '滨', '灵', '灾', '热', '狮', '环', '琼',
];

// GBNFに集合差の構文が無いため、除外したい文字の前後で範囲を分割した選択肢列を
// 組み立てる。ソース側は上のブロックリストを保守するだけでよい。
function buildRangesExcluding(start, end, blockedChars) {
  const blocked = [...new Set(blockedChars.map((c) => c.codePointAt(0)))]
    .filter((cp) => cp >= start && cp <= end)
    .sort((a, b) => a - b);

  const ranges = [];
  let from = start;
  for (const cp of blocked) {
    if (cp > from) ranges.push([from, cp - 1]);
    from = cp + 1;
  }
  if (from <= end) ranges.push([from, end]);
  return ranges;
}

function hex4(cp) {
  return `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`;
}

function rangeLiteral([from, to]) {
  return from === to ? `[${hex4(from)}]` : `[${hex4(from)}-${hex4(to)}]`;
}

// 漢字以外の許可範囲。ASCIIを丸ごと通すのは、台本形式の "[名前]: 本文
// [EMOTION:key]"、ITEM_GRANT等の "|" 区切り、キャラシートの "/" 区切りを
// 壊さないため（responseParser.js / characterSheetFormat.js が依存している）。
const ALLOWED_RANGES = [
  [0x0009, 0x000a], // タブ・改行（台本は行区切りが必須）
  [0x0020, 0x007e], // ASCII印字可能文字（英語・数字・記号すべて）
  [0x2010, 0x2049], // ‐ – — … ‥ ※ ‼ など
  [0x2190, 0x21ff], // 矢印
  [0x25a0, 0x25ff], // ○ △ □ ◆ など
  [0x266a, 0x266f], // ♪ ♭ ♯
  [0x3000, 0x303f], // 全角空白・、。「」『』【】〜・
  [0x3041, 0x309f], // 平仮名
  [0x30a0, 0x30ff], // 片仮名
  [0xff01, 0xff9f], // 全角記号・全角英数・半角カナ
];

const KANJI_START = 0x4e00;
const KANJI_END = 0x9fff;

function buildJapaneseEnglishGrammar() {
  const kanjiRanges = buildRangesExcluding(KANJI_START, KANJI_END, SIMPLIFIED_ONLY_CHARS);
  const alternatives = [...ALLOWED_RANGES, ...kanjiRanges].map(rangeLiteral).join(' | ');
  return `root ::= char*\nchar ::= ${alternatives}\n`;
}

// 起動時に1回だけ組み立てる（毎リクエストで数百の範囲を文字列連結しない）。
export const JAPANESE_ENGLISH_GRAMMAR = buildJapaneseEnglishGrammar();

// テスト用に内部関数も出しておく（ブロックリストの誤りが一番怖い箇所なので、
// 「この文字が通るか」を直接検証できるようにする）。
export const __testing = { SIMPLIFIED_ONLY_CHARS, ALLOWED_RANGES, buildRangesExcluding, KANJI_START, KANJI_END };
