# Grok API 実際の収集プロセス完全ドキュメント

実行日時: 2026年1月3日 23:29 JST

---

## 概要

X Timeline Radioでは、7ジャンル × 10件 = **70件**の投稿を収集します。
このドキュメントは、実際のAPIリクエストとレスポンスを記録したものです。

---

## 1. 収集設定

### ジャンル定義

```typescript
const GENRES = [
  { id: 'trending', name: '今バズってる話題', query: '直近数時間で急激に拡散されているPost' },
  { id: 'politics', name: '政治ニュース', query: '政治、国会、選挙、政党、政策に関するPost' },
  { id: 'economy', name: '経済・マネー', query: '株価、為替、投資、企業業績、経済ニュースに関するPost' },
  { id: 'lifestyle', name: '暮らし・生活', query: '生活の知恵、家事、育児、健康、食事に関するPost' },
  { id: 'entertainment', name: 'エンタメ', query: '芸能、映画、ドラマ、音楽、ゲームに関するPost' },
  { id: 'science', name: '科学・テクノロジー', query: 'AI、宇宙、医療、IT、新技術に関するPost' },
  { id: 'international', name: '国際ニュース', query: '海外ニュース、国際情勢、外交に関するPost' },
];
```

### APIリクエスト形式

```typescript
// POST https://api.x.ai/v1/responses
{
  "model": "grok-4-1-fast-reasoning",
  "tools": [{
    "type": "x_search",
    "x_search": {
      "from_date": "2026-01-02",  // YYYY-MM-DD形式
      "to_date": "2026-01-03"
    }
  }],
  "input": "プロンプト（後述）"
}
```

---

## 2. 収集結果サマリー

### 全体統計

| 項目 | 値 |
|------|-----|
| 総投稿数 | **70件** |
| 総引用URL数 | 900件 |
| 総ツール呼び出し数 | 26回 |
| 総トークン数 | 435,911 |
| 入力トークン | 405,901 |
| 出力トークン | 30,010 |

### ジャンル別統計

| ジャンル | 件数 | 総いいね | 総RT |
|---------|------|----------|------|
| 今バズってる話題 | 10 | 101,235 | 32,017 |
| 政治ニュース | 10 | 28,309 | 6,503 |
| 経済・マネー | 10 | 6,706 | 753 |
| 暮らし・生活 | 10 | 8,207 | 1,608 |
| エンタメ | 10 | 138,738 | 27,779 |
| 科学・テクノロジー | 10 | 6,308 | 368 |
| 国際ニュース | 10 | 18,245 | 6,512 |

### ツール呼び出し内訳

| ツール名 | 呼び出し回数 |
|---------|-------------|
| x_keyword_search | 19回 |
| x_semantic_search | 7回 |

---

## 3. Grokが自動生成する検索クエリ

Grokは`x_search`ツールを使って、自動的に複数の検索を実行します。

### 検索クエリの例

```json
// キーワード検索（いいね数フィルタ）
{
  "query": "lang:ja since:2026-01-02_18:00:00_JST min_faves:100",
  "limit": 30,
  "mode": "Top"
}

// キーワード検索（RT数フィルタ）
{
  "query": "lang:ja since:2026-01-02_18:00:00_JST min_retweets:20",
  "limit": 30,
  "mode": "Top"
}

// キーワード検索（リプライ数フィルタ）
{
  "query": "lang:ja since:2026-01-02_18:00:00_JST min_replies:50",
  "limit": 30,
  "mode": "Latest"
}

// 意味的検索
{
  "query": "今バズってる日本語の話題 急拡散",
  "limit": 20,
  "from_date": "2026-01-02",
  "min_score_threshold": 0.2
}
```

### 検索の特徴

- **キーワード検索（x_keyword_search）**: X標準の検索演算子を使用
  - `lang:ja` - 日本語投稿
  - `since:` - 日時指定
  - `min_faves:` - 最小いいね数
  - `min_retweets:` - 最小RT数
  - `min_replies:` - 最小リプライ数

- **意味的検索（x_semantic_search）**: 自然言語クエリでの検索
  - より文脈を理解した検索が可能
  - `min_score_threshold` で関連度のしきい値を設定

---

## 4. 収集した投稿サンプル（各ジャンル）

### 今バズってる話題

| 投稿者 | いいね | RT | 内容 |
|--------|--------|-----|------|
| @milk_info | 11,169 | 1,912 | M!LK YouTube 50万人突破 |
| @KAGAYA_11949 | 12,888 | 2,918 | パール富士の満月写真 |
| @Colon56Nsab | 12,099 | 2,647 | ころわんライブ1日目終了 |
| @nctwishofficial | 10,723 | 2,241 | NCT WISH 神戸コンサート |

### 政治ニュース

| 投稿者 | いいね | RT | 内容 |
|--------|--------|-----|------|
| @Far_right_jpn | 5,321 | 1,589 | 日本保守党の大阪梅田街宣 |
| @kharaguchi | 3,109 | 690 | 選挙公約批判 |

### 経済・マネー

| 投稿者 | いいね | RT | 内容 |
|--------|--------|-----|------|
| @FIRE60028219 | 1,648 | 58 | 2026年株価上昇予想銘柄 |

### 暮らし・生活

| 投稿者 | いいね | RT | 内容 |
|--------|--------|-----|------|
| @inu_eat_inu | 638 | 57 | 育児漫画 |

### エンタメ

| 投稿者 | いいね | RT | 内容 |
|--------|--------|-----|------|
| @conan_anime1000 | 57,577 | 13,387 | 名探偵コナン キッドVS白馬 新ビジュアル |

### 科学・テクノロジー

| 投稿者 | いいね | RT | 内容 |
|--------|--------|-----|------|
| @OoChiyuUoO | 1,797 | 45 | Grok AI写真生成への意見 |

### 国際ニュース

| 投稿者 | いいね | RT | 内容 |
|--------|--------|-----|------|
| @SeanKy_ | 8,001 | 2,016 | 米軍ベネズエラ侵攻まとめ |
| @EmbaVEJapon | 9,399 | 4,150 | ベネズエラ大使館声明 |

---

## 5. レスポンス構造の詳細

### 完全なレスポンス構造図

```
response
├── id: "f19d3441-b9e0-987b-4172-aee6dbf2f493"
├── model: "grok-4-1-fast-reasoning"
├── status: "completed"
├── output: [
│     ├── { type: "custom_tool_call", name: "x_keyword_search", ... }  ← ツール呼び出し1
│     ├── { type: "custom_tool_call", name: "x_keyword_search", ... }  ← ツール呼び出し2
│     ├── { type: "custom_tool_call", name: "x_semantic_search", ... } ← ツール呼び出し3
│     └── { type: "message", content: [...], ... }                     ← 最終回答
│           └── content: [
│                 └── { type: "output_text", text: "...", annotations: [...] }
│                       ├── text: "```json\n{\"posts\":[...]}```"      ← ★JSON本体
│                       └── annotations: [                              ← 引用URL一覧
│                             { type: "url_citation", url: "https://x.com/..." },
│                             { type: "url_citation", url: "https://x.com/..." },
│                             ...
│                           ]
│               ]
│   ]
└── usage: {
      input_tokens: 50680,
      output_tokens: 3610,
      total_tokens: 54290,
      num_server_side_tools_used: 5
    }
```

### 重要ポイント

1. **output配列の順序**: ツール呼び出しが先、最終回答（message）が最後
2. **JSONの位置**: `output[last].content[0].text` の中に```json...```形式で含まれる
3. **annotations**: Grokが参照した実際のポストURL（100件以上含まれることも）

---

## 6. データ抽出コード（TypeScript）

```typescript
function extractPostsFromResponse(data: any, genre: string): any[] {
  const posts: any[] = [];
  let fullText = '';

  // 1. output配列を走査
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      // 2. type="message"のアイテムを探す
      if (item.type === 'message' && item.content && Array.isArray(item.content)) {
        for (const content of item.content) {
          // 3. type="output_text"からテキストを取得
          if (content.type === 'output_text' && content.text) {
            fullText += content.text;
          }
        }
      }
    }
  }

  // 4. JSONコードブロックを抽出
  let jsonText = '';
  const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonText = jsonBlockMatch[1].trim();
  }

  // 5. フォールバック: 直接JSONオブジェクトを探す
  if (!jsonText) {
    const jsonObjectMatch = fullText.match(/\{\s*"posts"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (jsonObjectMatch) {
      jsonText = jsonObjectMatch[0];
    }
  }

  // 6. JSONをパース
  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const postsArray = parsed.posts || [];

      for (const p of postsArray) {
        // 7. ポストIDを抽出
        const idMatch = p.url?.match(/status\/(\d+)/);
        const postId = idMatch ? idMatch[1] : Date.now().toString();

        posts.push({
          id: postId,
          author: {
            id: p.author_username || 'unknown',
            name: p.author_name || 'ユーザー',
            username: p.author_username || 'unknown',
          },
          text: p.text || '',
          url: p.url || `https://x.com/i/status/${postId}`,
          metrics: {
            likes: p.likes || 0,
            retweets: p.retweets || 0,
            replies: p.replies || 0,
          },
          buzzReason: p.buzz_reason,
          genre: genre,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('JSON parse error:', e);
    }
  }

  return posts.slice(0, 10);  // 最大10件
}
```

---

## 7. 処理時間とコスト

### 処理時間

| フェーズ | 時間 |
|---------|------|
| 1ジャンルあたりのAPI呼び出し | 約5-10秒 |
| 全7ジャンル収集 | 約50-70秒 |
| レート制限対策の待機時間 | 7秒（1秒×7回） |

### トークンコスト（参考）

| 項目 | トークン数 |
|------|-----------|
| 1リクエストあたり入力 | 約58,000 |
| 1リクエストあたり出力 | 約4,300 |
| 全7リクエスト合計 | 約436,000 |

※ツール呼び出しの結果（検索結果）がサーバーサイドで追加されるため、入力トークンが大きくなります。

---

## 8. 注意事項

### API制限

- **レート制限**: 連続リクエスト時は1秒以上の間隔を推奨
- **タイムアウト**: Vercel無料プランは10秒、Proプランは60秒まで

### データの信頼性

- Grokは実在の投稿を検索しますが、エンゲージメント数は検索時点のものです
- 投稿が削除されている可能性があります
- URLは `https://x.com/username/status/ID` 形式で返されます

### プロンプト設計のコツ

1. **出力形式を明確に**: JSONスキーマを例示する
2. **フィールドを限定**: 必要な情報のみ要求する
3. **実在性を強調**: 「架空の投稿を作成しないでください」と明記
