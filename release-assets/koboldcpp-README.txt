KoboldCpp のセットアップについて
================================

このフォルダ（koboldcpp）には、以下を別途ダウンロードして配置してください。
サイズが大きいため、本パッケージには含まれていません。

1. KoboldCpp本体
   https://github.com/LostRuins/koboldcpp/releases
   から Windows用の koboldcpp.exe をダウンロードし、このフォルダ直下に配置してください。

2. テキスト生成用モデル（.gguf形式）
   例：Hugging Face (https://huggingface.co/) で GGUF形式のモデルを探し、
   このフォルダの下に models\llm\ フォルダを作成して配置してください。
   （日本語ロールプレイ対応をうたっているモデルを推奨）

3. 画像生成用モデル（.safetensors形式、SDXLベース推奨）
   同様に Hugging Face や Civitai などで入手し、
   models\sd\ フォルダを作成して配置してください。

配置後、このフォルダにある start-koboldcpp.bat をダブルクリックすると、
配置したモデルファイルを自動検出してKoboldCppを起動します。

（手動で起動する場合のコマンド例）
  koboldcpp.exe --model models\llm\<モデルファイル名>.gguf --sdmodel models\sd\<モデルファイル名>.safetensors --port 5001 --contextsize 8192 --gpulayers 999

起動後、ChatRPG側の .env にある KOBOLD_BASE_URL が
http://127.0.0.1:5001 になっていることを確認してください（既定値のままでOK。
start-koboldcpp.batもポート5001で起動します）。

なお、ChatRPGの「設定」画面からも起動できます（KoboldCppが未接続のときに
「KoboldCppを起動」ボタンが表示されます）。こちらはChatRPGサーバーと
同じPC上でのみ機能します。

KoboldCppを起動した状態で「セットアップして起動.bat」を実行すると、
ChatRPG側の準備と起動が行われます。
