-- 複数キャラが同じ部屋で同じ条件に該当しうる場合(例：2人が同時に妊娠中)、
-- 従来の「同席者の誰か1人でも」条件+「同席者全員」アクションの組み合わせでは
-- 1人目が発火した時点でイベントを使い切ってしまい(max_fires_per_session・
-- exclusive_groupがルート/セッション単位でキャラ軸を持たないため)、2人目には
-- 二度と発火しない。加えてアクションが同席者全員を対象にするので、条件を
-- 満たしていない同席者にまで処理が及ぶ(誤爆)。
--
-- per_character_firing を有効にしたイベントは、条件が「同席者の誰か1人でも」
-- 等で複数キャラに該当しうる場合、該当したキャラごとに個別に発火判定・
-- クールダウン/最大発火回数を計上する(eventEngine/index.js)。
-- アクション側は新設の character_id: "condition_matched" で「この発火の
-- 該当キャラ」だけを対象にできる。
ALTER TABLE event_definitions ADD COLUMN per_character_firing INTEGER NOT NULL DEFAULT 0;

-- NULL = 既存の挙動そのまま(ルート/セッション単位で1本のカウント)。
-- 値ありのとき、そのキャラ専用のカウントとして数える。
ALTER TABLE event_fire_history ADD COLUMN character_id INTEGER;
