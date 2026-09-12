-- モブへの印象自動更新(impression_auto_update_enabled)の動作確認のため、
-- 印象フィールド(character_impression_defaults)が未設定だったプリセットモブに
-- 「あなたとの関係」「あなたの印象」の2枠を追加する。既存の「モブメイドさんA/B」
-- (character_id 115/215)は既に設定済みのため対象外。値は無難な既定「普通」。
-- idではなく名前で対象を絞る(0134と同じ理由、インストール環境によってidが
-- ずれても安全に効くように)。
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT c.id, f.field_key, '普通'
FROM characters c
JOIN (SELECT 'あなたとの関係' AS field_key UNION ALL SELECT 'あなたの印象') f
WHERE c.is_mob = 1
  AND c.name IN (
    'モブ女子小学生', 'モブ女子中学生', 'モブ女子高校生', 'モブ女教師', 'モブ女性',
    'モブウェイトレスさんA', 'モブウェイトレスさんB', 'モブウェイトレスさんC',
    'モブ婦警さん', 'モブ女医', 'モブ看護婦A', 'モブ看護婦B', 'モブ巫女さん'
  )
  AND NOT EXISTS (
    SELECT 1 FROM character_impression_defaults existing
    WHERE existing.character_id = c.id AND existing.field_key = f.field_key
  );
