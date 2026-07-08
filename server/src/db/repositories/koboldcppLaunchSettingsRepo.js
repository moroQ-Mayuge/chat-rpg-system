import { db } from '../connection.js';

export function getLaunchSettings() {
  return db.prepare('SELECT * FROM koboldcpp_launch_settings WHERE id = 1').get();
}

export function updateLaunchSettings({ sd_quant }) {
  db.prepare('UPDATE koboldcpp_launch_settings SET sd_quant = ? WHERE id = 1').run(sd_quant);
  return getLaunchSettings();
}
