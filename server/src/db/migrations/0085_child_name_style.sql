-- 子の名前を自動生成するときの様式。母の full_name から引き継ぐ姓と、
-- ここで選ぶ様式の候補から抽選した名を組み合わせる(childName.js)。
--
-- 「妊娠の発覚・終了」アクションで子の名前が明示された場合はそちらが優先で、
-- この設定は名前が空欄のときだけ効く。
--
-- 和名 = 姓+名を続けて書く(桜井みお)。洋名 = 名 姓 の順に空白で繋ぐ(Emma Shiraishi)。
-- 既定を和名にしてあるのは、既存Worldのキャラが全て和名のため。
ALTER TABLE worlds ADD COLUMN child_name_style TEXT NOT NULL DEFAULT '和名'
  CHECK (child_name_style IN ('和名', '洋名'));
