# ChatRPG

複数のAIキャラクターとチャットできる、完全ローカル動作の1人用Webアプリ。KoboldCpp（ローカルLLM＋ローカルStable Diffusion）を使い、会話に応じたシーン・表情画像を動的に生成する。詳しい仕様は [SPEC.md](SPEC.md) を参照。

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

テキストモデルと画像生成モデルの両方をロードして起動しておく（例）：

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
