import { db } from '../connection.js';

export function getLaunchSettings() {
  return db.prepare('SELECT * FROM koboldcpp_launch_settings WHERE id = 1').get();
}

export function updateLaunchSettings({
  sd_quant,
  llm_model_path,
  sd_model_path,
  sd_lora_path,
  sd_lora_multiplier,
  sd_architecture,
  sd_vae_path,
  sd_clip1_path,
  context_size,
  sd_vram_limit_mb,
  sd_offload_cpu,
  gpu_layers,
  low_vram,
  quant_kv,
  log_capture_enabled,
  blas_batch_size,
}) {
  db.prepare(
    `UPDATE koboldcpp_launch_settings
     SET sd_quant = ?, llm_model_path = ?, sd_model_path = ?, sd_lora_path = ?, sd_lora_multiplier = ?,
         sd_architecture = ?, sd_vae_path = ?, sd_clip1_path = ?, context_size = ?,
         sd_vram_limit_mb = ?, sd_offload_cpu = ?, gpu_layers = ?, low_vram = ?, quant_kv = ?, log_capture_enabled = ?,
         blas_batch_size = ?
     WHERE id = 1`,
  ).run(
    sd_quant,
    llm_model_path || null,
    sd_model_path || null,
    sd_lora_path || null,
    sd_lora_multiplier ?? 1.0,
    sd_architecture || 'sd',
    sd_vae_path || null,
    sd_clip1_path || null,
    context_size || 8192,
    sd_vram_limit_mb || null,
    sd_offload_cpu ? 1 : 0,
    gpu_layers ?? 999,
    low_vram ? 1 : 0,
    quant_kv || '',
    log_capture_enabled ? 1 : 0,
    blas_batch_size ?? 512,
  );
  return getLaunchSettings();
}
