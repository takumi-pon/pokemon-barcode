# pokemon-barcode

iPhone Safariの背面カメラでJAN/EANバーコードをライブ認識する、GitHub Pages向けの最小スキャナーです。

## 仕様

- Quagga2 1.12.1
- EAN-13 / EAN-8をライブ認識
- EANチェックデジットを検証
- 同じコードを1.6秒以内に3回検出したときだけ確定
- 確定したコードをGAS Webアプリへ送信
- 返ってきたポケモンの画像、日本語名、No.、タイプを表示
- カメラ映像はサーバーへ送信しない

## 使い方

1. iPhoneのSafariでGitHub PagesのURLを開く
2. 「カメラをはじめる」を押す
3. カメラの利用を許可する
4. 商品バーコードを黄色い枠に入れる

カメラ利用にはHTTPSが必要です。GitHub PagesはHTTPSで配信されます。
