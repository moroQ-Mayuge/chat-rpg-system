-- KoboldCpp launch settings (chat enhancement follow-up: user asked for an
-- fp8 image-model loading mode; the installed KoboldCpp build (v1.116.1) has
-- no fp8 option at all — its SD loader only exposes --sdquant with levels
-- 0=off/1=q8/2=q4 — so this persists that setting instead, applied by
-- koboldcppLauncher.js's in-app "start KoboldCpp" button.
CREATE TABLE koboldcpp_launch_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  sd_quant INTEGER NOT NULL DEFAULT 0 CHECK (sd_quant IN (0, 1, 2))
);

INSERT INTO koboldcpp_launch_settings (id, sd_quant) VALUES (1, 0);
