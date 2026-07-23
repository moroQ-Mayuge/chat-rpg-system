import { db } from '../connection.js';

export function getOutfitExposureTagSettings() {
  return db.prepare('SELECT * FROM outfit_exposure_tag_settings WHERE id = 1').get();
}

export function updateOutfitExposureTagSettings({
  open_tag,
  pull_tag,
  lift_tag,
  aside_tag,
  topless_tag,
  bottomless_tag,
  completely_nude_tag,
  breast_out_tag,
}) {
  db.prepare(
    `UPDATE outfit_exposure_tag_settings
     SET open_tag = ?, pull_tag = ?, lift_tag = ?, aside_tag = ?,
         topless_tag = ?, bottomless_tag = ?, completely_nude_tag = ?, breast_out_tag = ?
     WHERE id = 1`,
  ).run(
    open_tag ?? '',
    pull_tag ?? '',
    lift_tag ?? '',
    aside_tag ?? '',
    topless_tag ?? '',
    bottomless_tag ?? '',
    completely_nude_tag ?? '',
    breast_out_tag ?? '',
  );
  return getOutfitExposureTagSettings();
}
