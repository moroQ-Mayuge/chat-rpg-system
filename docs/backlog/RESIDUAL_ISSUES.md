# 残課題表

このセッションおよび過去セッションの記憶（`~/.claude/.../memory/`）に残っている、
未実装・未設計・保留のままの項目をまとめたもの。**妊娠機能そのものに関する項目は
含まない**（別途 [GUIDE_pregnancy_events.md](../guides/GUIDE_pregnancy_events.md) を参照）。

## A. 衣装・見た目

| # | 内容 | 状態 |
|---|---|---|
| A1 | `belongings`（持ち物タグ）はどのレンジプリセット（`upperbody`/`cowboyshot`/`lowerbody`/`fullbody`）にも含まれない仕様。位置が不定（手に持つ・背負うなど）なため、常に個別参照 `${target1.belongings}` でのみ扱う。未解決課題ではなく確定仕様だが、理由を知らないと再度疑問が出るため記録 | 仕様として確定・記録のみ |

衣装カテゴリ・レンジプリセット・脱衣状態・露出タグ抑制は現状すべて実装済みで、
今回の調査では新規の未解決項目は見つからなかった。詳細はメモリの
`outfit_layering_and_undress_state_backlog` / `undress_state_content_and_image_tag_suppression`
を参照。

## B. キャラクター・World所属モデル

| # | 内容 | 状態 |
|---|---|---|
| B1 | キャラのWorld所属が「真のメンバーシップモデル」になっていない。明示アタッチ・部屋スロット・属性タグ一致の3経路からの導出のまま。`world_characters` 中間テーブルは追加済みだが、これは導出に足したものであって置き換えではない | 未解決（設計判断として据え置き） |
| B2 | キャラ状態（`character_statuses`）は既に世界観側で選択する形に移行済み（`world_character_statuses`、B1と同根の問題）。キャラ本体側（B1）だけが残っている | B1に統合 |

## C. イベントエンジン・UI

| # | 内容 | 状態 |
|---|---|---|
| C1 | `ChatPage.jsx` のUI全体見直し。特定の不具合ではなく、大きめのテーマ候補として過去に挙がった。**v0.3.xで着手予定と確定**（v0.2.xは衣装関連制御＋本表の残課題対応が優先） | 未着手（次バージョン確定） |
| C2 | イベント実行中、`insert_dialogue` の「生成」モードがLLM接続失敗で例外を投げても、`eventEngine/index.js` の `executeAction` 呼び出し側は個別に捕捉しない。ただし `routes/roomSessions.js` 側で `runEventEngine` 呼び出し全体が try/catch されているため、**アプリは落ちない**。該当ターンのイベントがまとめて発火しないだけに留まる | 挙動確認済み・未対応（許容範囲の可能性あり） |

## D. 画像生成・KoboldCpp設定

| # | 内容 | 状態 |
|---|---|---|
| D1 | Qwen-Image-Edit（画像編集モデル）対応。手元の3ファイルセット（`Phil2Sat/Qwen-Image-Edit-Rapid-AIO-GGUF`）は、vision patch-embeddingが5D→2つの4Dテンソルに分割された構造のため、KoboldCppのclipローダーで読み込み不能と特定済み。公式リンクのファイルセット（`QuantStack`/`mradermacher`）で同じ問題が起きるかは未検証 | 未解決（機種依存の不具合の可能性） |
| D2 | TTS（音声合成）連携 | 未設計 |
| D3 | SillyTavern形式との相互運用 | 未設計 |
| D4 | VRAM設定・量子化の個別指定（`--sdvramlimit`/`--sdoffloadcpu`/`--gpulayers`/`--lowvram`/`--quantkv`） | 実装済み。メモリファイル `koboldcpp_vram_settings_investigation.md` が「未実装」のまま古い記述で残っているため、後日そちらの更新が要る |

## E. 汎用機構の既知の制約

| # | 内容 | 状態 |
|---|---|---|
| E1 | `time_skip` アクションの加齢処理が `characters.age_real` という共有マスタ列を直接書き換える。ルート別の年齢を持つ場所が無いため、あるルートで時間跳躍すると**別ルートの同じキャラも歳を取る**。`services/timeSkip.js` にコメントで明記済み | 既知の制約（修正には設計変更が必要） |
| E2 | 「世界観から外れた指示の扱い」（`worlds.deviation_handling`: `accept`/`reinterpret`/`push_back`）が列とUIだけ用意され、`accept` 以外を選んでもプロンプトへの反映が無い。実際に使う世界観ができてから文面を詰める判断で据え置き中 | 意図的な保留 |

## F. 運用・環境

| # | 内容 | 状態 |
|---|---|---|
| F1 | ブランチ `feature/mentioned-target-and-room-world-decoupling` を `master` へff-mergeし、`origin`の`master`／同ブランチ両方へpush済み（2026-08-02） | 解消済み |
| F2 | 未参照画像の隔離機能（`services/orphanImages.js`）は実装済みだが未実行。実測519件・約500MBが対象。設定画面の「未参照画像の整理」から実行可能（削除ではなく `storage/orphan-images/` への移動で、戻せる） | 実装済み・実行は利用者操作待ち |
| F3 | `refusal_detection_enabled` が作業ツリーとリリースコピーで値が異なる（0 vs 1）。利用者判断で現状維持と決定済み | 判断済み・記録のみ |
| F4 | 世界観編集画面でReactの「uncontrolled→controlled」入力警告が発生することがある。原因はVite Fast Refreshによるフォームstateの不整合で、新規タブでの読み込みでは再現しない＝開発時のみの現象。コード修正は不要と判断済み | 調査完了・対応不要 |
