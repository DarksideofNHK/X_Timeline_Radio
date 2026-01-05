# Skill: ローカル環境での番組テスト

ローカル環境で番組生成をテストし、問題なければVercelにデプロイするワークフロー。

## 前提条件

### 必要なツール
- Node.js 18+
- Vercel CLI（`npm i -g vercel`）
- 各種APIキー

### 環境変数の設定

```bash
# .env.local を作成（.envではなく.env.localを使用）
cp .env.example .env.local
```

`.env.local`に以下を設定:
```
XAI_API_KEY=xai-xxxxx      # Grok API
GEMINI_API_KEY=AIzaSyxxxxx # Google Gemini
OPENAI_API_KEY=sk-xxxxx    # OpenAI TTS
```

---

## ローカル開発サーバーの起動

### 方法1: Vercel CLI（推奨）

```bash
cd /Users/trudibussi/Downloads/gemini-cli/x-timeline-radio-v2

# Vercel CLIでローカル開発サーバー起動
vercel dev

# ポート指定する場合
vercel dev --listen 3000
```

アクセス: http://localhost:3000

### 方法2: Viteのみ（フロントエンドのみ）

```bash
npm run dev:client
```

※ APIエンドポイントは動作しない（Vercel Functionsのため）

---

## 番組生成のテスト手順

### Step 1: サーバー起動

```bash
cd /Users/trudibussi/Downloads/gemini-cli/x-timeline-radio-v2
vercel dev
```

### Step 2: ブラウザでアクセス

1. http://localhost:3000 を開く
2. 番組タイプを選択（例: politician-watch）
3. 「番組を生成」ボタンをクリック
4. 生成完了を待つ（1-3分）

### Step 3: 確認ポイント

#### 投稿収集（Grok API）
- [ ] 各ジャンルで投稿が取得できているか
- [ ] 投稿数が0でないか
- [ ] 投稿内容が適切か（スパムなし）

#### 台本生成（Gemini API）
- [ ] 各セクションのスクリプトが生成されているか
- [ ] TTSルールでひらがな変換されているか
- [ ] 投稿が適切に引用されているか

#### 音声再生（OpenAI TTS）
- [ ] 音声が正常に再生されるか
- [ ] 読み上げが自然か
- [ ] 難読漢字が正しく読まれるか

---

## APIエンドポイントの個別テスト

### 投稿収集のテスト

```bash
# curlでテスト
curl -X POST http://localhost:3000/api/collect-posts \
  -H "Content-Type: application/json" \
  -d '{"showType": "politician-watch", "genre": "ruling-ldp"}'
```

### 台本生成のテスト

```bash
curl -X POST http://localhost:3000/api/generate-full-script \
  -H "Content-Type: application/json" \
  -d '{
    "showType": "politician-watch",
    "posts": [{"username": "test", "text": "テスト投稿"}]
  }'
```

### TTSのテスト

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text": "これはテストです", "voice": "shimmer"}' \
  --output test.mp3
```

---

## ログの確認

### Vercel CLIのログ

ターミナルにリアルタイムでログが表示される:
- `[Grok]` - 投稿収集のログ
- `[Gemini]` - 台本生成のログ
- `[TTS]` - 音声合成のログ

### ブラウザのDevTools

1. F12でDevToolsを開く
2. Networkタブで API呼び出しを確認
3. Consoleタブでエラーを確認

---

## よくある問題と対処

### 問題: APIキーエラー

```
Error: Invalid API key
```

**対処**: `.env.local`のキーを確認、Vercel CLIを再起動

### 問題: CORS エラー

```
Access-Control-Allow-Origin
```

**対処**: `vercel dev`を使用（Viteのみでは発生する）

### 問題: タイムアウト

```
Function execution timed out
```

**対処**:
- ジャンル数を減らしてテスト
- 1ジャンルずつテスト

### 問題: 投稿が0件

**対処**:
- Grokクエリのキーワードを緩める
- 時間範囲を広げる（from_date/to_date）

---

## 本番デプロイ前のチェックリスト

### 機能テスト
- [ ] 全番組タイプで生成できる
- [ ] 全ジャンルで投稿が取得できる
- [ ] 音声が正常に再生される
- [ ] UIが正しく表示される

### 品質テスト
- [ ] TTSの読み上げが自然
- [ ] 難読漢字がひらがなに変換されている
- [ ] 投稿の引用が適切

### パフォーマンステスト
- [ ] 生成時間が3分以内
- [ ] 音声ファイルサイズが適切

---

## Vercelへのデプロイ

### 自動デプロイ（推奨）

```bash
git add .
git commit -m "feat: 新機能追加"
git push origin main
```

mainブランチへのpushで自動デプロイ。

### 手動デプロイ

```bash
vercel --prod
```

### プレビューデプロイ

```bash
vercel
```

プレビューURLが発行され、本番に影響なくテスト可能。

---

## Claude Codeでのテスト実行例

```bash
# 1. サーバー起動（バックグラウンド）
cd /Users/trudibussi/Downloads/gemini-cli/x-timeline-radio-v2
vercel dev &

# 2. 少し待つ
sleep 5

# 3. APIテスト
curl -s http://localhost:3000/api/collect-posts \
  -X POST -H "Content-Type: application/json" \
  -d '{"showType": "x-timeline-radio", "genre": "trending"}' | jq .

# 4. サーバー停止
pkill -f "vercel dev"
```

---

## 環境変数の管理

### ローカル用
- `.env.local` - ローカル専用（gitignoreに含める）

### Vercel本番用
```bash
# 環境変数の確認
vercel env ls

# 環境変数の追加
vercel env add XAI_API_KEY

# 環境変数の削除
vercel env rm XAI_API_KEY
```

### 現在の環境変数

| 変数名 | 用途 | 取得先 |
|--------|------|--------|
| XAI_API_KEY | Grok API | https://console.x.ai/ |
| GEMINI_API_KEY | Gemini API | https://aistudio.google.com/ |
| OPENAI_API_KEY | OpenAI TTS | https://platform.openai.com/ |

---

## 関連スキル

- `add-new-show-type.md` - 新番組タイプの追加
- `fix-tts-reading.md` - TTS読み上げ問題の修正
