-- 出力文字種をGBNF文法で日本語＋英語に絞る機能(services/llmGrammar.js)のON/OFF。
--
-- grammarは「モデルに教える」のではなく「条件を満たさないトークンをマスクする」
-- 機構なので、モデルが強く出したがるトークンを禁止すると文章が不自然になったり
-- 同じ語を繰り返す副作用がありうる。効果が薄い/副作用が出た場合に即座に戻せる
-- 逃げ道として設定を切れるようにしておく。
--
-- 既定はON: 多言語混入は実際に報告されている問題で、まず有効な状態で使いたいため。
ALTER TABLE llm_generation_settings ADD COLUMN grammar_enabled INTEGER NOT NULL DEFAULT 1;
