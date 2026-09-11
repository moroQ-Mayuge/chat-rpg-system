-- モブお気に入り昇格(repointParticipantCharacter)はroom_session_characters行の
-- character_idをその場で書き換えるため、昇格前に発言した過去メッセージが
-- 保持するcharacter_idは昇格前の共有モブidを指し続け、以後その行を検索しても
-- 見つからなくなる(表示名・アイコンが解決できなくなる、bugreports_2026-09-11
-- 項目4)。room_session_characters.idは昇格の前後で不変なので、これを
-- messagesにも持たせておけば常に安定して解決できる。

ALTER TABLE messages ADD COLUMN room_session_character_id INTEGER REFERENCES room_session_characters(id);

-- ベストエフォートのバックフィル: 同一(room_session_id, character_id)の参加行が
-- 一意に見つかる場合だけ埋める(モブ重複出演等で複数該当する場合はどれか1つに
-- 決め打ちせずNULLのまま=従来通りcharacter_idベースの解決にフォールバックする)。
-- 既に昇格でcharacter_idが変わってしまった過去メッセージは、当時のcharacter_id
-- を持つ行がもう存在しないため原理的に救えない(今後発生する分は保存時に
-- room_session_character_idが正しく入るため解決される)。
UPDATE messages SET room_session_character_id = (
  SELECT rsc.id FROM room_session_characters rsc
  WHERE rsc.room_session_id = messages.room_session_id AND rsc.character_id = messages.character_id
  GROUP BY rsc.character_id
  HAVING COUNT(*) = 1
)
WHERE sender_type = 'character' AND room_session_character_id IS NULL;
