# CLAUDE.md

## npmインストール後の手順（重要）

`npm install`/`npm ci`のたびに`npm rebuild better-sqlite3 sharp --workspace server --ignore-scripts=false`を続けて実行すること（`.npmrc`の`ignore-scripts=true`のため自動ビルドされない）。手順・「rebuildしたのに直らない」場合の原因（`--ignore-scripts=false`の付け忘れ）は[README.mdのトラブルシューティング](README.md#トラブルシューティング)を正本として参照。新しいネイティブ依存を追加した場合は、README側のコマンドにも追記すること。

## npm設定の方針

- `.npmrc`の`min-release-age=7`・`ignore-scripts=true`は変更・削除しない（意図的なセキュリティ設定）。緩める必要が生じた場合はユーザーに確認してから変更する。
