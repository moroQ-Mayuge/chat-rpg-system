import { db } from '../db/connection.js';
import { createCharacter, getCharacter, updateCharacter } from '../db/repositories/charactersRepo.js';
import { attachCharacterToWorld } from '../db/repositories/worldCharactersRepo.js';
import { getPregnancy, setChildCharacter, getPregnancyByChildCharacterId } from '../db/repositories/characterPregnanciesRepo.js';
import { getPlaythrough } from '../db/repositories/playthroughsRepo.js';
import { getWorld } from '../db/repositories/worldsRepo.js';
import { childGrowthStateFor, childAppearanceAge } from './pregnancy.js';
import { generateChildName } from './childName.js';
import { generateCharacterSheet } from './characterAssist.js';

// 当面は少女で固定。可変にするのは「子を次代の主人公にする」を実装する時期で、
// それまで性別で分岐する処理を増やさないための固定
// (PLAN_2026-07-28_pregnancy_children_deviation.md の 5 章)。
// 「妊娠の発覚・終了」アクションの child_gender 欄はこの間使われない。
const CHILD_GENDER = '少女';

// 母から引き継ぐ見た目。血のつながりが顔に出るのはむしろ好都合なので、
// 目・髪・種族・属性はそのまま持ってくる。体型や胸まわりは年齢が違えば
// まるで別物なので引き継がない。
const INHERITED_FIELDS = ['race', 'attribute', 'eye_description', 'hair_description'];

// 関係値の初期設定。親子なので好意と信頼は高く、恋愛・欲情は0から。
// 依存が高めなのは、この年齢の子が親に向ける当たり前の距離感として。
const CHILD_RELATIONSHIP_DEFAULTS = {
  好感度: 80,
  信頼度: 80,
  恋愛度: 0,
  欲情度: 0,
  依存度: 60,
  淫乱度: 0,
};

// 子に付ける属性キーを3系統から組み立てる(0082)。
//
//   固定   … child_attribute_tags を全部そのまま
//   ランダム … child_random_attribute_tags から child_random_tag_count 個を抽選
//   継承   … 母のキーを1つずつ1/2で引き継ぐ(既定OFF)
//
// 継承が既定OFFなのは、母の「生徒」がそのまま付くと幼児が教室に湧くため。
// 3系統は足し合わせで、同じキーが複数系統から来ても1つに畳む。
function buildChildAttributeTags(world, mother) {
  const tags = new Set(parseTagList(world.child_attribute_tags));

  const pool = parseTagList(world.child_random_attribute_tags);
  const count = Math.max(0, Math.min(world.child_random_tag_count ?? 0, pool.length));
  // 重複なしで count 個。pool を破壊しないようコピーしてから引く。
  const remaining = [...pool];
  for (let i = 0; i < count; i += 1) {
    tags.add(remaining.splice(Math.floor(Math.random() * remaining.length), 1)[0]);
  }

  if (world.child_inherit_parent_tags) {
    for (const tag of parseTagList(mother.attribute_tags)) {
      if (Math.random() < 0.5) tags.add(tag);
    }
  }
  return [...tags].join(', ');
}

function parseTagList(raw) {
  return `${raw ?? ''}`
    .split(/[,、]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function callUserAsFor(playthrough) {
  const gender = `${playthrough.protagonist_gender ?? ''}`;
  if (/女|母|ママ/.test(gender)) return 'ママ';
  return 'パパ';
}

function relationshipDefaultRows() {
  const axes = db.prepare("SELECT id, name FROM relationship_axes WHERE scope = 'relationship'").all();
  return axes
    .filter((axis) => CHILD_RELATIONSHIP_DEFAULTS[axis.name] != null)
    .map((axis) => ({ relationship_axis_id: axis.id, initial_value: CHILD_RELATIONSHIP_DEFAULTS[axis.name] }));
}

// 「戻る頃合い」の通知を実際のキャラに変える。engine が勝手に走らせるものでは
// なく、プレイヤーがボタンを押したときだけ動く——立ち絵も表情もこれから作る
// 必要があり、勝手に始まっていて欲しい作業ではないため。
//
// 立ち絵の生成はここではしない。koboldcpp が止まっていれば失敗するもので、
// キャラ行の作成と道連れにすると「通知は消えたのにキャラは居ない」状態になる。
// 行だけ確実に作り、画像は既存の生成ボタンから後で作る。
export function materializeChild(pregnancyId) {
  const pregnancy = getPregnancy(pregnancyId);
  if (!pregnancy) return { error: 'pregnancy_not_found' };
  if (pregnancy.child_character_id != null) return { error: 'already_materialized' };

  const playthrough = getPlaythrough(pregnancy.playthrough_id);
  const world = getWorld(playthrough.world_id);
  const growth = childGrowthStateFor(pregnancy, playthrough, world);
  if (!growth) return { error: 'not_applicable' };
  if (!growth.ready) return { error: 'not_ready', daysRemaining: growth.daysRemaining };

  const mother = getCharacter(pregnancy.character_id);
  if (!mother) return { error: 'mother_not_found' };

  const age = childAppearanceAge(world, mother.age_real);
  const inherited = Object.fromEntries(INHERITED_FIELDS.map((f) => [f, mother[f] ?? '']));

  const child = createCharacter({
    ...inherited,
    // 明示された名前が最優先。空欄なら母の姓 + World の様式から抽選した名。
    // 姓が取れない母(full_name が空/区切り無し)の子は名だけになる。
    name: pregnancy.child_name?.trim() || generateChildName(mother, world),
    gender: CHILD_GENDER,
    age_real: String(age),
    age_apparent: String(age),
    // どこに居る子なのかは世界観ごとに違うので World 設定から組み立てる。
    // 3系統すべて空なら、どの部屋にも自動では出てこない。
    attribute_tags: buildChildAttributeTags(world, mother),
    call_user_as: callUserAsFor(playthrough),
    notes: `${mother.name}と${pregnancy.partner}の子。`,
    origin_playthrough_id: pregnancy.playthrough_id,
    is_auto_created: true,
    relationship_defaults: relationshipDefaultRows(),
    impression_defaults: [
      { field_key: 'あなたとの関係', default_value: `${pregnancy.partner}の実の子` },
      { field_key: 'あなたの印象', default_value: '大好きな親' },
    ],
  });

  // World にも明示的に紐づけておく。属性キーが空でも一覧やスロット割当の
  // 候補として World の下に出てきてほしいため。
  attachCharacterToWorld(world.id, child.id);
  setChildCharacter(pregnancy.id, child.id);

  return { child: getCharacter(child.id), mother_name: mother.name };
}

// materializeChild が確実に決めた項目(継承した見た目・World設定由来の属性キー・
// 呼び方・親子関係の備考)は、LLMの推測で上書きされないよう常に子の現在値で
// 再上書きする。
const PRESERVED_ON_DETAIL_GENERATION = [
  'name',
  'gender',
  'age_real',
  'age_apparent',
  'race',
  'attribute',
  'eye_description',
  'hair_description',
  'attribute_tags',
  'call_user_as',
  'notes',
];

// materializeChild とは独立した、明示的に呼び出す操作(不具合報告2026-08-06
// 項目4)。koboldcppが止まっていれば失敗するのはこちら側だけで、キャラ行自体は
// 既に確実に存在する(materializeChild 自身の設計方針と同じ)。母の性格・口調を
// 参考文脈として渡し、「そのままコピーせず変化させる」よう明示することで
// 要望の両方(空欄埋め／引き継ぎ表現の変化)を満たす。
export async function generateChildDetails(childId) {
  const child = getCharacter(childId);
  if (!child) return { error: 'character_not_found' };

  const pregnancy = getPregnancyByChildCharacterId(childId);
  const mother = pregnancy ? getCharacter(pregnancy.character_id) : null;

  const motherContext = mother
    ? `母親「${mother.name}」の性格『${mother.personality || '不明'}』、口調『${mother.speech_style || '不明'}』、一人称『${mother.first_person || '不明'}』を参考にしつつ、血のつながりを感じさせる部分を残しながらも、母の言い回しをそのまま流用せず、年齢相応かつこの子自身の個性が出るよう微妙に変化させてください。`
    : '';
  const instruction = `${child.age_apparent || child.age_real}歳の${child.gender || '女の子'}「${child.name}」。${motherContext}性格・口調・容姿・技能など残りの設定を考えてください。`;

  const sheet = await generateCharacterSheet(instruction);

  const merged = {
    ...child,
    ...sheet.fields,
    ...Object.fromEntries(PRESERVED_ON_DETAIL_GENERATION.map((f) => [f, child[f]])),
  };
  return { child: updateCharacter(childId, merged), suggestedTags: sheet.suggestedTags };
}
