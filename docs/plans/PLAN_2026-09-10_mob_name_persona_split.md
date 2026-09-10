# モブのランダムペルソナ：名前とペルソナの分離（0127/0128フォローアップ）

# 背景（Context）

0127/0128で「モブのランダムペルソナ」を実装した際、`mob_flavor_presets`は「1プリセット＝名前＋性格＋口調の一式」として設計した（プラン検討時、名前プールとペルソナプールを分ける案より「1プリセット=1ペルソナ一式」を推奨・採用）。実際に20件のプリセットを作成した後、ユーザーから「名前とペルソナを紐付けないよう個別にしてください。ランダム名前も別でプールできるようにしてください」との要望があり、当初の方針を変更する。

# 実装

## 1. スキーマ分離（migration 0129）
- 新規`mob_name_presets`テーブル（world_id, name, is_generated）を追加し、既存`mob_flavor_presets.name`の内容をid維持のまま複製。
- `mob_flavor_presets`から`name`列を`ALTER TABLE ... DROP COLUMN`で除去（`room_session_characters.mob_flavor_preset_id`がこのテーブルを参照するFK制約があるため、テーブル再作成ではなくDROP COLUMNを使用——better-sqlite3同梱のSQLite 3.49は対応済み）。
- `room_session_characters`に`mob_flavor_name_id`（`mob_name_presets`参照）を追加。既存の`mob_flavor_preset_id`が設定済みの行は、id維持複製のおかげでそのまま`mob_flavor_name_id`にも複製できる。

## 2. リポジトリ層
- `mobFlavorPresetsRepo.js`：`name`関連の処理をすべて削除、純粋な性格・口調プールに。
- 新規`mobNamePresetsRepo.js`：`mobFlavorPresetsRepo.js`と同型のCRUD＋`pickRandomMobNamePreset`。

## 3. 抽選・生成ロジック
- `roomSessionsRepo.js`の`seedParticipantsForRoom`/`addParticipant`：presetモードで`pickRandomMobFlavorPreset`と`pickRandomMobNamePreset`を独立に呼び、`mob_flavor_preset_id`と`mob_flavor_name_id`をそれぞれ個別にINSERT/UPDATEする（片方だけ抽選できても構わない）。`attachParticipants`は`mob_name_presets`をLEFT JOINし、`mob_flavor_name`は名前プールから、性格・口調系フィールドはペルソナプールから独立に取得する。
- `setParticipantMobFlavorPresetIfUnset`を`setParticipantMobFlavorIfUnset(id, {presetId, nameId})`に拡張し、それぞれ個別に「まだNULLなら書く」。
- `repointParticipantCharacter`（お気に入り昇格時）は両方のidをクリアする。
- `mobPersonaGeneration.js`（LLM生成モード）：LLMは名前と性格・口調を一貫性を持たせて1回で生成するが、保存はそれぞれ独立した行として`mob_name_presets`/`mob_flavor_presets`に分けて入れる（紐付けない方針、将来の抽選では別の組み合わせで再利用され得る）。
- `mobPromotion.js`：`promoteMobToFavorite`はペルソナ(`preset`)と名前(`namePreset`)をそれぞれ独立に取得し、どちらか一方だけ未割当でももう片方はそのまま使う。両方未割当の場合のみ`allowWithoutPreset`が必要。

## 4. 管理画面
`MobFlavorPresetsPage.jsx`を「名前プール」（名前のみ、チップ形式）と「ペルソナプール（性格・口調）」（既存のフォーム、name欄を除去）の2つの独立セクションに分割。それぞれ別のAPI（`/api/mob-name-presets`新設、`/api/mob-flavor-presets`はname無しに変更）・別のCRUDフックを使う。

# 検証

1. migration適用後、既存23件（サキ・田中結衣・田中花子のLLM生成分＋今回作成した20件）が`mob_name_presets`/`mob_flavor_presets`の両方に正しく複製され、データ欠損が無いことを確認。
2. `pickRandomMobFlavorPreset`/`pickRandomMobNamePreset`を直接複数回呼び、名前とペルソナが独立にランダムに組み合わさる（元の対応関係にならない）ことを確認。
3. 隔離済みの使い捨てplaythroughで`createRoomSession`を実行し、`seedParticipantsForRoom`が実際に名前とペルソナを独立に抽選してモブへ付与すること、`display_name`が正しく組み合わさった名前になることを確認。
4. 管理画面で名前プール・ペルソナプールがそれぞれ独立に表示・追加・編集・削除できることをブラウザで確認。
5. テスト用に追加した名前プリセット・使い捨てplaythrough・一時的なWorld設定変更はすべて元に戻した。
