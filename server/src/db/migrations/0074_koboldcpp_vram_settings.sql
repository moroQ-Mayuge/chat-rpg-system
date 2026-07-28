-- VRAM消費まわりの起動オプションを設定可能にする。koboldcpp.exe --help
-- (v1.116.1)で実在を確認したフラグのみを扱う。なお fp6/fp4 という指定は
-- koboldcppに存在せず、量子化は画像側(--sdquant)とLLM側(--quantkv)で
-- そもそも別フラグ・別の選択肢になっている。

-- 画像生成(SD)側
ALTER TABLE koboldcpp_launch_settings ADD COLUMN sd_vram_limit_mb INTEGER;              -- --sdvramlimit（NULL=指定なし）
ALTER TABLE koboldcpp_launch_settings ADD COLUMN sd_offload_cpu INTEGER NOT NULL DEFAULT 0;  -- --sdoffloadcpu

-- LLM側。gpu_layers はこれまで999(全オフロード)決め打ちだったので、既定値も
-- 999にして従来と同じ起動引数になるようにする。
ALTER TABLE koboldcpp_launch_settings ADD COLUMN gpu_layers INTEGER NOT NULL DEFAULT 999;    -- --gpulayers
ALTER TABLE koboldcpp_launch_settings ADD COLUMN low_vram INTEGER NOT NULL DEFAULT 0;        -- --lowvram
ALTER TABLE koboldcpp_launch_settings ADD COLUMN quant_kv TEXT NOT NULL DEFAULT '';          -- --quantkv（空=指定なし）
