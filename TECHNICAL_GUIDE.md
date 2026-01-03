# X Timeline Radio v2 - 技術ガイド

## 概要

X Timeline Radioは、Xのバズ投稿を収集し、AIでラジオ番組スクリプトを生成、TTSで音声化するWebアプリケーション。

## アーキテクチャ

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Grok API  │────▶│  Gemini API │────▶│ OpenAI TTS  │
│  (投稿収集)  │     │(スクリプト生成)│     │  (音声合成)  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────┐
│              Vercel Serverless Functions            │
│  - /api/collect-posts                               │
│  - /api/generate-full-script                        │
│  - /api/generate-audio-openai                       │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────┐
│              React Frontend (Vite)                  │
│  - Zustand (状態管理)                               │
│  - Tailwind CSS (スタイリング)                      │
└─────────────────────────────────────────────────────┘
```

---

## 1. Grok API - X投稿の収集

### エンドポイント
```
POST https://api.x.ai/v1/responses
```

### 重要: x_search ツールの使用

Grok APIは `tools` パラメータで `x_search` を指定することで、Xの投稿を検索できる。

```typescript
const response = await fetch('https://api.x.ai/v1/responses', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: 'grok-4-1-fast-reasoning',
    tools: [{
      type: 'x_search',
      x_search: {
        from_date: '2026-01-01',  // YYYY-MM-DD形式
        to_date: '2026-01-03',
      }
    }],
    input: prompt,
  }),
});
```

### モデル選択
- `grok-4-1-fast-reasoning` - 高速な推論モデル（推奨）
- `grok-4-1` - 標準モデル

### プロンプト設計のポイント

```
あなたはXのバズ投稿キュレーターです。

【検索条件】
- ジャンル: ${genreConfig.name}
- 条件: ${genreConfig.query}
- 直近6時間以内に投稿された日本語のPost
- 以下の「盛り上がり指標」が高いものを優先:
  1. いいね数が多い（100以上推奨）
  2. リツイート/引用が多い
  3. リプライが活発
  4. 短時間で急激に伸びている

【出力形式】
以下のJSON形式で10件出力してください:
{
  "posts": [
    {
      "author_username": "実際のユーザー名",
      "text": "投稿内容",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "retweets": 数値,
      "buzz_reason": "なぜバズっているか一言"
    }
  ]
}
```

### レスポンス構造とデータ抽出

Grok APIのレスポンスは以下の構造:

```typescript
{
  output: [
    {
      type: 'message',
      content: [
        {
          type: 'output_text',
          text: '...(JSON含むテキスト)...'
        }
      ]
    }
  ]
}
```

**抽出コード:**
```typescript
function extractPostsFromResponse(data: any): any[] {
  let fullText = '';

  // output配列からテキストを抽出
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && item.content) {
        for (const content of item.content) {
          if (content.type === 'output_text' && content.text) {
            fullText += content.text;
          }
        }
      }
    }
  }

  // JSONブロックを抽出
  const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    const parsed = JSON.parse(jsonBlockMatch[1].trim());
    return parsed.posts || [];
  }

  return [];
}
```

---

## 2. Gemini API - スクリプト生成

### エンドポイント
```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}
```

### リクエスト構造

```typescript
const response = await fetch(GEMINI_API_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.85,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',  // JSON出力を強制
    },
  }),
});
```

### プロンプト設計の重要ポイント

#### TTS向けテキスト最適化

```
【重要：難読漢字のひらがな化】
- ✅「こうごうしい」 ← 「神々しい」は誤読されやすい
- ✅「おごそかな」 ← 「厳かな」

【重要：英語・アルファベットのカタカナ化】
- ✅「エックスタイムラインラジオ」 ← 「X Timeline Radio」
- ✅「エックス」 ← 「X」（SNSの名前）

【重要：ユーザー名の読み方】
努力目標：ユーザー名はできるだけカタカナで読みやすく変換
- 例：「DEATHDOL_NOTE」→「デスドルノートさん」
- 例：「narumi」→「ナルミさん」

【重要：話題転換時の間】
話題が変わる場面では「　」（全角スペース）を入れて間を作る
- ✅ 「素敵ですね。　さて、話題を変えて経済の話題です。」
```

### レスポンスからのJSON抽出

```typescript
function extractJSON(text: string): any {
  // コードブロック内のJSONを探す
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }

  // 直接JSONオブジェクトを探す
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error('No JSON found in response');
}
```

---

## 3. OpenAI TTS - 音声合成

### エンドポイント
```
POST https://api.openai.com/v1/audio/speech
```

### gpt-4o-mini-tts モデル（推奨）

`instructions` パラメータで発話スタイルを細かく制御可能。

```typescript
const response = await fetch('https://api.openai.com/v1/audio/speech', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini-tts',
    input: script,
    voice: 'nova',  // alloy, echo, fable, onyx, nova, shimmer
    speed: 1.0,     // 0.25 - 4.0
    response_format: 'mp3',
    instructions: JAPANESE_INSTRUCTIONS,  // 発話スタイル指示
  }),
});
```

### Instructions パラメータの設計

```typescript
const JAPANESE_INSTRUCTIONS = `日本のラジオ情報番組のDJとして、リスナーに語りかけるように話してください。

【発話スタイル】
明るく親しみやすいトーンで、適度な抑揚をつけて単調にならないように。
句読点では自然なポーズを取り、聞きやすいテンポを保つ。
重要な情報や数字は少し強調する。

【表現のニュアンス】
「！」の文は少し元気よく。
「？」の文は語尾を軽く上げる。
「…」や「、、」は少し長めの間を取る。
新しいトピックに移る際はわずかにトーンを変えて場面転換を表現する。

【ポーズと呼吸】
文の区切りでは自然な息継ぎを入れる。
長い文は意味のまとまりで区切って読む。
全角スペース「　」がある箇所では、話題の転換として少し長めの間を取る。

【読み方】
英語・アルファベットはカタカナ読み。
人名・固有名詞は丁寧に、はっきりと発音。

ロボット的な単調読み上げは避け、実際のラジオ番組のような生き生きとした発話を。`;
```

### モデルフォールバック

gpt-4o-mini-tts が利用できない場合は tts-1 にフォールバック:

```typescript
let response = await fetch(OPENAI_TTS_URL, {
  // gpt-4o-mini-tts でリクエスト
});

if (!response.ok && response.status === 400) {
  // tts-1 にフォールバック（instructionsパラメータなし）
  response = await fetch(OPENAI_TTS_URL, {
    body: JSON.stringify({
      model: 'tts-1',
      input: script,
      voice: voice,
      speed: speed,
      response_format: 'mp3',
      // instructionsは tts-1 では使用不可
    }),
  });
}
```

---

## 4. フロントエンド実装

### 状態管理 (Zustand)

```typescript
// 音声の即座停止用グローバル変数
let currentAudioElement: HTMLAudioElement | null = null;

function stopCurrentAudio() {
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement.src = '';
    currentAudioElement = null;
  }
}

// 音声再生関数
async function playAudioUrl(audioUrl: string, speed: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const audioElement = new Audio(audioUrl);
    audioElement.playbackRate = speed;

    // 停止用に保存
    currentAudioElement = audioElement;

    audioElement.onended = () => {
      currentAudioElement = null;
      URL.revokeObjectURL(audioUrl);
      resolve();
    };

    audioElement.play().catch(reject);
  });
}

// 停止アクション
stopPlayback: () => {
  stopCurrentAudio();  // 即座に音声停止
  set({ stopRequested: true, isPlaying: false });
}
```

### テキスト前処理

```typescript
function cleanTextForTTS(text: string): string {
  return text
    // 敬称前のスペース除去
    .replace(/\s+さん/g, 'さん')

    // 三点リーダーの正規化
    .replace(/\.{3,}/g, '…')
    .replace(/、{2,}/g, '、、')  // 長めのポーズとして残す

    // 連続する感嘆符の簡略化
    .replace(/！{2,}/g, '！')
    .replace(/？{2,}/g, '？')

    // 句読点前の半角スペース除去
    .replace(/\s+([。、！？])/g, '$1')

    // 全角スペースは保持（話題転換の間として使用）
    .trim();
}
```

---

## 5. Vercel デプロイ設定

### vercel.json

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "functions": {
    "api/*.ts": {
      "maxDuration": 60  // Proプランで60秒まで
    }
  }
}
```

### 注意事項
- 無料プラン: maxDuration は 10秒が上限
- Proプラン: maxDuration は 60秒まで設定可能
- Gemini APIのスクリプト生成は10秒以上かかることがあるため、Proプラン推奨

---

## 6. API キー

| API | 取得先 | 用途 |
|-----|--------|------|
| Grok API | https://x.ai/api | X投稿の検索・収集 |
| Gemini API | https://aistudio.google.com/apikey | スクリプト生成 |
| OpenAI API | https://platform.openai.com/api-keys | TTS音声合成 |

---

## 7. トラブルシューティング

### Grok APIでエラーが出る
- `x_search` ツールの日付形式は `YYYY-MM-DD`
- モデル名は `grok-4-1-fast-reasoning` または `grok-4-1`

### TTSの読み上げが不自然
- スクリプト生成プロンプトで難読漢字のひらがな化を指示
- 全角スペースで話題転換の間を作る
- `instructions` パラメータで発話スタイルを詳細に指定

### Vercelでタイムアウト
- Proプランにアップグレード
- `maxDuration: 60` を設定

### 音声が止まらない
- `stopCurrentAudio()` でグローバル変数の音声要素を直接停止
- `stopRequested` フラグだけでなく、`pause()` を即座に呼ぶ
