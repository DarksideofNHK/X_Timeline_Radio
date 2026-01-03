# X Timeline Radio

Xで話題の投稿を自動収集し、AIがラジオ番組風のスクリプトを生成。音声合成で聴けるWebアプリです。

## デモ

https://x-timeline-radio.vercel.app

## 機能

- **7ジャンルの投稿収集**: Grok APIを使用してXからバズ投稿を自動収集
  - 今バズってる話題
  - 政治ニュース
  - 経済・マネー
  - 暮らし・生活
  - エンタメ
  - 科学・テクノロジー
  - 国際ニュース

- **AIスクリプト生成**: Gemini 3 Flashが20分間のラジオ番組スクリプトを作成
  - オープニング
  - 7つのコーナー（各ジャンル）
  - エンディング

- **音声読み上げ**: OpenAI TTSで自然な日本語音声を生成

- **スクリプト保存**: 生成したスクリプトを保存して後から再生可能

## 必要なAPIキー

| API | 用途 | 取得先 |
|-----|------|--------|
| X (Grok) API | 投稿収集 | https://console.x.ai/ |
| Gemini API | スクリプト生成 | https://aistudio.google.com/apikey |
| OpenAI API | 音声合成 | https://platform.openai.com/api-keys |

## 使い方

1. サイトにアクセス
2. 設定画面で3つのAPIキーを入力
3. 「投稿を収集」ボタンで各ジャンルの投稿を取得
4. 「AIスクリプトモード」を選択して「スクリプト生成」
5. 再生ボタンで音声を聴く

## 技術スタック

- **Frontend**: React + TypeScript + Vite
- **State Management**: Zustand
- **Styling**: Tailwind CSS
- **Hosting**: Vercel (Serverless Functions)
- **APIs**:
  - Grok API (x.ai) - X投稿検索
  - Gemini API (Google) - スクリプト生成
  - OpenAI TTS API - 音声合成

## ローカル開発

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev

# ビルド
npm run build
```

## プロジェクト構造

```
x-timeline-radio-v2/
├── api/                      # Vercel Serverless Functions
│   ├── collect-posts.ts      # Grok APIで投稿収集
│   ├── generate-full-script.ts # Geminiでスクリプト生成
│   └── generate-audio-openai.ts # OpenAI TTSで音声生成
├── src/
│   ├── components/           # Reactコンポーネント
│   ├── store/                # Zustand状態管理
│   ├── lib/                  # ユーティリティ
│   └── types/                # TypeScript型定義
├── vercel.json               # Vercel設定
└── package.json
```

## ライセンス

MIT

## 作者

[@DarksideofNHK](https://github.com/DarksideofNHK)
