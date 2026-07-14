-- Cleanup half of the room/World decoupling (see 0030_room_world_decoupling.sql):
-- drops the legacy 1-room-1-World tables/columns now that every application
-- code path has been switched over to the new shared-master-data shape and
-- verified against a real playthrough. SQLite 3.35+ (bundled version 3.49.2)
-- supports ALTER TABLE ... DROP COLUMN directly, so no table-rebuild is needed.
DROP TABLE room_template_characters;
DROP TABLE room_template_props;
DROP TABLE room_template_free_props;
ALTER TABLE props DROP COLUMN category;
ALTER TABLE room_templates DROP COLUMN world_id;
