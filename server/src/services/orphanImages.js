import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db/connection.js';
import { config } from '../config.js';

// どこからも参照されていない画像ファイルの整理。
//
// 実測(2026-07-31)では947件中519件・約500MBが未参照だった。キャラや部屋を消しても
// 画像ファイルは残り続けるため、遊ぶほど溜まっていく。
//
// **消さない。** storage/images の外の隔離フォルダへ、フォルダ構造を保ったまま
// 移動するだけにしてある。500MBを不可逆に消す操作を既定にはできないし、
// 移動なら同一ドライブ内のリネームで一瞬で済み、戻すのもコピーするだけで済む。

// 画像の保存先(storage/images)と、その隣に置く隔離先(storage/orphan-images)。
// IMAGE_STORAGE_DIR を変えても隣に付いていくよう、保存先の親から組み立てる。
const IMAGES_ROOT = config.imageStorageDir;
const STORAGE_ROOT = path.dirname(IMAGES_ROOT);
const QUARANTINE_ROOT = path.join(STORAGE_ROOT, 'orphan-images');

// DBが持っているのは "/images/characters/x.png" という配信用のパス。
// ディスク上は <storage>/images/characters/x.png なので、storage を頭に付ける。
function toDiskPath(storedValue) {
  return path.resolve(STORAGE_ROOT, `.${storedValue}`);
}

// 参照列を決め打ちにしない。一覧から1つ漏らすと生きている画像を巻き込むので、
// 全テーブルの全列を実行時に走査して "/images/" を含む値を集める。DBは小さく、
// 将来列が増えても自動で追随する。
export function collectReferencedPaths() {
  const referenced = new Set();
  const columnsScanned = [];
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
    .all()
    .map((r) => r.name);

  for (const table of tables) {
    for (const column of db.prepare(`PRAGMA table_info("${table}")`).all()) {
      let rows;
      try {
        rows = db.prepare(`SELECT "${column.name}" AS v FROM "${table}" WHERE "${column.name}" LIKE '%/images/%'`).all();
      } catch {
        continue; // 走査できない型の列は飛ばす
      }
      if (rows.length === 0) continue;
      columnsScanned.push(`${table}.${column.name}`);
      for (const row of rows) {
        if (typeof row.v === 'string') referenced.add(toDiskPath(row.v).toLowerCase());
      }
    }
  }
  return { referenced, columnsScanned };
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

// minAgeMinutes より新しいファイルは対象外にする。生成した直後でまだDBに書かれて
// いないファイルを巻き込まないため——画像生成はファイルを先に書く。
export function findOrphanImages({ minAgeMinutes = 60 } = {}) {
  const { referenced, columnsScanned } = collectReferencedPaths();
  const cutoff = Date.now() - minAgeMinutes * 60 * 1000;

  const files = [];
  let totalBytes = 0;
  let skippedRecent = 0;
  const byDir = {};

  for (const full of walkFiles(IMAGES_ROOT)) {
    if (referenced.has(path.resolve(full).toLowerCase())) continue;
    const stat = fs.statSync(full);
    if (stat.mtimeMs > cutoff) {
      skippedRecent += 1;
      continue;
    }
    const relative = path.relative(IMAGES_ROOT, full);
    files.push({ relative, size: stat.size, mtime: stat.mtime.toISOString() });
    totalBytes += stat.size;
    const top = relative.split(path.sep)[0];
    byDir[top] = (byDir[top] ?? 0) + 1;
  }

  files.sort((a, b) => b.size - a.size);
  return {
    files,
    count: files.length,
    total_bytes: totalBytes,
    skipped_recent: skippedRecent,
    by_dir: byDir,
    referenced_count: referenced.size,
    columns_scanned: columnsScanned,
    quarantine_root: QUARANTINE_ROOT,
  };
}

// 移動元・移動先の両方が想定のルート配下にあることを、解決後のパスで確かめる。
// シンボリックリンクなどで外を指していた場合に、storage の外を触らせない。
function assertInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(target);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`保存先の外を指しています: ${resolved}`);
  }
  return resolved;
}

function timestampFolder() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// 隔離の実行。実行ごとにタイムスタンプのフォルダを作り、その中に
// storage/images からの相対パスをそのまま再現する(characters/x.png →
// orphan-images/20260731-1200/characters/x.png)。どこにあったファイルかが
// 見た目で分かり、戻すときはフォルダごとコピーし直せばよい。
export function quarantineOrphanImages({ minAgeMinutes = 60 } = {}) {
  const scan = findOrphanImages({ minAgeMinutes });
  const batch = timestampFolder();
  const batchRoot = path.join(QUARANTINE_ROOT, batch);

  const moved = [];
  const failed = [];
  for (const file of scan.files) {
    const from = assertInside(IMAGES_ROOT, path.join(IMAGES_ROOT, file.relative));
    const to = assertInside(QUARANTINE_ROOT, path.join(batchRoot, file.relative));
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.renameSync(from, to);
      moved.push(file.relative);
    } catch (err) {
      failed.push({ file: file.relative, message: err.message });
    }
  }

  return {
    batch,
    batch_path: batchRoot,
    moved_count: moved.length,
    moved_bytes: scan.total_bytes,
    failed,
    skipped_recent: scan.skipped_recent,
    by_dir: scan.by_dir,
  };
}
