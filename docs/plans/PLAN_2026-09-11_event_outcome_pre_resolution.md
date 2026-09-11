# 同行同意イベントの処理順変更（イベント成否とLLM発言の食い違い解消）

# 背景（Context）

「同行を頼む」イベント（id 376、`keyword`(同行して)トリガー＋`relationship_probability`のoutcome判定）は、2026-09-07出荷時点から既知の制限として`accompany_command_and_probability.md`に記録済みだった：`roomSessions.js`の`generateReply`は`generateChatCompletion`（LLM応答生成）を`runEventEngine`（イベント判定・確率ロール）より先に呼ぶため、LLMはまだ確率判定の成否を知らないまま台詞を書き、キャラの台詞と実際の判定結果が食い違うことがあった。2026-09-11、ユーザーからこの食い違いを解消するよう処理順の変更を依頼された（あわせてイベント処理全般の調査も依頼）。

調査の結果、`eventEngine/index.js`冒頭のコメントで、この設計自体がSPEC.md 3.6.1の元の段階評価仕様からの「意図的な簡略化」だったことが判明した——ただしSPEC.mdの元仕様でも確率系条件はLLM生成後に評価する想定だったため、今回の食い違いはSPEC.mdの復元ではなく新規の改善にあたる。対象イベント(376)は生成テキストに一切依存せず生成前の状態だけで完全に判定可能であることを確認し、`promptBuilder.js`の既存の妊娠/周期ヒント注入パターンを踏襲する設計を採用した。

# 実装

## 1. 事前解決パス（新規、読み取り専用）
`server/src/services/eventEngine/preResolution.js`の`resolvePregenerationEventOutcomes(...)`が、`generateReply`内`buildMultiCharacterMessages`（LLM呼び出しより前）の直前に呼ばれる。対象は「LLM生成テキストに一切依存しないと構造的に断定できる」イベント定義のみ（`server/src/services/eventEngine/preResolutionEligibility.js`の`isPreResolvable`）：
- 除外：`llm_judge`、`target`が`user_message`以外の`keyword`、`has_pose`/`has_item`/`has_money`（LLM応答ストリーミング中の`[POSE]`/ショップ`[ITEM_GRANT]`/`[CRAFT_RESULT]`タグがこれらの状態を書き換えるため、事前解決パスと事後パスの間でズレうる——調査で発見）。
- それ以外（`probability`/`turn_count`/`relationship_threshold`/`flag_state`/`participant_count`/`has_status`/`has_outfit`/`relationship_probability`）は安全。

`eventEngine/index.js`の既存の適格性判定ループを`computeEligibleEntries(...)`として関数抽出（挙動そのままの純粋なリファクタ）し、事前解決パスと`runEventEngine`本体の両方から呼ぶことで、cooldown/max_fires/prerequisite/条件評価/`per_character_firing`のロジックを重複させていない。`resolveOutcomeLevel`に`dryRun`引数を追加し(`dryRunOutcome`としてエクスポート)、事前解決パスはアクションを一切実行しない。

## 2. 二重発火・二重ロール防止
条件id単位の結果キャッシュ`evaluateConditionCached`を追加。事前解決パスが評価した条件結果(確率ロール含む)を`conditionCache`に記録し、`generateReply`が同じ`Map`インスタンスを後段の`runEventEngine`呼び出しへ`resolvedConditionCache`として渡す——同じ条件は再評価されず、事前にヒントとして見せた結果がそのまま発火する。事前解決の対象外だった105件の他イベントはキャッシュに何も無いため、今までどおりそのままライブ評価される。

## 3. ヒント文言の注入
既存の`outcome_root_label`等はUI表示専用でイベントエンジンから未参照だったため、新規カラム`outcome_success_hint_text`/`outcome_failure_hint_text`（migration 0131）を追加。事前解決で確定した成否に応じてこの文言を取り出し、対象キャラの解決（`relationship_probability`用に新設した`matchingCharactersForRelationshipProbability`マッチャー→`per_character_firing`候補→@メンション1人のみのフォールバック、の順）を経て、`promptBuilder.js`の`buildSystemPrompt`が妊娠/周期ヒントと同じ「現在の状態：〜」形式でキャラカードに焼き込む。`EventsPage.jsx`のoutcome分岐エディタに成功/失敗ヒント文言の入力欄を追加。イベント376に文言を設定：
- 成功時：「相手からの同行の誘いを受け入れることに決めている」
- 失敗時：「相手からの同行の誘いを断ることに決めている」

## 調査で見つかったその他の懸念（今回は対応しない、記録のみ）
- `exclusive_group`との相互作用——事前解決可能イベントと不可能イベントが同じグループにあり同ターン両方適格になった場合、事後の排他制御で事前解決側が実際には発火しないことがありうる（ヒントだけ見せて不発）。LLM生成前には原理的に解決不能なズレのため許容（376自体は`exclusive_group`未設定で無関係）。
- ヒントMapは`character_id`単位（モブ重複インスタンス単位ではない）——既存の妊娠/周期ヒントと同じ粒度で、新規の制限ではない。

# 検証

1. migration適用後、`event_definitions`に新カラムが追加され既存行に影響が無いことを確認。
2. イベント376に成功/失敗ヒント文言を設定。
3. 隔離済み使い捨てplaythroughで対象キャラの関係値軸2/3/5を最大にし、事前解決パス単体を直接呼び出して`hintsByCharacterId`に成功ヒントが入ること、`buildMultiCharacterMessages`が組み立てるシステムプロンプトに実際にヒントが注入されることを確認。
4. 同じ`conditionCache`を`runEventEngine`へ渡し、発火が`outcome:'success'`・`is_accompanying=1`・`event_fire_history`行数1（二重発火なし）であることを確認。軸を0にした失敗パターンも同様に確認。
5. 50%相当の中間値で事前解決を1回だけ行い、同じキャッシュを使って`dryRunOutcome`を20回呼び出し、全て同一結果になること（キャッシュ無しの生評価20回は自然にばらつくこと）を確認——再ロールが起きていないことの直接証拠。
6. `resolvedConditionCache`を渡さない従来どおりの呼び出し（`modelEval/runner.js`等）でも376が正しく発火することを確認（後方互換）。
7. `llm_judge`を含む他イベント（359/363/374/375等）が事前解決の対象外のまま、後段で従来どおりkoboldcpp接続を試みる（未接続でエラーになるが、これはテスト環境の制約であり事前解決の対象外である証拠でもある）ことを確認。
8. ブラウザでEventsPageのヒント文言欄の表示・保存往復を確認（一時的なテスト用マーカー文字列は保存後に削除・復元済み）。
9. テスト用playthroughは全て削除。
