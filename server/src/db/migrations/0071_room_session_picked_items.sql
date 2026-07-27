-- 「もちもの > 拾う」で既に拾ったアイテムの記録。
--
-- 従来この一覧はWorldのアイテムマスタ全件を出しており、ITEM_GRANTでLLMが
-- 動的生成した物も積み上がるため、セッションを重ねるほどその場に無いはずの
-- 物まで拾える状態だった。一覧は部屋の入手可能カテゴリ
-- (room_template_item_categories)から引くようにし、その上でこのテーブルに
-- 記録済みの物を除外する。
--
-- room_session_id を鍵にしているので、部屋を出入りして新しいセッションに
-- なれば自然に一覧が戻る(=セッションごとのリセット)。過去セッションの行は
-- 残るが、参照されないので害はない。
CREATE TABLE room_session_picked_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_session_id INTEGER NOT NULL REFERENCES room_sessions(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  picked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_room_session_picked_items ON room_session_picked_items(room_session_id, item_id);
