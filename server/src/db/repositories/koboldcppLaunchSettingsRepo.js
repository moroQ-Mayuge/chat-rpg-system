import { db } from '../connection.js';

export function getLaunchSettings() {
  return db.prepare('SELECT * FROM koboldcpp_launch_settings WHERE id = 1').get();
}

export function updateLaunchSettings({ sd_quant, llm_model_path, sd_model_path }) {
  db.prepare(
    'UPDATE koboldcpp_launch_settings SET sd_quant = ?, llm_model_path = ?, sd_model_path = ? WHERE id = 1',
  ).run(sd_quant, llm_model_path || null, sd_model_path || null);
  return getLaunchSettings();
}
