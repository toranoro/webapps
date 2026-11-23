BUDOKAI / ANIMAL BUDOKAI - 配布用ビルド一式 (dist)

【配信方法】
このフォルダ内のファイル一式をそのまま静的Webサーバー（Apache, Nginx, Netlify, Cloudflare Pages, GitHub Pages等）にアップロードしてください。
Three.js は vendor/three.module.min.js としてローカル同梱済みのため、外部CDNへの依存なく動作します。
またビルドごとに全JSモジュール・CSSへ自動キャッシュバスト（?v=...）を付与しています。

※ Apache で .htaccess による 500 エラーが出る場合は、Apache側の AllowOverride 設定で
   FileInfo が許可されていない可能性があります。その場合は dist/.htaccess を削除しても
   HTML/JS側のキャッシュ対策で動作します。

【ローカル環境での動作確認方法（Windows）】
dist フォルダ内で以下を実行し、ブラウザで http://localhost:8080/ を開いてください。
  py -3 -m http.server 8080
（※ ES Modules仕様のため、file:// での直接起動はブラウザのCORS制限により動作しません）