import { db } from '../db/connection.js';
import { getValue, getAxis } from '../db/repositories/relationshipStatesRepo.js';
import { createMessage } from '../db/repositories/messagesRepo.js';
import { broadcast } from '../ws/rooms.js';

// サブ部屋(0150)への「@メンション付き移動」で、メンションされた候補が実際について
// くるかの判定(Stage 2c)。ユーザー決定: 「関係値とLLM判断」——
//   1. 関係値(既存の「同行して」= event 376 と同じ、信頼度/恋愛度/依存度の
//      正規化値の最大)で生成前に確率ロールして成否を確定し、キャラカードへ
//      ヒントとして注入する(モデルの台詞と結果が食い違わないように)。
//   2. LLMが「強引に連れて行った」場面を描いた場合は応答末尾の[FOLLOW: 名前]で
//      同伴を確定でき、事前判定が不成立でも上書きできる。タグが出なければ事前判定
//      の結果にそのままフォールバックするので、パース失敗でも破綻しない。
// 同伴者 = 事前判定の成功者 ∪ [FOLLOW]で指名された候補。
//
// 候補は生成中もDB上は元の位置のままにし、プロンプト/返答解決の上でだけ「同席扱い」に
// する(withCompanionCandidates)。位置を動かすのは生成後のfinalizeCompanionMoveだけなので、
// 生成の途中でプロセスが落ちても、候補が「ついて行った」ことになる半端な状態は残らない
// (安全側=元の位置に残る)。

const COMPANION_AXIS_NAMES = ['信頼度', '恋愛度', '依存度'];

function companionAxisIds() {
  return db
    .prepare(`SELECT id FROM relationship_axes WHERE name IN (${COMPANION_AXIS_NAMES.map(() => '?').join(', ')})`)
    .all(...COMPANION_AXIS_NAMES)
    .map((r) => r.id);
}

// 対象キャラの各軸の正規化値の最大をそのまま確率とする(evaluateRelationshipProbabilityと同じ)。
export function rollFollowChance(playthroughId, sessionId, characterId, rowId) {
  const chance = Math.max(
    0,
    ...companionAxisIds().map((axisId) => {
      const axis = getAxis(axisId);
      const range = axis.max_value - axis.min_value;
      const value = getValue(playthroughId, characterId, axisId, sessionId, rowId);
      return range > 0 ? (value - axis.min_value) / range : 0;
    }),
  );
  return { chance, follows: Math.random() < chance };
}

// 生成用のセッションビュー: 元の位置に残っている候補を「会話対象(participants)」に
// 足し、「別の場所にいる(発言禁止)」一覧からは外す。DBは一切変更しない。
export function withCompanionCandidates(session, cm) {
  const candidates = session.all_participants.filter((p) => p.is_active && cm.candidateRowIds.includes(p.id));
  return {
    ...session,
    participants: [...session.participants, ...candidates],
    elsewhere_participants: session.elsewhere_participants.filter((p) => !cm.candidateRowIds.includes(p.id)),
  };
}

// 候補ごとの成否を確定し、キャラカード用のヒント(hintsByCharacterIdへ追記)と、
// システムプロンプトへ足す指示行を返す。cm.preSuccessRowIdsを埋める。
// sessionにはwithCompanionCandidatesを通したビューを渡す(候補がparticipantsに居る前提)。
export function prepareCompanionMove(cm, session, hintsByCharacterId) {
  const decisions = [];
  for (const rowId of cm.candidateRowIds) {
    const participant = session.participants.find((p) => p.id === rowId);
    if (!participant) continue;
    const { follows } = rollFollowChance(session.playthrough_id, session.id, participant.character_id, rowId);
    if (follows) cm.preSuccessRowIds.add(rowId);
    decisions.push(
      follows
        ? `・${participant.display_name}：誘いに応じる。一緒について行く（移動先でもプレイヤーと一緒にいる）。`
        : `・${participant.display_name}：誘いを断る。ついて行かず、元の場所に残る。「行かない」という趣旨の断りの台詞を言うこと（了承する台詞は言わない）。`,
    );
    const hint = follows
      ? 'プレイヤーの誘いに応じ、一緒に移動することに決めている'
      : 'プレイヤーの誘いを断り、その場に残ることに決めている';
    if (!hintsByCharacterId.has(participant.character_id)) hintsByCharacterId.set(participant.character_id, []);
    hintsByCharacterId.get(participant.character_id).push(hint);
  }
  const where = cm.targetName ?? '元の場所';
  // 各候補の結果を名指しで明示する(小さなモデルはキャラカード内のヒントだけだと
  // 断る側にも了承の台詞を書きがちだったため、実機で確認して強めた)。
  return [
    `【今回の移動（必ず従うこと）】プレイヤーは今「${where}」へ移動しようとしていて、次のキャラクターを一緒に来るよう誘っています。各キャラクターの返答と行動は以下の結果に厳密に従ってください。`,
    ...decisions,
    '地の文では、ついて行くキャラクターだけが移動先でプレイヤーと一緒にいると書き、断ったキャラクターは元の場所に残ったと書いてください（断ったキャラクターが移動に加わった・並んで歩いたと書いてはいけません）。',
    '例外: プレイヤーが強引に連れて行く（腕を引く・無理やり連れ出す等）場面をあなたが描いた場合に限り、断ったキャラクターもついて行くことになります。その場合のみ、応答の最後に [FOLLOW: キャラ名] を1行で出力してください（複数人なら読点区切り）。素直について行く場合や、断って残る場合は出力しないでください。',
  ];
}

export function composeSubRoomNarration({ targetName, movedNames, joinedNames, leftBehindNames }) {
  const parts = [targetName ? `${targetName}へ移動した。` : '元の場所へ戻った。'];
  if (movedNames.length > 0) parts.push(`同行: ${movedNames.join('、')}。`);
  if (joinedNames.length > 0) parts.push(`${joinedNames.join('、')}が合流した。`);
  if (leftBehindNames.length > 0) parts.push(`${leftBehindNames.join('、')}は元の場所に残った。`);
  return parts.join('');
}

// 生成後(または失敗時)に呼ぶ。冪等。同伴する候補だけをプレイヤーの位置へ移し、
// 結果を地の文で履歴に残す(次ターン以降、LLMが「Cは離れた」と読み取れる)。
// cm.movedRowIds/joinedRowIds/leftBehindRowIdsは、候補を動かさずにswitchSubRoomした結果
// (候補はleftBehind側に入っている)。
export function finalizeCompanionMove(sessionId, cm) {
  if (cm.finalized) return;
  cm.finalized = true;

  const followers = cm.candidateRowIds.filter((rowId) => cm.preSuccessRowIds.has(rowId) || cm.taggedRowIds.has(rowId));
  for (const rowId of followers) {
    db.prepare('UPDATE room_session_characters SET sub_room_id = ? WHERE id = ? AND is_active = 1').run(cm.targetPosition, rowId);
  }

  const namesOf = (rowIds) => rowIds.map((rowId) => cm.names[rowId]).filter(Boolean);
  const message = createMessage(sessionId, {
    sender_type: 'narration',
    content: composeSubRoomNarration({
      targetName: cm.targetName,
      movedNames: namesOf([...cm.movedRowIds, ...followers]),
      joinedNames: namesOf(cm.joinedRowIds),
      leftBehindNames: namesOf(cm.leftBehindRowIds.filter((rowId) => !followers.includes(rowId))),
    }),
  });
  broadcast(sessionId, { type: 'message_complete', message });
  broadcast(sessionId, { type: 'participants_changed' });
}
