-- 現代学園ファンタジー「イベント会場」向けキャラ・部屋プロファイル実データ。
-- 部屋プロファイル機構(0147)の上に、アイドルイベント/コミケ的/商業イベント/
-- レースクイーン(カーイベント)の4カテゴリ分の固有キャラ5人+モブ17体、
-- room_profiles実データ4件を投入する。attribute_tagsは各room_profileの
-- attribute_tagsと重なるよう設計(部屋プロファイルの出現判定と連動)。

INSERT INTO characters (
  name, full_name, full_name_reading, nickname, occupation, age_real, age_apparent, race, attribute,
  appearance_features, eye_description, hair_description, body_type, bust_description, physical_features,
  first_person, call_user_as, call_others_as, personality, speech_style, sentence_ending,
  behavior_principle, social_tendency, habits, likes, dislikes, skills, special_skills, weakness, secret, notes,
  attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  '星宮ルミ', '星宮 瑠美', 'ほしみや るみ', 'ルミ', '高校2年生（インディーズアイドル「リトルスタァズ」兼任）', '16', '16', '人間', '週末だけインディーズアイドルユニット「リトルスタァズ」のメンバーとして活動している、学校では正体を隠している普通の生徒',
  '普段は地味めな黒縁眼鏡。ステージではウィッグとメイクで別人のような華やかさに', '眼鏡の奥の丸い目、黒', '黒髪ロング、学校では一つに結んでいる', '中肉中背', '普通', '学校ではおどおどした仕草だが、ステージに上がると堂々とした立ち姿に変わる',
  'わたし', '苗字に「くん」付け', '苗字に「さん」付け', '学校では物静かで目立たない委員長タイプ寄り。ステージに立つと別人のように明るく弾ける二面性。同級生に秘密がバレないか常に気を張っている', '学校では控えめな丁寧語。ステージ／ファン対応中はハキハキした元気なアイドル口調に切り替わる', '～です／～ます（学校）、～だよ！（ステージ時）',
  '秘密がバレないよう学校では目立たないように振る舞う', '自分から話しかけることは少なく、受け身がち', 'アイドルの話題が出るとつい過剰に反応してしまう', '歌うこと、ファンの声援', '秘密がバレそうになる瞬間', '歌唱力、ステージでの表情作り', '素顔とステージの顔を完全に演じ分ける', '動揺すると素の口調が抜けなくなる', 'インディーズアイドルユニット「リトルスタァズ」のメンバーであること。同級生には絶対に知られたくない', 'イベント会場（アイドルイベントプロファイル）にて確定出現想定。同級生。',
  '生徒,アイドルイベント', 0, '女性', 'glasses, round eyes, black eyes, shy expression', 'black hair, long hair, low ponytail'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 10 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 10 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 10 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '同じクラスの生徒。特に親しくはないが顔と名前は一致する' FROM characters WHERE name = '星宮ルミ';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '大人しくて目立たない子、という印象。まさか秘密を知られているとは思っていない' FROM characters WHERE name = '星宮ルミ';

INSERT INTO characters (
  name, full_name, full_name_reading, nickname, occupation, age_real, age_apparent, race, attribute,
  appearance_features, eye_description, hair_description, body_type, bust_description, physical_features,
  first_person, call_user_as, call_others_as, personality, speech_style, sentence_ending,
  behavior_principle, social_tendency, habits, likes, dislikes, skills, special_skills, weakness, secret, notes,
  attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  '氷川メイ', '氷川 芽衣', 'ひかわ めい', 'メイ', '高校2年生（コスプレイヤーとして活動）', '16', '16', '人間', 'SNSで有名なコスプレイヤー。学校では意外とこの趣味を知られていない',
  '華やかな雰囲気、よく目立つ', 'くっきりした目元、明るい茶色', '明るい色に染めた茶髪、緩く巻いたセミロング', 'すらっとした体型', '普通よりやや大きめ', '姿勢がよく、人前に立ち慣れている',
  'あたし', '苗字に「くん」付け（撮影対応時は「お客さん」寄りの言い方になることも）', '苗字に「さん」付け', '撮影対応中は華やかで堂々とした立ち居振る舞い。オフになると早口のオタク気質が出る二面性', '人前では愛想良く華やかな口調。素の顔になると早口でまくし立てる', '～かな／～だよね',
  '好きな作品への愛をコスプレという形で表現する', '学校では距離を置かれがちだが本人は気にしていない', '気になる衣装を見ると素材や作りを観察してしまう', '新しい衣装制作、SNSでの反応', '作品を雑に扱われること', '衣装制作、メイク、写真映えするポージング', 'どんなキャラでも短時間で「それらしく」仕上げる', '好きな作品の話になると止まらない', '学校の友人にはコスプレ活動をほとんど知られていない', 'イベント会場（コミケ的プロファイル）にて確定出現想定。同級生。',
  '生徒,同人イベント', 0, '女性', 'brown eyes, sharp eyes, confident expression', 'brown hair, dyed hair, wavy hair, semi-long hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 5 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 5 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 15 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = '氷川メイ';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '同じクラスの生徒。話したことはほとんどない' FROM characters WHERE name = '氷川メイ';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '派手で近寄りがたい人、と思われている程度' FROM characters WHERE name = '氷川メイ';

INSERT INTO characters (
  name, full_name, full_name_reading, nickname, occupation, age_real, age_apparent, race, attribute,
  appearance_features, eye_description, hair_description, body_type, bust_description, physical_features,
  first_person, call_user_as, call_others_as, personality, speech_style, sentence_ending,
  behavior_principle, social_tendency, habits, likes, dislikes, skills, special_skills, weakness, secret, notes,
  attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  '神楽坂ミカ', '神楽坂 美香', 'かぐらざか みか', 'ミカ', '高校1年生（同人サークル参加者、ペンネーム活動）', '15', '15', '人間', '同人サークル参加者（ペンネーム活動）。普段は大人しいオタク気質。自身の創作キャラのコスプレも趣味としている',
  '小柄で控えめな雰囲気', '伏し目がちな目、黒', '黒髪、内巻きのボブ', '小柄', '小さめ', '緊張すると小さくなる仕草',
  'わたし', '「先輩」', '苗字に「さん」付け', '人見知りで物静か。自分の作品や好きな作品の話になると人が変わったように早口になる', '普段は控えめな敬語交じり。好きな話題になると砕けて早口に', '～です／～ます（普段）、～だよね！（好きな話題）',
  '自分の作品を少しでも多くの人に見てもらいたい', '初対面は緊張するが、一度打ち解けると懐きやすい', '新刊の校正を何度も見返してしまう', '自分の創作、好きな作品の考察', '大勢の前で注目されること', 'イラスト・創作活動、自作キャラのコスプレ制作', '徹夜で新刊を仕上げる集中力', '人前で自分の作品を貶されると強く落ち込む', '', 'イベント会場（コミケ的プロファイル）にて確定出現想定。後輩。',
  '生徒,同人イベント,コスプレイヤー', 0, '女性', 'black eyes, downcast eyes, shy expression, petite', 'black hair, bob cut, inward curl'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 15 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 10 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 5 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 5 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '学校の後輩。顔は知っている程度で、まだそれほど話したことはない' FROM characters WHERE name = '神楽坂ミカ';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '先輩の一人、という程度の認識' FROM characters WHERE name = '神楽坂ミカ';

INSERT INTO characters (
  name, full_name, full_name_reading, nickname, occupation, age_real, age_apparent, race, attribute,
  appearance_features, eye_description, hair_description, body_type, bust_description, physical_features,
  first_person, call_user_as, call_others_as, personality, speech_style, sentence_ending,
  behavior_principle, social_tendency, habits, likes, dislikes, skills, special_skills, weakness, secret, notes,
  attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  '桐谷アリサ', '桐谷 亜里紗', 'きりたに ありさ', 'アリサ', 'キャンペーンコンパニオン（企業所属・派遣）', '22', '22', '人間', '大手企業ブースの案内・製品説明担当。プロ意識が高く物腰は洗練されている',
  '洗練された大人びた雰囲気', '切れ長の目、はっきりした目元', '黒髪ストレート、セミロング', 'すらっとした大人の体型', '大きめ', '姿勢がよく、隙のない立ち居振る舞い',
  '私', '「お客様」', '「お客様」（素になると普通に苗字呼びなど）', '業務中は完璧な接客スマイルを崩さない。休憩中や業務の建前を外すと素の表情・ちょっと気の抜けた一面を見せる', '接客中は丁寧で淀みない敬語。素になると若干くだけた口調に', '～です／～ます（業務中）、～かな（素）',
  '任された仕事を完璧にこなすことに誇りを持つ', '業務中は誰にでも平等に愛想がいいが、プライベートでは意外と人見知り', '気を抜くと敬語が抜けなくなることがある', '仕事帰りの一杯、褒められること', '気を抜けない長時間勤務', '製品説明、接客', 'どんな無茶振りにも笑顔で対応する', '素の自分を見せるのが少し苦手', '', 'イベント会場（商業イベントプロファイル）にて確定出現想定。',
  '大人,商業イベント', 0, '女性', 'sharp eyes, mature expression, elegant', 'black hair, straight hair, semi-long hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 5 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', 'イベント会場で接客することになった一般のお客様。まだ面識がない' FROM characters WHERE name = '桐谷アリサ';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '特に何とも思っていない' FROM characters WHERE name = '桐谷アリサ';

INSERT INTO characters (
  name, full_name, full_name_reading, nickname, occupation, age_real, age_apparent, race, attribute,
  appearance_features, eye_description, hair_description, body_type, bust_description, physical_features,
  first_person, call_user_as, call_others_as, personality, speech_style, sentence_ending,
  behavior_principle, social_tendency, habits, likes, dislikes, skills, special_skills, weakness, secret, notes,
  attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  '一之瀬マキ', '一之瀬 真希', 'いちのせ まき', 'マキ', '大学生（レースクイーンはアルバイト・副業）', '20', '20', '人間', '展示車両担当のレースクイーンだが本業は大学生。撮影対応に慣れたプロだが、実は車そのものが好きで話しかけると饒舌になる',
  '健康的で活発な雰囲気', '大きく明るい目、茶色', '茶色のロングヘア、緩いウェーブ', 'メリハリのある体型', '大きめ', 'よく笑い、身振りが大きい',
  '私', '「お客さん」', '気さくに名前呼び（親しくなると）', '人前では愛想よく振る舞う仕事モード。車の話になると素の熱量が出てオタク寄りの早口になる', '業務中は丁寧な接客口調。車の話題では砕けて熱っぽい口調に', '～です／～ます（業務中）、～だよ！／～じゃん（車の話）',
  '好きな車の魅力を一人でも多くの人に伝えたい', '車好きの相手にはとことん食いついてくる', '展示車両の前を通るたびについスペックを確認してしまう', '車、ドライブ、エンジン音', '車を雑に扱われること', '車の知識全般、撮影対応', 'どんな車種の話にもついていける知識量', '車の話が始まると止まらない', '', 'イベント会場（レースクイーンプロファイル）にて確定出現想定。大学生。',
  '大人,大学生,カーイベント', 0, '女性', 'brown eyes, bright expression, healthy', 'brown hair, long hair, loose wave'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 10 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', 'イベント会場で接客することになった一般のお客様。まだ面識がない' FROM characters WHERE name = '一之瀬マキ';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '特に何とも思っていない' FROM characters WHERE name = '一之瀬マキ';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブアイドル（共演者）さんA', 'インディーズアイドル', '17', '17', '普通', '普通', '普通', '普通', '普通',
  '私', '明るく元気なタイプ。ファンサービス全開でノリが良い', '高めのテンションの明るい口調', 'ルミの同ユニット／対バンメンバー想定', 'アイドルイベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), bright expression', 'pink hair, twintails'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブアイドル（共演者）さんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブアイドル（共演者）さんA';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブアイドル（共演者）さんB', 'インディーズアイドル', '17', '17', '普通', '普通', '普通', '普通', '普通',
  '私', 'クールで無口なタイプだが実は親切', '落ち着いた低めの声、口数少なめ', 'ルミの同ユニット／対バンメンバー想定', 'アイドルイベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), calm expression', 'blue hair, straight hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブアイドル（共演者）さんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブアイドル（共演者）さんB';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブ女性ファン', '一般来場者', '18', '18', '普通', '普通', '普通', '普通', '普通',
  '私', '推しに対して熱心なファン', '早口で興奮気味', '', 'アイドルイベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), excited expression', 'brown hair, ponytail'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブ女性ファン';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブ女性ファン';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブグッズ売り子', '物販スタッフ', '19', '19', '普通', '普通', '普通', '普通', '普通',
  '私', 'テキパキした接客対応', '明るい接客口調', '', 'アイドルイベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), bright expression', 'black hair, short hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブグッズ売り子';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブグッズ売り子';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブサークル参加者', '同人サークル参加者', '20', '20', '普通', '普通', '普通', '普通', '普通',
  '私', '自分の作品の宣伝に熱心', '早口の売り込み口調', '', '同人イベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5)', 'black hair, bob'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブサークル参加者';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブサークル参加者';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブ女性オタク客', '一般来場者', '21', '21', '普通', '普通', '普通', '普通', '普通',
  '私', 'お目当ての新刊を熱心に探している', '独り言が多い', '', '同人イベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), glasses', 'brown hair, long hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブ女性オタク客';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブ女性オタク客';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブコスプレイヤーさんA', 'コスプレイヤー', '19', '19', '普通', '普通', '普通', '普通', '普通',
  '私', '人気作品のヒロイン系。撮影慣れしていて堂々としている', '明るくハキハキ', '', '同人イベント,コスプレイヤー,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), confident expression', 'blonde hair, twintails'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブコスプレイヤーさんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブコスプレイヤーさんA';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブコスプレイヤーさんB', 'コスプレイヤー', '22', '22', '普通', '普通', '普通', '普通', '普通',
  '私', 'マイナー作品・自作寄りのキャラ。こだわりが強く話しかけると饒舌', '早口でオタク気質', '', '同人イベント,コスプレイヤー,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5)', 'black hair, long hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブコスプレイヤーさんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブコスプレイヤーさんB';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブコスプレイヤーさんC', 'コスプレイヤー', '18', '18', '普通', '普通', '普通', '普通', '普通',
  '私', '初心者寄り。人前が少し恥ずかしそうだが楽しそうにしている', 'おどおどした話し方', '', '同人イベント,コスプレイヤー,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), shy expression', 'pink hair, short hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブコスプレイヤーさんC';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブコスプレイヤーさんC';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブコンパニオンさんA', 'キャンペーンコンパニオン', '23', '23', '普通', '普通', '普通', '普通', '普通',
  '私', '明るく元気な接客タイプ', 'ハキハキした接客口調', '', '商業イベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), bright expression', 'black hair, straight hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブコンパニオンさんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブコンパニオンさんA';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブコンパニオンさんB', 'キャンペーンコンパニオン', '25', '25', '普通', '普通', '普通', '普通', '普通',
  '私', '落ち着いた大人びた接客タイプ', '丁寧で穏やかな口調', '', '商業イベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), calm expression', 'brown hair, updo'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブコンパニオンさんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブコンパニオンさんB';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブ女性スタッフさんA', '企業ブース運営スタッフ', '26', '26', '普通', '普通', '普通', '普通', '普通',
  '私', 'テキパキした社員タイプ', '簡潔な業務口調', '', '商業イベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5)', 'black hair, short hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブ女性スタッフさんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブ女性スタッフさんA';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブ女性スタッフさんB', '企業ブース運営スタッフ', '24', '24', '普通', '普通', '普通', '普通', '普通',
  '私', '物腰柔らかいタイプ', '柔らかい丁寧語', '', '商業イベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5)', 'brown hair, bob'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブ女性スタッフさんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブ女性スタッフさんB';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブOL来場者さんA', '会社員', '27', '27', '普通', '普通', '普通', '普通', '普通',
  '私', '休憩中に立ち寄った様子', '落ち着いた大人の口調', '', '商業イベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5)', 'black hair, ponytail'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブOL来場者さんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブOL来場者さんA';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブOL来場者さんB', '会社員（新人）', '23', '23', '普通', '普通', '普通', '普通', '普通',
  '私', '新人OL風で物珍しそうにしている', 'やや遠慮がちな口調', '', '商業イベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5)', 'brown hair, bob'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブOL来場者さんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブOL来場者さんB';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブレースクイーンさんA', 'レースクイーン', '21', '21', '普通', '普通', '普通', '普通', '普通',
  '私', '明るく人当たりの良いタイプ', '元気で愛想の良い口調', '', 'カーイベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), bright expression', 'blonde hair, long hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブレースクイーンさんA';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブレースクイーンさんA';

INSERT INTO characters (
  name, occupation, age_real, age_apparent, appearance_features, eye_description, hair_description, body_type, bust_description,
  first_person, personality, speech_style, notes, attribute_tags, is_mob, gender, main_features, hairstyle
) VALUES (
  'モブレースクイーンさんB', 'レースクイーン', '24', '24', '普通', '普通', '普通', '普通', '普通',
  '私', 'クールで凛としたタイプ', '落ち着いた大人びた口調', '', 'カーイベント,モブ', 1, '女性', '(faceless:1.7), (no eyes:1.5), calm expression', 'black hair, straight hair'
);
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 1, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 2, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 3, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 4, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 5, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 6, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 7, 100 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 8, 100 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 9, 100 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 10, 100 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 11, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 12, 100 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 13, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 14, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 15, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 16, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_relationship_defaults (character_id, relationship_axis_id, initial_value)
SELECT id, 17, 0 FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたとの関係', '普通' FROM characters WHERE name = 'モブレースクイーンさんB';
INSERT INTO character_impression_defaults (character_id, field_key, default_value)
SELECT id, 'あなたの印象', '普通' FROM characters WHERE name = 'モブレースクイーンさんB';

-- room_profiles実データ(イベント会場=room_template_id 120、名前で確認しSELECTで解決)
INSERT INTO room_profiles (room_template_id, name, attribute_tags, atmosphere_text, selection_mode, weight)
SELECT id, 'アイドルイベント', 'イベント,アイドルイベント', '特設ステージでインディーズアイドルのライブが行われており、熱心なファンの声援と拍手が響いている', 'random', 1
FROM room_templates WHERE name = 'イベント会場';
INSERT INTO room_profiles (room_template_id, name, attribute_tags, atmosphere_text, selection_mode, weight)
SELECT id, 'コミケ的', 'イベント,同人イベント', '同人サークルのブースが所狭しと立ち並び、色とりどりの新刊を求める客で賑わっている', 'random', 1
FROM room_templates WHERE name = 'イベント会場';
INSERT INTO room_profiles (room_template_id, name, attribute_tags, atmosphere_text, selection_mode, weight)
SELECT id, '商業イベント', 'イベント,商業イベント', '大手企業の展示ブースが並び、コンパニオンたちが新製品を熱心に案内している', 'random', 1
FROM room_templates WHERE name = 'イベント会場';
INSERT INTO room_profiles (room_template_id, name, attribute_tags, atmosphere_text, selection_mode, weight)
SELECT id, 'レースクイーン', 'イベント,カーイベント', '改造車やレースカーの展示車両が並び、レースクイーンたちが写真撮影に応じている', 'random', 1
FROM room_templates WHERE name = 'イベント会場';
