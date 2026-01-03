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

- **2つの再生モード**:
  - **シンプルモード**: 各投稿を順番に読み上げ
  - **AIスクリプトモード**: Geminiが20分間のラジオ番組スクリプトを生成

- **音声読み上げ**: OpenAI TTSで自然な日本語音声を生成
  - 複数の声から選択可能（Nova, Alloy, Echo, Fable, Onyx, Shimmer）
  - 再生速度調整（0.75x〜2.0x）

- **スクリプト保存**: 生成したスクリプトを保存して後から再生可能

- **関連投稿を見る**: Grok APIが参照した実際のX投稿を埋め込み表示
  - 10件ずつのページネーション
  - PC: 2列表示、スマホ: 1列表示
  - X埋め込みウィジェットで元投稿を確認

- **ダークモード対応**: 目に優しいダークテーマ

## 必要なAPIキー

| API | 用途 | 取得先 |
|-----|------|--------|
| X (Grok) API | 投稿収集 | https://console.x.ai/ |
| Gemini API | スクリプト生成（AIモードのみ） | https://aistudio.google.com/apikey |
| OpenAI API | 音声合成 | https://platform.openai.com/api-keys |

## 使い方

### シンプルモード
1. サイトにアクセス
2. 設定画面でGrok APIキーとOpenAI APIキーを入力
3. 「番組を開始」で投稿収集と読み上げが開始

### AIスクリプトモード
1. 設定画面で3つのAPIキーを入力
2. 「AIスクリプトモード」を選択
3. 「番組を開始」でスクリプト生成後、読み上げ開始

## 技術スタック

- **Frontend**: React + TypeScript + Vite
- **State Management**: Zustand（persist middleware で状態永続化）
- **Styling**: Tailwind CSS
- **Hosting**: Netlify (Serverless Functions)
- **APIs**:
  - Grok API (x.ai) - X投稿検索（`x_search` tool）
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
├── netlify/functions/        # Netlify Functions
│   └── (同上のAPI)
├── src/
│   ├── components/           # Reactコンポーネント
│   │   ├── Playlist.tsx      # 投稿リスト表示
│   │   ├── RelatedPosts.tsx  # 関連投稿埋め込み表示
│   │   └── ...
│   ├── store/                # Zustand状態管理
│   ├── lib/                  # ユーティリティ
│   └── types/                # TypeScript型定義
├── netlify.toml              # Netlify設定
└── package.json
```

## 更新履歴

### v2.1.0 (2026-01-04)
- 関連投稿を見る機能を追加（Grok APIが参照した全投稿を埋め込み表示）
- ダークモード対応を改善
- 投稿キャッシュにannotationsを含め、リロード時も復元可能に

### v2.0.0
- Netlifyへ移行
- AIスクリプトモードとシンプルモードの切り替え
- スクリプト保存機能

## ライセンス

MIT

## 作者

[@DarksideofNHK](https://github.com/DarksideofNHK)
