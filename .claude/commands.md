# X Timeline Radio v2 - よく使うコマンド

## 開発サーバー

```bash
# ローカル開発（Vercel Functions含む）
cd /Users/trudibussi/Downloads/gemini-cli/x-timeline-radio-v2
vercel dev

# フロントエンドのみ
npm run dev:client

# ビルド
npm run build
```

## APIテスト

```bash
# 投稿収集テスト
curl -X POST http://localhost:3000/api/collect-posts \
  -H "Content-Type: application/json" \
  -d '{"showType": "x-timeline-radio", "genre": "trending"}'

# 番組タイプ別テスト
curl -X POST http://localhost:3000/api/collect-posts \
  -H "Content-Type: application/json" \
  -d '{"showType": "politician-watch", "genre": "ruling-ldp"}'

curl -X POST http://localhost:3000/api/collect-posts \
  -H "Content-Type: application/json" \
  -d '{"showType": "old-media-buster", "genre": "nhk"}'
```

## デプロイ

```bash
# プレビューデプロイ
vercel

# 本番デプロイ
vercel --prod

# Git経由（自動）
git add . && git commit -m "message" && git push
```

## 環境変数

```bash
# ローカル用設定
cp .env.example .env.local

# Vercel環境変数確認
vercel env ls

# 環境変数追加
vercel env add XAI_API_KEY
vercel env add GEMINI_API_KEY
vercel env add OPENAI_API_KEY
```

## トラブルシューティング

```bash
# ポート使用中の確認
lsof -i :3000

# プロセス強制終了
pkill -f "vercel dev"

# node_modules再インストール
rm -rf node_modules && npm install

# Vercelキャッシュクリア
vercel dev --clear-cache
```

## ファイル確認

```bash
# 主要ファイル
ls -la api/           # APIエンドポイント
ls -la src/config/    # 番組設定
ls -la src/components/  # UIコンポーネント
ls -la public/bgm/    # BGMファイル
ls -la public/shows/  # 生成済み番組

# ログ確認
cat /Users/trudibussi/Downloads/gemini-cli/x-timeline-radio-v2/vercel.log
```
