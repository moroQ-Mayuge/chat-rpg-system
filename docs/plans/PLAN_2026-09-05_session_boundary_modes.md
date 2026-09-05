# 継続セッションの「区切り方」設定（0121の拡張）

> 実装は別セッション(Sonnet)で行う前提。着手時はまずこのファイルを `docs/plans/PLAN_2026-09-05_session_boundary_modes.md` にコピーしてから進める（リポジトリの慣例）。

# 背景（Context）

0121で入れた継続セッション（`worlds.continuous_room_session_enabled`）は、切れ目が「時間帯の変化で即時」の一本しかない。実プレイで2つの弱点がある：①`turns_per_time_slot`やイベントで時間帯が進むと**会話の真っ最中でも場面が切れる**、②時間帯が粗いWorldでは1場面が延々と続く。

ユーザーとの相談で決まった方針：

- **基本モードを選べるようにする**：時間帯の変化／1日の終わり／**切らない**。時間帯・日のモードには「会話の途中では切らず、次の移動時に切る」オプションを付ける。
- **「切らない」モード**では場面は永久に続くが、**ログの単位と、キャラの記憶・印象の更新タイミングは「1日の終わり」**にする。具体的には日が変わった時点で、記憶抽出・印象更新・関係値の追いつき更新を実行し、会話のあらすじを強制的に畳み直し、ログに日替わりの区切り行を入れる。**チャット画面は当日分のメッセージだけを表示**し（前日分は履歴から閲覧）、**履歴一覧は「N日目」単位**で並べる。記憶・印象の更新は「切らない」モードでも**部屋移動時に引き続き実行**する（ユーザー決定）。
- **追加トリガー**（モードを問わず重ねられる）：接続の「場面の切れ目」フラグ／部屋の「入ると切れる」フラグ／イベントアクション`end_session`／最大ターン数（超えたら次の移動時に切る）。
- 「切らない」モードでは、セッションスコープのもの（`event_definitions.reset_scope='session'`、`character_statuses.persistence_scope='session'`、拾得済みフラグ）は永続化する。追加の設定は作らない（受け入れる意味の変化）。

## 調査で判明した、この計画で直すべき既存バグ

1. **クライアントに`forced_room_transfer`のハンドラが無い**。[useChatStream.js](client/src/hooks/useChatStream.js):37-60 のws受信は`generation_start/scene_change_detected/relationship_changed/generation_refused/generation_done/message_complete/error`だけ。0121の`sessionBoundary.js`は「クライアント側の追加実装が要らない」と書いているが誤りで、サーバー側でセッションを取り直しても**クライアントは終了済みセッションに留まり続ける**。本計画で必ず直す。
2. **イベントエンジンはセッションロックの外で走る**。[roomSessions.js](server/src/routes/roomSessions.js)の`runEventEngine`（~1020）は`withSessionLock`（~1049〜）より前。`end_session`（と既存の`force_room_transfer`）はアクション側で自分でロックを取る必要がある（呼び出し元はロック未保持なので再入の心配は無い。ロック後の事後フックはセッションを読み直して`status!=='active'`で抜ける）。
3. `transform_character`が`event_actions.action_type`のCHECKに入っていない既知バグ（registry・クライアントには存在）。CHECKを作り直すついでに入れる。

## 設計上の要点

- **`messages.game_day`は暦（`playthrough.current_day`）ではなく`room_sessions.log_day`から写す**。`turns_per_time_slot`は`createMessage`でユーザー行を入れた直後に時間を進めるため、暦で付けると「ユーザー発言は前日、返答は翌日」になり当日表示が崩れる。`log_day`は`handleDayRollover`が区切り行を入れる直前にだけ進める。これで「日＝区切り行で挟まれたブロック」になり、あらすじの畳み込み範囲・当日表示・履歴の日分割が全部一致する。`log_day`は「日替わりを処理済みか」のマーカーも兼ねる（`entered_day`は`switchRoomWithinSession`が意図的に触らないので流用できない）。
- チャット画面の`?day=current`は**無条件で付けてよい**：日替わりが起きないWorldでは`log_day=entered_day`のまま全メッセージがその値を持つので、フィルタは実質no-op。
- 二重実行の抑止：`runEndOfSceneHooks`は`session.memory_impression_last_turn >= countUserTurnsForPlaythrough()`なら記憶・印象をスキップする（同ターン内で間隔実行や`/move`の事前フックが既に走っていれば飛ばす）。関係値は`maybeRunRelationshipAutoUpdate`自身の`elapsed<=0`ガードで足りる。
- `time_slot`/`day`モードでは「日替わりの処理」＝切ること自体（新セッションの`log_day`は`current_day`）。`handleDayRollover`が走るのは切らなかった時だけ＝`never`モード、または遅延中。遅延中も即座に切らない代わりに`never`と同じ日替わり処理をその場で行い（作業内容は同じ）、後で`/move`が切る時はチェックポイントが新しいので抽出は飛ぶ。
- 区切り行は`sender_type='narration'`にする。`system`は[promptBuilder.js](server/src/services/promptBuilder.js)の`buildHistoryMessages`（567-574）で捨てられ、[ChatPage.jsx](client/src/pages/ChatPage.jsx)にも描画分岐が無いため。narrationならLLMも両UIも既存分岐で扱える。
- `never`モードでもLLM履歴は従来どおり予算いっぱいまで（400行上限）。長期の継続性は会話あらすじが担うので、WorldsPageの説明文で「切らないモードではあらすじ間隔の設定を推奨」と案内する。

# 実装手順

## 1. マイグレーション `server/src/db/migrations/0122_session_boundary_modes.sql`

```sql
-- 継続セッション(0121)の区切り方。
ALTER TABLE worlds ADD COLUMN session_boundary_mode TEXT NOT NULL DEFAULT 'time_slot'
  CHECK (session_boundary_mode IN ('time_slot', 'day', 'never'));
-- 時間帯/日モードで「会話の途中では切らず、次の移動時に切る」。
ALTER TABLE worlds ADD COLUMN session_boundary_defer_to_move INTEGER NOT NULL DEFAULT 0;
-- 1場面の最大ユーザーターン数(NULL=無制限)。超えたら次の移動時に切る(会話の途中では切らない)。
ALTER TABLE worlds ADD COLUMN session_max_turns INTEGER;
-- 追加トリガー(モードを問わず)。
ALTER TABLE room_connections ADD COLUMN ends_session INTEGER NOT NULL DEFAULT 0;
ALTER TABLE room_templates ADD COLUMN ends_session_on_enter INTEGER NOT NULL DEFAULT 0;
-- セッションが今どの「ログ日」に居るか。日替わりの区切り行を入れた時だけ進む。
ALTER TABLE room_sessions ADD COLUMN log_day INTEGER;
UPDATE room_sessions SET log_day = entered_day;
-- 保留中の区切り(''=なし / 'time_slot' / 'day' / 'max_turns')。次の移動・退出で消費。
ALTER TABLE room_sessions ADD COLUMN boundary_pending TEXT NOT NULL DEFAULT '';
-- メッセージが属するログ日(書き込み時に room_sessions.log_day を写す)。
ALTER TABLE messages ADD COLUMN game_day INTEGER;
UPDATE messages SET game_day = (SELECT rs.entered_day FROM room_sessions rs WHERE rs.id = messages.room_session_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_day ON messages(room_session_id, game_day);
-- event_actions の CHECK 拡張。SQLiteはCHECKをALTERできないので0100と同じくテーブルを作り直す。
-- transform_character が登録済みなのにCHECKから漏れていた既知バグの修正も兼ねる。
CREATE TABLE event_actions_new ( ...0100_set_pose_action.sql と同一の列定義。CHECKに 'transform_character', 'end_session' を追加... );
INSERT INTO event_actions_new (id, event_definition_id, action_type, params, outcome, outcome_node_id)
  SELECT id, event_definition_id, action_type, params, outcome, outcome_node_id FROM event_actions;
DROP TABLE event_actions;
ALTER TABLE event_actions_new RENAME TO event_actions;
```
書く前に dev DB で `PRAGMA table_info(event_actions)` を取り、列が6つ（id, event_definition_id, action_type, params, outcome, outcome_node_id）であることを確認してからINSERT列を書く。0100以降に`event_actions`を触った移行は無く、`event_actions`を参照するFKも無い（調査済み）。

## 2. リポジトリ

- [roomSessionsRepo.js](server/src/db/repositories/roomSessionsRepo.js)
  - `createRoomSession`（281-313）：INSERTに`log_day = playthrough.current_day`を追加。
  - `switchRoomWithinSession`（405-445）：`log_day`/`boundary_pending`は触らない（コメントに追記）。
  - 新規 `setBoundaryPending(id, reason)`、`setLogDay(id, day)`（`setMemoryImpressionCheckpoint`と同じ形）。
  - `listSessionsForPlaythrough`（233-245）を (セッション, 日) 単位に：
    ```sql
    SELECT rs.id, rs.room_template_id, rt.name AS room_name, rs.status, rs.entered_day,
           rs.entered_time_slot_index, rs.log_day, rs.started_at, rs.updated_at,
           m.game_day, COUNT(m.id) AS message_count
    FROM room_sessions rs JOIN room_templates rt ON rt.id = rs.room_template_id
    LEFT JOIN messages m ON m.room_session_id = rs.id
    WHERE rs.playthrough_id = ? GROUP BY rs.id, m.game_day
    ORDER BY rs.started_at DESC, m.game_day DESC
    ```
    （メッセージ0件のセッションは`game_day NULL`の1行。クライアントは`entered_day`にフォールバック）
- [messagesRepo.js](server/src/db/repositories/messagesRepo.js)
  - `listMessagesForSession(sessionId, { day } = {})`：`day != null`なら`AND game_day = ?`。
  - `createMessage`：`SELECT playthrough_id, log_day, entered_day FROM room_sessions`を1回引き、`game_day = log_day ?? entered_day`をINSERT。
  - `countUserTurnsForSession(sessionId)`をexport（`maybeAutoAdvanceTime`内のクエリをそのまま関数化）。
  - 新規 `listLogDaysForSession(sessionId)`：`SELECT DISTINCT game_day ... ORDER BY game_day`。
- [roomConnectionsRepo.js](server/src/db/repositories/roomConnectionsRepo.js)：`createConnection`/`updateConnection`に`ends_session`（`? 1 : 0`、3箇所ずつ）。`listConnectionsFrom`は`rc.*`なので変更不要。
- [roomTemplatesRepo.js](server/src/db/repositories/roomTemplatesRepo.js)：`createRoomTemplate`（63-95）/`updateRoomTemplate`（103-138）に`ends_session_on_enter`を`is_place`の隣に。
- [worldsRepo.js](server/src/db/repositories/worldsRepo.js)：`createWorld`（destructure ~134、列 ~146、VALUES ~147、run ~213）/`updateWorld`（destructure ~286、SET 303、run ~369）に`session_boundary_mode`（既定`'time_slot'`）、`session_boundary_defer_to_move`（bool）、`session_max_turns`（nullable）。`parseWorld`相当で`Boolean()`化。
- `playthroughsRepo.js`：変更なし（`advanceTime`が唯一の暦の書き手のまま）。

## 3. サービス

### [conversationSummary.js](server/src/services/conversationSummary.js)
`maybeUpdateConversationSummary(session, world, { force = false } = {})`：`interval == null`の無効スイッチは維持し、`force`時は`userTurns < interval`のゲートだけ飛ばす（明示的に無効なら無効のまま。pendingが空なら何もしない）。

### [sessionBoundary.js](server/src/services/sessionBoundary.js)（拡張。`hasCrossedTimeSlotBoundary`は維持）

```js
// /exit・closeAndReopen・handleDayRollover が共有する場面終了時フック
export async function runEndOfSceneHooks(session, world) {
  const turnNumber = countUserTurnsForPlaythrough(session.playthrough_id);
  await maybeRunRelationshipAutoUpdate(session, world, { force: true });
  if (session.memory_impression_last_turn < turnNumber) { // 同ターン内で既に走っていれば飛ばす
    await maybeRunImpressionAutoUpdate(session, world);
    await maybeRunMemoryAutoExtract(session, world);
    setMemoryImpressionCheckpoint(session.id, turnNumber);
  }
}

// 戻り値 { cut, reason, defer }
export function evaluateBoundary(session, world, playthrough, { connection = null, toRoom = null, isMove = false } = {}) {
  if (!world.continuous_room_session_enabled) return { cut: isMove, reason: isMove ? 'legacy_move' : null, defer: false };
  if (isMove && connection?.ends_session) return { cut: true, reason: 'connection', defer: false };
  if (isMove && toRoom?.ends_session_on_enter) return { cut: true, reason: 'room_enter', defer: false };
  if (isMove && session.boundary_pending) return { cut: true, reason: session.boundary_pending, defer: false };

  const mode = world.session_boundary_mode ?? 'time_slot';
  let reason = null;
  if (mode === 'time_slot' && hasCrossedTimeSlotBoundary(session, playthrough)) reason = 'time_slot';
  else if (mode === 'day' && playthrough.current_day !== session.log_day) reason = 'day';
  if (!reason && world.session_max_turns > 0 && countUserTurnsForSession(session.id) >= world.session_max_turns) reason = 'max_turns';
  if (!reason) return { cut: false, reason: null, defer: false };
  const defer = !isMove && (reason === 'max_turns' || Boolean(world.session_boundary_defer_to_move));
  return { cut: !defer, reason, defer };
}

export async function closeAndReopenSession(session, world, { targetRoomTemplateId = null, carryOverParticipants = null, broadcast = null, reason = null } = {}) {
  await runEndOfSceneHooks(session, world);
  const carry = carryOverParticipants ?? (session.participants ?? []).filter((p) => p.is_accompanying)
    .map((p) => ({ character_id: p.character_id, current_outfit_id: p.current_outfit_id }));
  endSessionForMove(session.id);
  const newSession = createRoomSession(session.playthrough_id, targetRoomTemplateId ?? session.room_template_id,
    { carryOverParticipants: carry, fromRoomSessionId: session.id });
  broadcast?.(session.id, { type: 'forced_room_transfer', new_session_id: newSession.id, reason });
  return newSession;
}

// 「切らない」モード／遅延中の日替わり処理
export async function handleDayRollover(session, world, playthrough, { broadcast = null } = {}) {
  await runEndOfSceneHooks(session, world);
  await maybeUpdateConversationSummary(getRoomSession(session.id), world, { force: true }); // 区切り行より前を畳む
  setLogDay(session.id, playthrough.current_day);                                            // 以降の行は新しい日
  const message = createMessage(session.id, { sender_type: 'narration',
    content: `―― ${playthrough.current_day}日目（${playthrough.current_date_label}）――` });
  broadcast?.(session.id, { type: 'message_complete', message });
}

// generateReply 事後フック末尾から呼ぶ(旧 maybeCloseSessionOnTimeSlotChange の置き換え)
export async function maybeHandleSessionBoundary(session, world, { broadcast } = {}) {
  if (!world.continuous_room_session_enabled || !session || session.status !== 'active') return null;
  const playthrough = getPlaythrough(session.playthrough_id);
  const verdict = evaluateBoundary(session, world, playthrough, { isMove: false });
  if (verdict.cut) return closeAndReopenSession(session, world, { broadcast, reason: verdict.reason });
  if (verdict.defer && session.boundary_pending !== verdict.reason) setBoundaryPending(session.id, verdict.reason);
  if (playthrough.current_day !== session.log_day) await handleDayRollover(session, world, playthrough, { broadcast });
  return null;
}
```
`playthrough.current_date_label`は`attachLabels`（playthroughsRepo.js 53-76）が付ける既存フィールド。

## 4. ルート [roomSessions.js](server/src/routes/roomSessions.js)

- import：`maybeCloseSessionOnTimeSlotChange`→`maybeHandleSessionBoundary, evaluateBoundary, closeAndReopenSession, handleDayRollover, runEndOfSceneHooks`。
- generateReply事後フック末尾（~1094-1101）：`maybeHandleSessionBoundary(getRoomSession(sessionId), world, { broadcast })`。
- `/exit`（~481-503）：ロック内の3フック呼び出しを`runEndOfSceneHooks(freshSession, world)`に置換。`exitRoomSession`はそのまま（pendingはセッションと共に消える）。
- `/move`（~533-580）、ロック内：
  1. 事前フック（ユーザー決定：移動のたびに記憶・印象）を`runEndOfSceneHooks(freshSession, moveWorld)`に置換（チェックポイントも中で進む）。
  2. `const toRoom = db.prepare('SELECT * FROM room_templates WHERE id = ?').get(connection.to_room_template_id); const playthrough = applyMovementCost(...)`。
  3. `const verdict = evaluateBoundary(getRoomSession(freshSession.id), moveWorld, playthrough, { connection, toRoom, isMove: true })`。
  4. `!verdict.cut`：既存の`switchRoomWithinSession`＋「〇〇へ移動した。」narration。その後`const after = getRoomSession(id); if (playthrough.current_day !== after.log_day) await handleDayRollover(after, moveWorld, playthrough, { broadcast });`（`never`モードで移動コストにより日が変わった場合）。`{ session: getRoomSession(id), playthrough }`を返す。
  5. それ以外：`closeAndReopenSession(getRoomSession(freshSession.id), moveWorld, { targetRoomTemplateId: connection.to_room_template_id, carryOverParticipants, broadcast: null, reason: verdict.reason })`（HTTP応答でクライアントがnavigateするのでWSは流さない）。
- `GET /:id`（69-72）・`GET /:id/messages`（76）：`const day = req.query.day === 'current' ? session.log_day : req.query.day != null ? Number(req.query.day) : null;` → `{ ...session, messages: listMessagesForSession(id, { day }), log_days: listLogDaysForSession(id), view_day: day }`。
- room_connections / room_templates / worlds のルートは`req.body`をそのままリポジトリに渡しているので変更不要（明示的なpickがあればそこに追加）。

### イベントアクション
- 新規 `server/src/services/eventEngine/actions/endSession.js`：
  ```js
  export async function executeEndSession(params, execCtx) {
    return withSessionLock(execCtx.sessionId, async () => {
      const session = getRoomSession(execCtx.sessionId);
      if (!session || session.status !== 'active') return { skipped: true, reason: 'session_not_active' };
      const world = getWorld(getPlaythrough(execCtx.playthroughId).world_id);
      const carryIds = new Set(params.carry_character_ids ?? []);
      const carryOverParticipants = session.participants
        .filter((p) => p.is_accompanying || carryIds.has(p.character_id))
        .map((p) => ({ character_id: p.character_id, current_outfit_id: p.current_outfit_id }));
      const newSession = await closeAndReopenSession(session, world,
        { targetRoomTemplateId: params.target_room_template_id ?? null, carryOverParticipants, broadcast, reason: 'event' });
      return { new_session_id: newSession.id };
    });
  }
  ```
  [registry.js](server/src/services/eventEngine/actions/registry.js)にimport＋`end_session: executeEndSession`。EventsPageの説明文に「アクション一覧の最後に置くこと（後続アクションは終了済みセッションを対象にしてしまう）」を書く。
- [forceRoomTransfer.js](server/src/services/eventEngine/actions/forceRoomTransfer.js)：同じヘルパー経由に書き換え（`carry_character_ids`のみ、同行者の自動引き継ぎ無し＝現状の意味を維持）＋ロック。挙動変化：強制移動でも場面終了時フックが走るようになる（コメントに明記）。

## 5. クライアント

1. [useChatStream.js](client/src/hooks/useChatStream.js)：`useChatStream(sessionId, onGenerationDone, onForcedTransfer)`。refで保持し、`else if (data.type === 'forced_room_transfer') { setIsGenerating(false); onTransferRef.current?.(data.new_session_id); }`。[ChatPage.jsx](client/src/pages/ChatPage.jsx) ~933で`(newId) => { queryClient.invalidateQueries({ queryKey: ['playthroughs'] }); navigate(`/room-sessions/${newId}/chat`); }`を渡す。`handleMove`（~1007）をtry/catchし、409 `session_already_ended`なら`/playthroughs/:id/active-session`を引いてそこへnavigate（WS転送→moveの競合対策）。
2. [roomSessions.js (api)](client/src/api/roomSessions.js)：`get: (id, { day } = {}) => api.get(`/room-sessions/${id}${day != null ? `?day=${day}` : ''}`)`。[useRoomSession.js](client/src/hooks/useRoomSession.js)：`useRoomSession(id, opts)`で`queryKey: ['roomSessions', id, opts?.day ?? 'all']`（既存の`['roomSessions', id]`前方一致invalidateはそのまま効く）。ChatPageは常に`useRoomSession(id, { day: 'current' })`。メッセージ一覧の上に、`session.log_days.length > 1`なら「前の日のログを見る」→`/room-sessions/${id}/log?day=${前日}`。
3. [SessionHistoryPage.jsx](client/src/pages/SessionHistoryPage.jsx)：key `${s.id}-${s.game_day}`、リンク`/room-sessions/${s.id}/log?day=${s.game_day ?? s.entered_day}`、表示`${s.game_day ?? s.entered_day}日目`（時間帯ラベルは`game_day === entered_day`の行だけ）、「進行中」は`status==='active' && game_day === log_day`の行だけ。[SessionLogPage.jsx](client/src/pages/SessionLogPage.jsx)：`useSearchParams().get('day')`を`useRoomSession`に渡し、`session.log_days`を日タブ/リンクとして描画。
4. 設定UI：
   - [WorldsPage.jsx](client/src/pages/WorldsPage.jsx)：`emptyForm`（62-64）に`session_boundary_mode: 'time_slot'`, `session_boundary_defer_to_move: false`, `session_max_turns: ''`；load（184-186）；save（231-249、`''→null`は`conversation_summary_interval_turns`と同じ）；セクション（754-797、次の見出し799の前）に、`continuous_room_session_enabled`がONの時だけ表示：ラジオ「区切り＝時間帯の変化／1日の終わり／区切らない」、チェック「会話の途中では区切らず、次の移動時に区切る」（`never`ではdisabled）、数値「1場面の最大ターン数（空欄で無制限。超えたら次の移動時に区切る）」。「区切らない」の説明に、日替わりで記憶・印象・あらすじが更新されること、チャット画面は当日分のみ表示になること、あらすじ間隔の設定を推奨することを書く。
   - [RoomWorldConfigPage.jsx](client/src/pages/RoomWorldConfigPage.jsx) 317-348：追加行に「場面の切れ目」チェック（`handleAddConnection`に通す）、既存行にもチェックを付けて`connectionMutations.update.mutateAsync({ connectionId: c.id, data: { to_room_template_id, label, movement_cost, ends_session } })`（[useRoomTemplates.js:91](client/src/hooks/useRoomTemplates.js:91)の`update`は`{ connectionId, data }`を受ける、未使用）。
   - [RoomTemplateEditPage.jsx](client/src/pages/RoomTemplateEditPage.jsx)：`ends_session_on_enter`を`is_place`の隣に（emptyForm ~42、load ~96、save ~159、チェックボックス ~513-528）。
   - [EventsPage.jsx](client/src/pages/EventsPage.jsx)：`ACTION_TYPES`（~81-108）に`{ value: 'end_session', label: '場面を区切る（同じ部屋か指定部屋で再開）' }`；`actionDefaults`（~141、`force_room_transfer`は~200）に`{ target_room_template_id: null, carry_character_ids: [] }`；`ActionEditor`の`force_room_transfer`ブロック（~1229-1256）を複製し、部屋selectに空の選択肢「（同じ部屋で再開）」。

## 6. バンドル
- [worldBundle.js](server/src/services/contentBundle/worldBundle.js)：`WORLD_FIELDS`（11行目）に3列追加；接続のexport（~104-107）/import（159）に`ends_session`。
- [roomTemplateBundle.js](server/src/services/contentBundle/roomTemplateBundle.js) `ROOM_TEMPLATE_FIELDS`に`ends_session_on_enter`。

## 7. 仕上げ
- `docs/plans/PLAN_2026-09-05_session_boundary_modes.md`（このファイルのコピー）に実装結果を追記。
- メモリ`continuous_room_sessions.md`の「クライアント側の追加実装が要らない」の記述を訂正し、本機能を追記。

# 検証

DB（`node -e`で`file:///.../server/src/db/connection.js`を直接import、scratchpadにスクリプトを置く既存の手法）：
- `npm run migrate --workspace server`後：`PRAGMA table_info(event_actions)`が6列、行数が移行前と同じ；`action_type='transform_character'`/`'end_session'`のINSERTが通る；`SELECT COUNT(*) FROM messages WHERE game_day IS NULL`=0；全`room_sessions.log_day = entered_day`。

HTTP（`localhost:3001`、koboldcpp起動済み）：
- 現代学園ファンタジー(World4)、`time_slot`・遅延OFF → 従来どおり（時間帯内の移動は同一セッション、`turns_per_time_slot`で時間帯が進むと切れてWSに`forced_room_transfer`）。**ブラウザが新セッションへ自動遷移する**こと（既存バグの修正確認）。
- `time_slot`・遅延ON：`turns_per_time_slot`で時間帯を跨ぐ→セッションはactiveのまま`boundary_pending='time_slot'`；`/move`→新セッション、旧は`ended`。
- `day`：`turns_per_time_slot=1`・4時間帯の部屋で4発言→`log_day=翌日`の新セッション。遅延ONなら：区切り行narrationが`game_day=翌日`で入る、`conversation_summary`が非空（間隔設定あり）、`memory_impression_last_turn`＝ユーザーターン数、次の`/move`で切れる。
- `never`：同じ手順→セッションはactiveのまま；`GET /room-sessions/:id?day=current`は区切り行以降だけ、`?day=1`は前日分だけ；`/playthroughs/:id/room-sessions`にそのセッションの行が2つ。移動コストで日が変わる`/move`でも区切り行が入る。
- `session_max_turns=3`：3発言目の後`boundary_pending='max_turns'`、会話中は切れない；`/move`で切れる。
- `ends_session=1`の接続、`ends_session_on_enter=1`の部屋：`never`でも`/move`が別セッションidを返す。
- `end_session`イベント（target無し）をキーワードで発火：応答が返り、WSに`forced_room_transfer`、同じ部屋の新セッションに同行者が引き継がれる；`target_room_template_id`ありなら別部屋。`force_room_transfer`でも同様に確認（リファクタの回帰）。
- 競合：`end_session`発火中に`/move`を投げる→activeセッションは常に1つ（`SELECT COUNT(*) FROM room_sessions WHERE playthrough_id=? AND status='active'`）。

ブラウザ：ターン中の転送にチャット画面が追従する（URLが変わる）；日替わりで区切り行が先頭に来て「前の日のログ」リンクが出る；履歴一覧が日ごと；3つの設定画面が往復保存できる；EventsPageで`end_session`を保存できる。

検証後、World4の一時設定・テストメッセージは片付ける（既存の慣例）。

# 落とし穴
- イベントエンジンはロック外（上記）。アクション側でロックを取る。
- `game_day`は`log_day`から（暦からではない）。既存行のbackfillは`entered_day`。
- CHECK作り直しは列リストを完全に写す。`migrate.js`がトランザクションで包む。
- `/move`の409はクライアントで拾う（通常はWS転送が先に届く）。
- `switchRoomWithinSession`が`entered_*`と`log_day`を触らないのは意図どおり。「直さない」。
- `handleDayRollover`は事後フック内でLLMを最大4回呼ぶ（切る場合と同じコスト）。
