# 脱衣コマンド実行時・衣装更新時の自動画像生成

# 背景（Context）

現在、画像生成が自動で走るのは①LLMの`[SCENE_CHANGE]`タグ②イベントの`generate_image`アクション（現状は告白/キス系4イベントのみに手動で仕込まれている）の2経路のみ。脱衣コマンド（上着/中衣/下着×上半身/下半身×開ける/たくし上げる/ずり下げる/横にずらす/破る/脱がすの36イベント、いずれも`change_status`のみ）や、衣装の着替え（`change_outfit`イベントアクション、`/wear-item`・`/wear-outfit`ルート）には画像生成の仕組みが一切無い。

ユーザーの要望：これらの実行時にも自動で画像生成が走るようにしたい。36個のプリセットイベント全部に手動で`generate_image`アクションを仕込む（コンテンツ追記）方式だと、今後追加される脱衣コマンドや、そもそもイベントを経由しない`/wear-item`・`/wear-outfit`（着替え）をカバーできないため、**コード側のフック**として実装する。

ユーザーとの相談で決まった方針：
- 脱衣用・着替え用は別々のWorldトグルでON/OFF（脱衣は連発されやすい一方、着替えは頻度が低いため）。
- 脱衣コマンドは1場面で連続して打たれ得るため、**クールダウン**（直近の自動生成からNターン未満なら生成をスキップ）を設ける。
- 生成に使う画像設定は新規kindを増やさず、既存の**「イベント画像」(`image_kind='event'`)**を流用する（`character_tags`プレースホルダも既にあり、告白/キスイベントと同じ設定を共有）。

# 設計のポイント

- **`change_status`（脱衣）と`change_outfit`/`/wear-item`/`/wear-outfit`（着替え）は完全に別のコードパス**（脱衣は`character_statuses`への状態付与のみで`current_outfit_id`は一切変わらない）。1つのフックでは両方カバーできないため、2種類のフックを用意する。
- 画像生成の実処理は新規作成せず、既存の`executeGenerateImage`（`server/src/services/eventEngine/actions/generateImage.js`）をそのまま呼ぶ。`target_character_ids: [characterId]`を渡せば、そのキャラ1人分の現在の衣装＋脱衣状態（`resolveParticipantImageTags`経由で`disturbs_outfit_field`/`suppresses_outfit_fields`が正しく反映される）だけの画像になる。新しい生成ロジックは不要。
- `runEventEngine`の戻り値`fired[].actionResults`は`{actionType, result}`のみで、`change_status`の`result.changes[]`には現状`status_id`が含まれない（`grantStatus`の戻り値は`{id, granted}`のみ）。**`changeStatus.js`の`changes.map`に`status_id`と`operation`を追加する**小さな変更が必要（既存の消費者は無いので安全な追加）。これで「今回付与/解除されたのがどのstatusか」をフック側で判定できる。
- 「脱衣コマンドかどうか」の判定は特定のイベントIDに依存させず、**対象statusが`disturbs_outfit_field`または`suppresses_outfit_fields`を持つか**で汎用的に判定する（42個の脱衣系ステータス全部と、将来追加されるものにも自動対応）。
- クールダウンは`room_session_characters`に1列追加してキャラ単位でチェックポイントを持つ（`relationship_update_last_turn`と同じ発想だが、脱衣状態がキャラ単位なので参加者テーブル側に置く）。脱衣・着替え両トリガーで共有し、`countUserTurnsForSession`（0122で追加済み）でターン数を数える。

# 実装

## 1. マイグレーション（新規 `0125_auto_outfit_image_generation.sql`）

```sql
-- 脱衣コマンド実行時の自動画像生成ON/OFF(既定OFF)。
ALTER TABLE worlds ADD COLUMN undress_image_generation_enabled INTEGER NOT NULL DEFAULT 0;
-- 衣装の着替え(change_outfit/wear-item/wear-outfit)時の自動画像生成ON/OFF(既定OFF)。
ALTER TABLE worlds ADD COLUMN outfit_change_image_generation_enabled INTEGER NOT NULL DEFAULT 0;
-- 上記2つが共有する、キャラ単位のクールダウン(ターン数)。0で無制限(毎回生成)。
ALTER TABLE worlds ADD COLUMN auto_outfit_image_cooldown_turns INTEGER NOT NULL DEFAULT 2;
-- 直近の自動生成時のユーザーターン数(countUserTurnsForSession基準)。キャラ単位。
ALTER TABLE room_session_characters ADD COLUMN auto_outfit_image_last_turn INTEGER NOT NULL DEFAULT 0;
```

## 2. `server/src/services/eventEngine/actions/changeStatus.js`
`changes`の各要素に`status_id`と`operation`を追加するだけ：
```js
const changes = targets.map(({ character_id: id, instance_id }) => {
  const statusCtx = { ... };
  if (operation === 'grant') return { character_id: id, status_id, operation, ...grantStatus(id, status_id, statusCtx, locked ?? false) };
  if (operation === 'remove') return { character_id: id, status_id, operation, ...removeStatus(id, status_id, statusCtx) };
  if (operation === 'lock') return { character_id: id, status_id, operation, ...setStatusLocked(id, status_id, statusCtx, true) };
  if (operation === 'unlock') return { character_id: id, status_id, operation, ...setStatusLocked(id, status_id, statusCtx, false) };
  return { character_id: id, status_id, operation, skipped: true };
});
```

## 3. `server/src/db/repositories/roomSessionsRepo.js`
- `attachParticipants`のSELECTに`rsc.auto_outfit_image_last_turn`を追加。
- 新規 `setAutoOutfitImageCheckpoint(roomSessionCharacterId, turnNumber)`（`UPDATE room_session_characters SET auto_outfit_image_last_turn = ? WHERE id = ?`、既存の`setRelationshipUpdateCheckpoint`と同じ形）。

## 4. 新規 `server/src/services/autoOutfitImage.js`
`roomSessions.js`がこれ以上肥大化しないよう、新規ファイルに切り出す。

```js
import { getStatus } from '../db/repositories/characterStatusesRepo.js';
import { setAutoOutfitImageCheckpoint } from '../db/repositories/roomSessionsRepo.js';
import { countUserTurnsForSession } from '../db/repositories/messagesRepo.js';
import { executeGenerateImage } from './eventEngine/actions/generateImage.js';

// クールダウン判定＋チェックポイント更新＋画像生成。session/worldは呼び出し元で
// 取得済みのものをそのまま渡す(この関数自身はDB読み直しをしない)。
async function maybeGenerateForCharacter(session, world, characterId) {
  const participant = session.participants.find((p) => p.character_id === characterId);
  if (!participant) return; // 退室済み等
  const turnNumber = countUserTurnsForSession(session.id);
  const elapsed = turnNumber - participant.auto_outfit_image_last_turn;
  if (world.auto_outfit_image_cooldown_turns > 0 && elapsed < world.auto_outfit_image_cooldown_turns) return;

  setAutoOutfitImageCheckpoint(participant.id, turnNumber); // 生成前に進める(多重発火防止)
  try {
    await executeGenerateImage(
      { image_type: 'event', target_character_ids: [characterId] },
      { sessionId: session.id, playthroughId: session.playthrough_id, session },
    );
  } catch (err) {
    console.error('auto outfit image generation failed:', err);
  }
}

// 脱衣ラダーのstatus(disturbs_outfit_field/suppresses_outfit_fieldsを持つもの)が
// grant/removeされた時だけ画像生成する——照れ/発情等の無関係なstatusでは発火しない。
export async function maybeGenerateImageOnUndress(session, world, fired) {
  if (!world.undress_image_generation_enabled) return;
  const characterIds = new Set();
  for (const event of fired) {
    for (const ar of event.actionResults) {
      if (ar.actionType !== 'change_status') continue;
      for (const change of ar.result?.changes ?? []) {
        if (change.skipped || (change.operation !== 'grant' && change.operation !== 'remove')) continue;
        const status = getStatus(change.status_id);
        if (!status?.disturbs_outfit_field && !status?.suppresses_outfit_fields) continue;
        characterIds.add(change.character_id);
      }
    }
  }
  for (const characterId of characterIds) await maybeGenerateForCharacter(session, world, characterId);
}

// change_outfitイベントアクション経由の着替え。
export async function maybeGenerateImageOnOutfitChangeEvent(session, world, fired) {
  if (!world.outfit_change_image_generation_enabled) return;
  const characterIds = new Set();
  for (const event of fired) {
    for (const ar of event.actionResults) {
      if (ar.actionType !== 'change_outfit' || ar.result?.skipped) continue;
      characterIds.add(ar.result.character_id);
    }
  }
  for (const characterId of characterIds) await maybeGenerateForCharacter(session, world, characterId);
}

// /wear-item・/wear-outfitルート(イベント経由ではない着替え)から直接呼ぶ。
export async function maybeGenerateImageOnDirectWear(session, world, characterId) {
  if (!world.outfit_change_image_generation_enabled) return;
  await maybeGenerateForCharacter(session, world, characterId);
}
```

## 5. `server/src/routes/roomSessions.js`
- `generateReply`内、`runEventEngine`の結果`fired`を使っている箇所（`broadcastRelationshipChanges`の直後）に追加：
  ```js
  try {
    await maybeGenerateImageOnUndress(session, world, fired);
    await maybeGenerateImageOnOutfitChangeEvent(session, world, fired);
  } catch (err) {
    console.error('Auto outfit image trigger failed:', err);
  }
  ```
- `/:id/wear-item`・`/:id/wear-outfit`ルート：`updateParticipantOutfit`＋`broadcast('participants_changed')`の後に、`getWorld`済みのworldを使って`await maybeGenerateImageOnDirectWear(getRoomSession(req.params.id), world, character_id)`を呼ぶ（現状これらのルートはWorldを取得していないので、`getWorld(getPlaythrough(session.playthrough_id).world_id)`を追加する）。ここは同期レスポンスの外（`res.json`の後）で発火させ、画像生成の待ち時間でAPI応答自体を遅らせない。

## 6. `client/src/pages/WorldsPage.jsx`
新セクション「自動画像生成（脱衣・着替え時）」（`scene_change_enabled`セクションと同じ形）：
- チェックボックス：脱衣コマンド実行時に自動生成する（`undress_image_generation_enabled`）
- チェックボックス：衣装を着替えた時に自動生成する（`outfit_change_image_generation_enabled`）
- 数値入力：生成の最小間隔（ターン数、0で毎回）（`auto_outfit_image_cooldown_turns`）
- 説明文：生成内容は「設定」画面の画像生成設定「イベント画像」を共有すること、画像生成には数秒〜数十秒かかり、同時に複数走ると順番待ちになることを明記。

`worldsRepo.js`の`createWorld`/`updateWorld`/`parseWorld`に3フィールドを追加（このセッションで既に3回やった定型パターン：destructure→列リスト→VALUES→bind、booleanは`parseWorld`にも追加）。

# 検証

1. マイグレーション適用後、`PRAGMA table_info`で新4列を確認。
2. `changeStatus.js`の戻り値に`status_id`/`operation`が乗ることを直接呼び出しで確認。
3. World4で両トグルON・クールダウン=1に設定し、koboldcpp+SD起動状態で：
   - 脱衣コマンド（例:「上着を脱がす（上半身）」）をチャット経由で送信→画像メッセージが自動生成されることを確認。
   - 直後にもう一度別の脱衣コマンドを送信→クールダウン中はスキップされる（`auto_outfit_image_last_turn`が進まない）ことを確認。
   - ターンを1つ挟んでから送信→今度は生成されることを確認。
   - 発情/照れ等、脱衣と無関係な`change_status`では発火しないことを確認。
4. `/wear-item`・`/wear-outfit`を直接叩き、着替えトグルON時のみ画像が生成されることを確認。
5. 既存の告白/キスイベント（自前で`generate_image`を持つ）が今回の変更で二重生成しないことを確認（`change_status`を使っていないので影響を受けないはずだが念のため）。
6. ブラウザでWorldsPageの新設定セクションの表示・保存往復を確認。
7. 検証後、World4の一時設定・生成された画像/メッセージは他のセッション同様の慣例で片付ける。
