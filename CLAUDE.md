# X Timeline Radio v2 - Claude Code Guide

## プロジェクト概要

Xの投稿をAIが収集・分析し、ラジオ番組形式で音声配信するWebアプリ。

- **フロントエンド**: React + TypeScript + Vite + Tailwind CSS
- **バックエンド**: Vercel Serverless Functions
- **AI**: Grok API（投稿収集）、Gemini API（台本生成）、OpenAI TTS（音声合成）
- **デプロイ**: Vercel

## 現在の番組タイプ

1. **X Timeline Radio** - バズ投稿を幅広くカバー
2. **政治家ウオッチ** - 政党別の政治家発言を追跡
3. **オールドメディアをぶっ壊せラジオ** - メディア批判投稿を紹介

## 主要ファイル構成

```
x-timeline-radio-v2/
├── api/                          # Vercel Serverless Functions
│   ├── collect-posts.ts          # Grok API投稿収集
│   ├── generate-full-script.ts   # Gemini台本生成 + TTS
│   └── tts.ts                    # OpenAI TTS単体
├── src/
│   ├── components/               # Reactコンポーネント
│   │   ├── AudioPlayer.tsx       # 音声再生プレイヤー
│   │   ├── SectionIndicator.tsx  # 番組進行表示
│   │   └── ShowTypeSelector.tsx  # 番組選択UI
│   ├── config/
│   │   └── showTypes.ts          # 番組タイプ定義
│   ├── store/
│   │   └── useStore.ts           # Zustand状態管理
│   └── lib/
│       └── scriptStorage.ts      # 台本保存・読み込み
├── public/
│   ├── bgm/                      # BGMファイル
│   └── shows/                    # 生成済み番組データ
└── .claude/
    └── skills/
        └── add-new-show-type.md  # 新番組追加スキル
```

## 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# Vercelデプロイ（自動）
git push  # mainブランチへのpushで自動デプロイ
```

## API環境変数（Vercel設定）

```
XAI_API_KEY=xai-xxx        # Grok API
GEMINI_API_KEY=AIzaSyxxx   # Google Gemini
OPENAI_API_KEY=sk-xxx      # OpenAI TTS
```

## 重要な実装パターン

### TTS読み上げ対策

難読漢字はGeminiプロンプトでひらがな変換を指示：

```typescript
// api/generate-full-script.ts 内のプロンプト
【重要：TTSの読み方】
- 「血税」→「けつぜい」
- 「捏造」→「ねつぞう」
- 「忖度」→「そんたく」
- 「揶揄」→「やゆ」
// ... 難読語リスト
```

### チャンク境界の頭切れ対策

```typescript
// splitIntoChunks関数
return chunks.map((chunk, index) => {
  if (index === 0) return chunk;
  return '　' + chunk;  // 全角スペースで小休止
});
```

### 番組別アイコン

```typescript
// SectionIndicator.tsx
if (showType === 'politician-watch') return '🥊';  // opening
if (showType === 'old-media-buster') return '💥';  // opening
```

## よくあるタスク

### 新番組タイプの追加

`.claude/skills/add-new-show-type.md` を参照してください。

主な変更箇所:
1. `src/config/showTypes.ts` - 番組定義
2. `api/collect-posts.ts` - Grokクエリ
3. `api/generate-full-script.ts` - 台本プロンプト
4. `src/components/SectionIndicator.tsx` - アイコン

### TTS読み上げ問題の修正

1. 問題の漢字を特定
2. `api/generate-full-script.ts`のTTSルールに追加
3. Vercelデプロイ後にテスト

### Grok投稿収集の改善

1. `api/collect-posts.ts`のクエリを調整
2. 検索キーワードをより具体的に
3. 除外条件（-spam等）でノイズ除去

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| 投稿が0件 | Grokクエリが厳しすぎる | キーワードを緩める |
| TTSが変な読み方 | 難読漢字 | ひらがな変換ルール追加 |
| 音声の頭が切れる | チャンク境界 | 全角スペース追加済み |
| 番組が長すぎる | ジャンル数過多 | 5個以下に削減 |
| APIエラー | キー期限切れ/レート制限 | Vercel環境変数確認 |

## 関連プロジェクト

- NHK News Tracker: `/Users/trudibussi/projects/gemini-cli/rss-diff-analyzer-python/`
- Policy Weather POC: `/Users/trudibussi/Downloads/gemini-cli/policy-weather-poc/`

## 注意事項

- BGMは著作権フリーのものを使用
- 政治・メディア批判は事実ベースで
- 個人攻撃にならないよう台本プロンプトで制御
- API利用料金に注意（特にOpenAI TTS）
