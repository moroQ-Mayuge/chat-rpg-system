-- 部屋を移動してもセッションを継続する(繋がった部屋をまとめて1シーンとして扱う)。
-- 既定0=これまでどおり移動のたびに新セッション。ONの場合の切れ目は「時間帯の変化」。
ALTER TABLE worlds ADD COLUMN continuous_room_session_enabled INTEGER NOT NULL DEFAULT 0;
-- 記憶抽出・印象更新をターン数間隔でも走らせる(NULL=部屋移動/セッション終了時のみ、従来どおり)。
ALTER TABLE worlds ADD COLUMN memory_impression_interval_turns INTEGER;
-- 上記の経過判定用チェックポイント。relationship_update_last_turn(0056)と全く同じ方式。
ALTER TABLE room_sessions ADD COLUMN memory_impression_last_turn INTEGER NOT NULL DEFAULT 0;

-- 会話の要約(圧縮)。規定ターン毎に「直前の要約＋それ以降のやりとり」を1つの
-- あらすじへ畳み直す。character_memories(ルート永続・キャラが覚えている出来事)
-- とは別物で、こちらはセッション内の会話の筋を保つためのもの。NULL=無効。
ALTER TABLE worlds ADD COLUMN conversation_summary_interval_turns INTEGER;
ALTER TABLE room_sessions ADD COLUMN conversation_summary TEXT NOT NULL DEFAULT '';
-- どのメッセージまで畳み込み済みかの目印(次回はこれ以降だけを要約に足す)。
ALTER TABLE room_sessions ADD COLUMN conversation_summary_last_message_id INTEGER;
