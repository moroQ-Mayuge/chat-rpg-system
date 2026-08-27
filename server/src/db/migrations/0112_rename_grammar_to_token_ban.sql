-- 0111で入れたGBNF文法(grammar)による文字種制限は、候補トークンごとに全文字範囲を
-- 照合するため生成が実用に耐えないほど遅く、KoboldCppのbanned_tokens(禁止トークン)
-- 方式に置き換えた。設定の意味は「日本語・英語以外の文字を出さない」で変わらないので
-- 値(既定ON)はそのまま引き継ぎ、実態と合わなくなったカラム名だけを改名する。
ALTER TABLE llm_generation_settings RENAME COLUMN grammar_enabled TO foreign_token_ban_enabled;
