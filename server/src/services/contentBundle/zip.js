import AdmZip from 'adm-zip';

// manifest.json + images/ under a single zip — the portable "carry my
// character/world/room between installs" bundle format. imageEntries is
// [{ zipPath, buffer }]; readZip's readImage looks entries back up by the
// same zipPath recorded in the manifest.
export function buildZip(manifest, imageEntries) {
  const zip = new AdmZip();
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'));
  for (const { zipPath, buffer } of imageEntries) {
    zip.addFile(zipPath, buffer);
  }
  return zip.toBuffer();
}

export function readZip(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const manifestEntry = zip.getEntry('manifest.json');
  if (!manifestEntry) throw new Error('invalid_bundle_missing_manifest');
  const manifest = JSON.parse(manifestEntry.getData().toString('utf-8'));
  return {
    manifest,
    readImage: (zipPath) => {
      if (!zipPath) return null;
      const entry = zip.getEntry(zipPath);
      return entry ? entry.getData() : null;
    },
  };
}
