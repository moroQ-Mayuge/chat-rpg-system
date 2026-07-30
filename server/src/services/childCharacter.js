import { db } from '../db/connection.js';
import { createCharacter, getCharacter } from '../db/repositories/charactersRepo.js';
import { attachCharacterToWorld } from '../db/repositories/worldCharactersRepo.js';
import { getPregnancy, setChildCharacter } from '../db/repositories/characterPregnanciesRepo.js';
import { getPlaythrough } from '../db/repositories/playthroughsRepo.js';
import { getWorld } from '../db/repositories/worldsRepo.js';
import { childGrowthStateFor, childAppearanceAge } from './pregnancy.js';

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
    name: pregnancy.child_name?.trim() || `${mother.name}の子`,
    gender: pregnancy.child_gender || '',
    age_real: String(age),
    age_apparent: String(age),
    // どこに居る子なのかは世界観ごとに違うので World 設定から取る。空なら
    // どの部屋にも自動では出てこない。
    attribute_tags: world.child_attribute_tags ?? '',
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
