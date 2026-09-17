-- 足回り(靴下・パンスト)/靴の脱衣コマンドを「下半身」サブカテゴリから独立した
-- 「足回り」サブカテゴリへ再編。ActionCommandBar(ChatPage.jsx)のサブカテゴリ
-- ピルはaction_commands.subcategoryの値から動的に生成されるため、データ変更
-- のみで新しいピルが現れる。「（下半身）」の接尾辞は上着/中衣/下着のように
-- 上半身にも同名の対になるコマンドが存在する場合の曖昧さ回避用だったが、
-- 足回り・靴は下半身にしか存在しない概念のため不要——ラベル・keyword_textから
-- 削除する。

UPDATE action_commands
SET subcategory = '足回り', label = REPLACE(label, '（下半身）', ''), keyword_text = REPLACE(keyword_text, '（下半身）', '')
WHERE id IN (83, 84, 85, 86);

UPDATE event_conditions SET params = REPLACE(params, '（下半身）', '')
WHERE event_definition_id IN (383, 384, 385, 386);

UPDATE event_definitions SET name = REPLACE(name, '（下半身）', '') WHERE id IN (383, 384, 385, 386);
