# CLAUDE.md

## npmインストール後の手順（重要）

このリポジトリの`.npmrc`は`ignore-scripts=true`を設定している（2026-08-06、npm supply-chain攻撃対策）。このため`npm install`/`npm ci`のたびに`better-sqlite3`と`sharp`のネイティブバイナリが自動ビルドされない。

`npm install`または`npm ci`を実行したら、必ず続けて以下を実行すること:

```bash
npm rebuild better-sqlite3 sharp --workspace server --ignore-scripts=false
```

**`--ignore-scripts=false`を付け忘れると`npm rebuild`は「rebuilt dependencies successfully」と表示されるだけで実際には何もビルドしない空撃ちになる**（`.npmrc`の`ignore-scripts=true`が`npm rebuild`内部のinstallスクリプト実行にも及ぶため。2026-08-09、release-assets/setup-and-start.batの検証で発覚）。付け忘れに気づかず「rebuildしたのに直らない」場合はまずこのフラグの有無を疑うこと。

これを忘れるとサーバー起動時に`better-sqlite3`のネイティブモジュール未ビルドエラー、または画像処理（`sharp`）関連の実行時エラーになる。新しいネイティブ依存を追加した場合も同様にこのリストへ追記して`npm rebuild`すること。

## npm設定の方針

- `.npmrc`の`min-release-age=7`・`ignore-scripts=true`は変更・削除しない（意図的なセキュリティ設定）。緩める必要が生じた場合はユーザーに確認してから変更する。
