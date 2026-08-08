# ChatRPG

複数のAIキャラクターとチャットできる、完全ローカル動作の1人用Webアプリ。KoboldCpp（ローカルLLM＋ローカルStable Diffusion）を使い、会話に応じたシーン・表情画像を動的に生成する。詳しい仕様は [docs/SPEC.md](docs/SPEC.md) を参照。

## 必要なもの

- Node.js 20以降
- [KoboldCpp](https://github.com/LostRuins/koboldcpp)（テキスト生成用LLM＋画像生成用SDモデルをロードして起動しておく）

## セットアップ

```bash
npm install
cp .env.example .env   # 必要に応じて値を編集
npm run migrate         # DBスキーマを作成
```

`.env` の主な項目：

| 変数 | 説明 |
|---|---|
| `PORT` | サーバーのポート（既定 3001） |
| `HOST` | バインドするホスト（既定 `0.0.0.0`。LAN公開に必要） |
| `KOBOLD_BASE_URL` | KoboldCppのURL（既定 `http://127.0.0.1:5001`） |
| `DB_PATH` | SQLiteファイルのパス |
| `IMAGE_STORAGE_DIR` | 生成・アップロード画像の保存先 |

## KoboldCppの起動

テキストモデルと画像生成モデルの両方をロードして起動しておく。次のいずれかの方法が使える。

- **`koboldcpp/start-koboldcpp.bat`をダブルクリック**：`koboldcpp/`直下（またはこのリポジトリの構成に合わせて`koboldcpp/models/`）の実行ファイル、`koboldcpp/models/llm/`の`.gguf`、`koboldcpp/models/sd/`の`.safetensors`を自動検出して起動する
- **設定画面（`/settings`）の「KoboldCppを起動」ボタン**：ChatRPGサーバーと同じPC上で上記と同じ自動検出ロジックによりkoboldcpp.exeをデタッチ起動する（KoboldCpp未接続時のみ表示）
- **手動起動**（例）：
  ```bash
  koboldcpp.exe --model <text-model>.gguf --sdmodel <sd-model>.safetensors --port 5001 --contextsize 8192 --gpulayers 999
  ```

## 開発サーバーの起動

```bash
npm run dev
```

- サーバー（Express, API）: `http://localhost:3001`
- クライアント（Vite）: `http://localhost:5180`

ブラウザでは `http://localhost:5180` を開く。設定画面（`/settings`）でKoboldCppの接続状況と、同じLAN内のスマホ・タブレットからアクセスするためのURLを確認できる。

## 本番相当の単一プロセス起動

```bash
npm run build            # client/dist を生成
npm run dev:server       # または node server/src/index.js
```

`client/dist` が存在する場合、サーバーが `PORT`（既定 3001）でクライアントも配信する。

## その他のコマンド

```bash
npm run dev:server   # サーバーのみ起動
npm run dev:client   # クライアントのみ起動
```

## 別フォルダ・別環境への配布（デモデータごと移行）

`data/`（SQLite本体）と`storage/images/`（アップロード・生成済み画像）は`.gitignore`対象のため、gitのクローンだけでは付いてこない。既存のキャラ・部屋・イベントなどのデータごと別フォルダへ移す場合の手順。

1. **プロジェクトフォルダをコピー**（`node_modules/`と`koboldcpp/`は除く。サイズが大きく、後述の通り別途用意するため）
   - 最低限コピーが必要なもの：リポジトリ一式 ＋ 以下のgit管理外フォルダ・ファイル
     - `data/`（`chatrpg.sqlite`本体。DBの実データ）
     - `storage/images/`（キャラ画像・生成済みシーン画像など）
     - `.env`（作成済みの場合。接続先やパスの設定を引き継ぐ）
2. **新しいフォルダで依存パッケージをインストール**
   ```bash
   npm install
   ```
3. **KoboldCppの用意**
   - モデルファイルは容量が大きいため、`koboldcpp/`フォルダは通常コピーしない。次のいずれかで対応する：
     - 元の場所で起動済みのKoboldCppをそのまま使う（`.env`の`KOBOLD_BASE_URL`で接続先を指定するだけでよく、複数のアプリフォルダから同じKoboldCppに接続できる）
     - 新しい場所にも`koboldcpp/`（実行ファイル＋モデル）を別途配置する。その場合`.claude/launch.json`のkoboldcpp設定は相対パス（`koboldcpp/models/...`）前提なので、配置に合わせて調整する
4. **マイグレーションを確認**
   ```bash
   npm run migrate
   ```
   `data/chatrpg.sqlite`をコピー済みでも安全に実行できる（適用済みのマイグレーションは`schema_migrations`テーブルにより自動でスキップされ、未適用分だけ追加適用される）。
5. **起動して確認**
   ```bash
   npm run dev
   ```
   ブラウザでキャラ一覧・部屋一覧に既存データが表示されること、設定画面（`/settings`）でKoboldCppが接続中になっていることを確認する。

> **同じPCで元の環境と同時に起動する場合の注意**：`.env`を作成していないとサーバーは既定の`PORT=3001`で起動するため、元の環境がすでに動作中だとポートが衝突し `EADDRINUSE` エラーで起動に失敗する。同時に動かしたい場合は、新しい環境の`.env`で`PORT`を別の値（例：`3002`）に変更する。クライアント（Vite, 既定5180）は使用中なら自動的に別ポートへ切り替わるため対応不要。

## 実装状況・ロードマップ

[docs/ROADMAP.md](docs/ROADMAP.md) を参照（リリース済み／未リリース機能の一覧、未着手項目）。

## 変更履歴

[CHANGELOG.md](CHANGELOG.md) を参照。
