# レシピカードメーカー

## 起動

```bash
node server.js
```

http://localhost:5173/ を開きます。

通常の動画フレーム抽出、プレビュー、PNG/JPG保存、完成カード保存はAPIキーなしで使えます。

## Vercel

Vercelでは静的サイトとしてデプロイします。

- Framework Preset: `Other`
- Root Directory: `./`
- Build Command: `npm run build`
- Output Directory: `.`

完成カードタブの画像はブラウザ内に保存されます。別の端末や別のブラウザには同期されません。

## 完成カードタブ

ChatGPTで作成した1枚のレシピカード画像をアップロードして保存できます。

- 保存先: ブラウザ内のIndexedDB
- 画像はアプリ内の「完成カード」タブから追加、保存、削除できます。
