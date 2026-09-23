-- event_definitions は scope='global' だと全Worldで無条件に評価される
-- (Worldを指定する欄が無い)。character_id直指定やcandidate_character_idsに
-- 他World専用のキャラを書いたイベントが実際にそのキャラを入室させてしまう
-- 既存バグを踏まえ、イベント単位で「対象キャラをこのWorldの所属者に限定する」
-- を選択できるようにする(常時強制ではなく既定OFF、著者が個別に有効化する)。
ALTER TABLE event_definitions ADD COLUMN restrict_to_own_world INTEGER NOT NULL DEFAULT 0;
