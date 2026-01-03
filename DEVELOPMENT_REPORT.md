# X Timeline Radio v2 開発レポート

## 概要

**プロジェクト名:** X Timeline Radio v2
**開発期間:** 2025年1月2日〜3日
**目的:** X（Twitter）のバズ投稿をラジオDJ風に読み上げるPWA
**技術スタック:** React + TypeScript + Vite + Tailwind CSS + Zustand

---

## 1. システムアーキテクチャ

### 1.1 全体構成

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐            │
│  │  App    │ │ Player  │ │Playlist │ │Settings │            │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘            │
│       └───────────┴───────────┴───────────┘                  │
│                         │                                    │
│                    ┌────┴────┐                               │
│                    │ Zustand │ (状態管理)                    │
│                    │  Store  │                               │
│                    └────┬────┘                               │
│                         │                                    │
│       ┌─────────────────┼─────────────────┐                  │
│       │                 │                 │                  │
│  ┌────┴────┐      ┌────┴────┐      ┌────┴────┐              │
│  │  BGM    │      │  TTS    │      │  Post   │              │
│  │ Manager │      │ Player  │      │ Cache   │              │
│  └─────────┘      └─────────┘      └─────────┘              │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │   Vite Dev Server │
                    │   (API Proxy)     │
                    └─────────┬─────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    ┌─────┴─────┐      ┌─────┴─────┐      ┌─────┴─────┐
    │ Grok API  │      │Gemini API │      │IndexedDB  │
    │ (x.ai)    │      │ (Google)  │      │ (BGM)     │
    │ x_search  │      │   TTS     │      │           │
    └───────────┘      └───────────┘      └───────────┘
```

### 1.2 ディレクトリ構造

```
x-timeline-radio-v2/
├── index.html              # エントリーポイントHTML
├── package.json            # 依存関係定義
├── vite.config.ts          # Vite設定（APIプロキシ含む）
├── tailwind.config.js      # Tailwind CSS設定
├── tsconfig.json           # TypeScript設定
├── server/
│   └── api.ts              # 開発用APIサーバー
├── api/                    # Vercel Serverless Functions用
│   ├── collect-posts.ts    # Post収集API
│   └── generate-audio.ts   # 音声生成API
├── src/
│   ├── main.tsx            # Reactエントリーポイント
│   ├── App.tsx             # メインアプリコンポーネント
│   ├── index.css           # グローバルスタイル
│   ├── components/
│   │   ├── Player.tsx      # 再生コントロール・プログレスバー
│   │   ├── Playlist.tsx    # 全投稿一覧・任意位置再生
│   │   ├── CurrentPost.tsx # 現在再生中の投稿表示
│   │   ├── SegmentList.tsx # セグメント一覧
│   │   └── Settings.tsx    # API設定・BGM管理
│   ├── store/
│   │   └── useStore.ts     # Zustand状態管理
│   ├── lib/
│   │   ├── bgm.ts          # BGM再生管理
│   │   ├── bgmStorage.ts   # IndexedDB BGMストレージ
│   │   └── genres.ts       # ジャンル定義
│   └── types/
│       └── index.ts        # TypeScript型定義
└── public/
    └── radio.svg           # ファビコン
```

---

## 2. 主要機能の実装詳細

### 2.1 バズPost収集（Grok API x_search）

**ファイル:** `api/collect-posts.ts`, `src/lib/genres.ts`

#### ジャンル定義

```typescript
// src/lib/genres.ts
export const GENRES: GenreConfig[] = [
  { id: 'trending', name: '今バズってる', icon: '🔥', query: '日本 バズ OR 話題' },
  { id: 'politics', name: '政治', icon: '🏛️', query: '日本 政治 国会 OR 選挙 OR 政策' },
  { id: 'economy', name: '経済', icon: '💹', query: '日本 経済 株価 OR 円安 OR 景気' },
  { id: 'lifestyle', name: '暮らし', icon: '🏠', query: '日本 生活 OR 暮らし 話題' },
  { id: 'entertainment', name: 'エンタメ', icon: '🎬', query: '日本 芸能 OR ドラマ OR 映画' },
  { id: 'science', name: '科学・テック', icon: '🔬', query: '日本 AI OR 技術 OR 科学' },
  { id: 'international', name: '国際', icon: '🌍', query: '国際 ニュース OR 海外' },
];

export const PROGRAM_SEGMENTS: Genre[] = [
  'trending', 'politics', 'economy', 'lifestyle',
  'entertainment', 'science', 'international',
];

export const POSTS_PER_SEGMENT = 10;  // 各セグメント10投稿
```

#### API実装

```typescript
// api/collect-posts.ts
export default async function handler(req, res) {
  const { genre, apiKey } = req.body;
  const genreConfig = GENRES.find(g => g.id === genre);

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-3-latest',
      messages: [{ role: 'user', content: `${genreConfig.query}についてバズっている投稿を検索` }],
      tools: [{
        type: 'function',
        function: {
          name: 'x_search',
          parameters: { query: genreConfig.query, count: 10 }
        }
      }],
    }),
  });

  // x_searchの結果をパースしてBuzzPost[]形式で返却
}
```

#### 収集フロー

1. 番組開始時、7ジャンルを**並行**でAPI呼び出し（`Promise.all`）
2. 各ジャンル10投稿を収集（計70投稿）
3. 結果を30分間localStorageにキャッシュ
4. キャッシュがあれば再利用（API節約）

### 2.2 音声生成（Gemini TTS）

**ファイル:** `api/generate-audio.ts`

```typescript
// api/generate-audio.ts
export default async function handler(req, res) {
  const { script, apiKey } = req.body;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: script }] }],
        generationConfig: {
          response_modalities: ['AUDIO'],
          speech_config: {
            voice_config: { prebuilt_voice_config: { voice_name: 'Aoede' } }
          }
        }
      }),
    }
  );

  const data = await response.json();
  const audioBase64 = data.candidates[0].content.parts[0].inlineData.data;

  res.json({ audio: audioBase64, mimeType: 'audio/mp3' });
}
```

### 2.3 プリフェッチによる低レイテンシー再生

**ファイル:** `src/store/useStore.ts`

#### 実装戦略（投稿間プリフェッチ）

```
時間軸 →
─────────────────────────────────────────────────────────────
イントロ生成  ├──────┤
1番目生成     ├──────┤
              ↓ 並行完了
イントロ再生          ├────────────┤
2番目生成             ├──────┤     ← 再生中に生成開始
                      ↓ 生成完了
1番目再生                         ├────────────┤
3番目生成                         ├──────┤
                                  ↓
2番目再生                                      ├────────────┤
─────────────────────────────────────────────────────────────
```

#### セグメント間プリフェッチ（v2で追加）

```
セグメントA最後の投稿再生中:
─────────────────────────────────────────────────────────────
10番目再生        ├────────────────────┤
アウトロ生成      ├──────┤
セグメントB
 イントロ生成     ├──────┤              ← 並行生成開始
 1番目生成        ├──────┤              ← 並行生成開始
                          ↓ 全て完了
アウトロ再生                            ├──────────┤
                                        ↓ 即座に再生
セグメントBイントロ                                ├────────────┤
─────────────────────────────────────────────────────────────
```

#### 実装コード

```typescript
// src/store/useStore.ts - playSegment関数
for (let i = startPostIndex; i < segment.posts.length; i++) {
  // 次の音声を先読み開始
  if (i < segment.posts.length - 1) {
    nextAudioPromise = generateAudioUrl(nextScript, apiKey);
  } else {
    // 最後の投稿時: アウトロ + 次セグメントを並行先読み
    nextAudioPromise = generateAudioUrl(outroScript, apiKey);

    if (nextSegment && nextSegment.posts.length > 0) {
      nextSegmentPrefetch = Promise.all([
        generateAudioUrl(nextIntroScript, apiKey),
        generateAudioUrl(nextFirstPostScript, apiKey),
      ]).then(([introUrl, firstPostUrl]) => ({ introUrl, firstPostUrl }));
    }
  }

  await playAudioUrl(currentAudioUrl);
  currentAudioUrl = await nextAudioPromise;
}

// セグメント終了後、プリフェッチデータを使って次を再生
if (nextSegmentPrefetch && nextSegment) {
  const prefetchedData = await nextSegmentPrefetch;
  get().playSegmentWithPrefetch(nextSegmentIndex, prefetchedData);
}
```

#### playSegmentWithPrefetch関数

プリフェッチ済みのイントロと1番目投稿を使って遅延なく次セグメントを開始:

```typescript
playSegmentWithPrefetch: async (segmentIndex, prefetchedData) => {
  // プリフェッチ済みイントロを即座に再生
  await playAudioUrl(prefetchedData.introUrl);

  // プリフェッチ済み1番目を使って通常ループ開始
  let currentAudioUrl = prefetchedData.firstPostUrl;
  // ... 以降は通常の投稿間プリフェッチで継続
}
```

### 2.4 BGM管理システム

**ファイル:** `src/lib/bgm.ts`, `src/lib/bgmStorage.ts`

#### IndexedDBストレージ

```typescript
// src/lib/bgmStorage.ts
const DB_NAME = 'x-timeline-radio-bgm';
const STORE_NAME = 'bgm-tracks';
const MAX_TRACKS = 5;

export interface BgmTrack {
  id: string;
  name: string;
  blob: Blob;
  addedAt: number;
}

class BgmStorage {
  async addTrack(file: File): Promise<BgmTrack | null> { ... }
  async removeTrack(id: string): Promise<void> { ... }
  async getAllTracks(): Promise<BgmTrack[]> { ... }
  async getRandomTrack(): Promise<BgmTrack | null> { ... }
}
```

#### BGMマネージャー

```typescript
// src/lib/bgm.ts
class BgmManager {
  private audioElement: HTMLAudioElement | null = null;
  private isPlaying = false;
  private config = { source: 'uploaded', volume: 0.15 };

  async start() {
    const track = await bgmStorage.getRandomTrack();
    this.audioElement = new Audio(URL.createObjectURL(track.blob));
    this.audioElement.loop = true;
    await this.audioElement.play();
  }

  // TTS再生中は音量を50%に下げる（ダッキング）
  async duck() {
    await this.fadeOut(300);  // 50%まで
  }

  async unduck() {
    await this.fadeIn(200);   // 元の音量に
  }
}
```

### 2.5 状態管理（Zustand + Persist）

**ファイル:** `src/store/useStore.ts`

#### 永続化設定

```typescript
export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 状態定義...
    }),
    {
      name: 'x-timeline-radio-v2',
      partialize: (state) => ({
        apiConfig: state.apiConfig,
        program: state.program,
        currentSegmentIndex: state.currentSegmentIndex,
        currentPostIndex: state.currentPostIndex,
      }),
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        isPlaying: false,
        isInitializing: false,
        stopRequested: false,
      }),
    }
  )
);
```

#### 主要アクション

| アクション | 説明 |
|-----------|------|
| `initializeProgram()` | 番組初期化、7ジャンル並行収集 |
| `playSegment(index, startPost?)` | セグメント再生、開始位置指定可 |
| `playSegmentWithPrefetch(index, data)` | プリフェッチ済みデータで次セグメント再生 |
| `playFromPosition(seg, post)` | 任意位置から再生開始 |
| `startPlayback()` | 現在位置から再生開始 |
| `stopPlayback()` | 再生停止（BGMも停止） |
| `nextSegment()` | 次セグメントへ移行 |
| `reset()` | 番組リセット |
| `clearCache()` | 投稿キャッシュクリア |

---

## 3. UI/UXコンポーネント

### 3.1 App.tsx - メインレイアウト

```
┌────────────────────────────────────────────┐
│ 🎙️ X Timeline Radio v2  [プレイリスト][リセット]│
├────────────────────────────────────────────┤
│                                            │
│  [プレイリスト] ← 展開時表示               │
│                                            │
│  ┌─ Player ─────────────────────────────┐  │
│  │ ON AIR              🔥 今バズってる   │  │
│  │ 📊 15 / 70 Posts            21%      │  │
│  │ ████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │  │
│  │         [⏸️]  [⏭️]                    │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ┌─ CurrentPost ────────────────────────┐  │
│  │ @username                             │  │
│  │ 投稿内容...                           │  │
│  │ ❤️ 1.2万  🔄 3,456  💬 789  🔗 元投稿 │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ┌─ SegmentList ────────────────────────┐  │
│  │ 🔥 今バズってる    ▶ 再生中  10件    │  │
│  │ 🏛️ 政治           ⏳ 待機中  10件    │  │
│  │ 💹 経済           ⏳ 待機中  10件    │  │
│  │ ...                                   │  │
│  └──────────────────────────────────────┘  │
│                                            │
│  ▶ ⚙️ 設定                                │
│                                            │
└────────────────────────────────────────────┘
```

### 3.2 Playlist.tsx - 投稿一覧

**機能:**
- 全セグメント・全投稿を一覧表示
- 各投稿に「ここから」ボタン → 任意位置から再生
- 現在再生中の投稿をハイライト
- 元投稿へのリンク（@username、🔗 元投稿）

```typescript
// クリックで任意位置から再生
const handlePlayFrom = (segmentIndex: number, postIndex: number) => {
  playFromPosition(segmentIndex, postIndex);
};
```

### 3.3 Settings.tsx - BGMアップロード

**機能:**
- APIキー設定（Grok, Gemini）
- BGMファイルアップロード（最大5曲）
- アップロード済みトラック一覧・削除
- 投稿キャッシュクリア

---

## 4. データフロー

### 4.1 番組開始フロー

```
ユーザー: [番組スタート] クリック
    │
    ▼
initializeProgram()
    │
    ├─→ キャッシュチェック
    │       └─ あり → キャッシュから読み込み
    │       └─ なし → 7ジャンル並行でAPI呼び出し
    │
    ▼
セグメント作成 (7個 × 10投稿)
    │
    ▼
playSegment(0) 開始
    │
    ├─→ BGM開始（アップロード済みの場合）
    │
    ├─→ イントロ + 1番目投稿を並行生成
    │
    ▼
再生ループ開始
    │
    ├─→ 現在の投稿を再生
    │       ├─→ BGMダッキング
    │       └─→ TTS再生
    │
    ├─→ 次の投稿を並行生成（プリフェッチ）
    │
    ├─→ currentPostIndex更新 → UI更新
    │
    └─→ 全投稿完了 → アウトロ → nextSegment()
```

### 4.2 投稿テキスト処理

```typescript
// URL除去
function removeUrls(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]+/g, '')  // URL削除
    .replace(/\s+/g, ' ')               // 連続スペース整理
    .trim();
}

// スクリプト生成
function generatePostScript(post: BuzzPost, index: number, total: number): string {
  const cleanText = removeUrls(post.text);
  return `${index}番目の投稿です。${post.author.name}さんからの投稿。「${cleanText}」...`;
}
```

---

## 5. 解決した技術的課題

### 5.1 投稿間レイテンシー

**問題:** 各投稿の読み上げ間に数秒の待ち時間が発生

**解決策:** プリフェッチ方式
- 現在の投稿を再生開始すると同時に、次の投稿の音声生成を開始
- 再生終了時には次の音声が生成完了済み
- 待ち時間ほぼゼロに

### 5.2 二重再生防止

**問題:** 再生ボタンを2回押すと音声が重複再生

**解決策:**
```typescript
if (isPlaying) {
  console.log('Already playing, ignoring...');
  return;
}
set({ isPlaying: true });
```

### 5.3 画面リフレッシュ時の状態消失

**問題:** 進捗更新時に画面が「番組スタート」に戻る

**解決策:**
1. `program`, `currentSegmentIndex`, `currentPostIndex`を永続化
2. `hasProgramContent`で堅牢な表示判定
3. セレクターベースのstate取得で不要な再レンダリング防止

```typescript
const hasProgramContent = program && program.segments && program.segments.length > 0;
```

### 5.4 BGM音量調整

**問題:** TTS再生中にBGMが大きすぎる / 小さすぎる

**解決策:** ダッキング機能
```typescript
// TTS開始時: 音量を50%に
async duck() {
  await this.fadeOut(300);  // targetVolume = config.volume * 0.5
}

// TTS終了時: 元の音量に
async unduck() {
  await this.fadeIn(200);
}
```

### 5.5 セグメント間遅延

**問題:** コーナー移行時（例：「今バズってる」→「政治」）に数秒の待ち時間

**解決策:** セグメント間プリフェッチ
- 最後の投稿再生中に、次セグメントのイントロ + 1番目投稿を並行生成開始
- `playSegmentWithPrefetch()` 関数でプリフェッチ済みデータを使って即座に再生

```typescript
// 最後の投稿時に次セグメントを先読み
if (nextSegment && nextSegment.posts.length > 0) {
  nextSegmentPrefetch = Promise.all([
    generateAudioUrl(nextIntroScript, apiKey),
    generateAudioUrl(nextFirstPostScript, apiKey),
  ]).then(([introUrl, firstPostUrl]) => ({ introUrl, firstPostUrl }));
}

// 次セグメントへ移行時
if (nextSegmentPrefetch && nextSegment) {
  const prefetchedData = await nextSegmentPrefetch;
  get().playSegmentWithPrefetch(nextSegmentIndex, prefetchedData);
}
```

### 5.6 再生状態の不整合

**問題:** 再生中なのに「停止中」と表示される

**原因:** セグメント完了時に `isPlaying: false` を設定していた

**解決策:**
1. セグメント完了時、次のセグメントがある場合は `isPlaying` を維持
2. `stopPlayback()` 関数で明示的に停止
3. `stopRequested` フラグで再生ループを中断

```typescript
// セグメント完了時
const hasNextSegment = nextSegmentPrefetch && nextSegment;
set((state) => ({
  ...state,
  // 次のセグメントがある場合はisPlayingを維持
  ...(hasNextSegment ? {} : { isPlaying: false }),
}));

// 停止関数
stopPlayback: () => {
  if (bgmManager.getIsPlaying()) {
    bgmManager.stop();
  }
  set({ stopRequested: true, isPlaying: false });
},
```

---

## 6. 依存パッケージ

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.4.7"
  },
  "devDependencies": {
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "@vitejs/plugin-react": "^4.2.1",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.2.2",
    "vite": "^5.0.8"
  }
}
```

---

## 7. 今後の課題・デプロイ

### 7.1 未完了タスク

- [ ] Vercelデプロイ
- [ ] PWA対応（Service Worker, manifest.json）
- [ ] オフライン対応

### 7.2 デプロイ手順（予定）

```bash
# 1. Vercel CLIインストール
npm i -g vercel

# 2. デプロイ
vercel

# 3. 環境変数設定
# - Vercel ダッシュボードでAPIキーを設定（オプション）
```

### 7.3 Vercel設定

```json
// vercel.json（必要に応じて作成）
{
  "builds": [
    { "src": "api/*.ts", "use": "@vercel/node" },
    { "src": "package.json", "use": "@vercel/static-build" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/api/$1" },
    { "src": "/(.*)", "dest": "/$1" }
  ]
}
```

---

## 8. 開発メモ

### 使用したAPI

| API | 用途 | エンドポイント |
|-----|------|---------------|
| Grok x_search | バズ投稿検索 | `https://api.x.ai/v1/chat/completions` |
| Gemini TTS | 音声生成 | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts` |

### ローカル開発

```bash
cd x-timeline-radio-v2
npm install
npm run dev
# → http://localhost:5173
```

### ビルド

```bash
npm run build
# → dist/ に出力
```

---

## 9. 現在のステータス

### α版完成（2025年1月3日）

以下の機能が動作確認済み:

- ✅ 7ジャンル並行Post収集（Grok x_search）
- ✅ TTS音声生成（Gemini TTS）
- ✅ 投稿間プリフェッチ（遅延最小化）
- ✅ セグメント間プリフェッチ（コーナー移行の遅延解消）
- ✅ BGMアップロード・再生・ダッキング
- ✅ プレイリスト表示・任意位置再生
- ✅ 再生/停止コントロール
- ✅ プログレスバー（投稿単位更新）
- ✅ 状態永続化（画面リフレッシュ対策）

### 残タスク

- [ ] Vercelデプロイ
- [ ] PWA対応（Service Worker, manifest.json）
- [ ] オフライン対応
- [ ] 再生速度調整
- [ ] 音声キャッシュ機能

---

**作成日:** 2025年1月3日
**最終更新:** 2025年1月3日
**作成者:** Claude Code (claude-opus-4-5-20250101)
