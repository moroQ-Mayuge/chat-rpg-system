KoboldCpp のセットアップについて
================================

このフォルダ（koboldcpp）には、以下を別途ダウンロードして配置してください。
サイズが大きいため、本パッケージには含まれていません。

  1. KoboldCpp本体（koboldcpp.exe）をこのフォルダ直下に配置
  2. テキスト生成用モデル（.gguf）を models\llm\ に配置
  3. 画像生成用モデル（.safetensors、任意）を models\sd\ に配置

入手先URL・PCスペック別のおすすめモデル・詳しい手順は、
一つ上の階層にある README.md の「クイックスタート」の章を参照してください。

配置後、このフォルダにある start-koboldcpp.bat をダブルクリックすると、
配置したモデルファイルを自動検出してKoboldCppを起動します。

起動後、ChatRPG側の .env にある KOBOLD_BASE_URL が
http://127.0.0.1:5001 になっていることを確認してください（既定値のままでOK。
start-koboldcpp.batもポート5001で起動します）。

なお、ChatRPGの「設定」画面からも起動できます（KoboldCppが未接続のときに
「KoboldCppを起動」ボタンが表示されます）。こちらはChatRPGサーバーと
同じPC上でのみ機能します。

KoboldCppを起動した状態で「セットアップして起動.bat」を実行すると、
ChatRPG側の準備と起動が行われます。
