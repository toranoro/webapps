中村将棋道場  配布パッケージ (Ver 0.6.0)
================================================

【内容】
  index.html        ゲーム本体（これを開く）
  manifest.json     PWA（アプリ化）マニフェスト
  sw.js             PWA用パススルーService Worker（キャッシュ事故ゼロ）
  assets/           アプリアイコン（SVG / PNG）
  css/ js/          スタイル・プログラム
  manual/index.html オンラインマニュアル
  .htaccess / _headers / web.config
                    サーバー配信時のキャッシュ無効化設定（使うサーバーの分だけ有効）

【使い方】
 1. パソコン(Chrome): dist フォルダの index.html をダブルクリック（サーバー不要）。
 2. iPad(Safari) / Android(Chrome):
    dist フォルダの中身をそのまま Web サーバーにアップロードし、そのURLを開く。
    - Apache(レンタルサーバー等): .htaccess がそのまま有効
    - Netlify / Cloudflare Pages: _headers が有効
    - IIS: web.config が有効
    - ローカルPCで試す場合は、PCで簡易サーバーを立て同一Wi-Fiから http://PCのIP:ポート/ を開く
      (例: Python がある環境で  python -m http.server 8000  ※ dist フォルダ内で実行)
 3. 更新時は、ファイルを上書きして再読み込みするだけ（キャッシュは使いません）。

【全画面表示 ＆ アプリとしてインストール】
  - 対局画面の操作パネルに「全画面」ボタンを追加（ワンタップで全画面化）。
  - Android Chrome: メニュー「︙」から「アプリをインストール」（または「ホーム画面に追加」）を選ぶと、
    本物のアプリとして全画面で動作します。
  - iPad Safari: 共有ボタン「⎋」から「ホーム画面に追加」を選ぶと、専用全画面アプリとして起動します。

【キャッシュ対策】
  - index.html の meta タグ(no-cache)
  - CSS / JS を毎回 ?_=タイムスタンプ 付きで読み込み
  - サーバー設定ファイル(上記)
  - Service Worker はパススルー型（キャッシュストレージは一切使用せず通信を素通りさせるためキャッシュ事故ゼロ）

【動作環境】
  PC: Chrome / iPad: Safari / Android: Chrome

【dist の再生成】
  開発フォルダ側で  powershell -ExecutionPolicy Bypass -File build-dist.ps1
