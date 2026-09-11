-- 同行同意イベントのように、成否がLLM生成前に確定できるイベント(0130フォローアップ、
-- preResolution.js)向けに、その成否をキャラのプロンプトへヒントとして注入する
-- ための著者記述テキスト。既存のoutcome_root_label/event_outcome_nodes.labelは
-- 管理画面表示専用でイベントエンジンからは未参照(0062_event_outcome_labels.sqlの
-- コメント参照)なので、新規カラムが必要。既定は空文字——著者が明示的に入力
-- しない限り、既存イベントの挙動は一切変わらない。
ALTER TABLE event_definitions ADD COLUMN outcome_success_hint_text TEXT NOT NULL DEFAULT '';
ALTER TABLE event_definitions ADD COLUMN outcome_failure_hint_text TEXT NOT NULL DEFAULT '';
