# Grok API x_search レスポンスサンプル

実際のAPIリクエストとレスポンスの記録（2026年1月3日取得）

---

## リクエスト

### エンドポイント
```
POST https://api.x.ai/v1/responses
```

### ヘッダー
```
Content-Type: application/json
Authorization: Bearer {YOUR_API_KEY}
```

### リクエストボディ

```json
{
  "model": "grok-4-1-fast-reasoning",
  "tools": [{
    "type": "x_search",
    "x_search": {
      "from_date": "2026-01-02",
      "to_date": "2026-01-03"
    }
  }],
  "input": "あなたはXのバズ投稿キュレーターです。\n\n【検索条件】\n- ジャンル: 今バズってる話題\n- 条件: 直近数時間で急激に拡散されているPost\n- 直近6時間以内に投稿された日本語のPost\n- 以下の「盛り上がり指標」が高いものを優先:\n  1. いいね数が多い（100以上推奨）\n  2. リツイート/引用が多い\n  3. リプライが活発\n  4. 短時間で急激に伸びている\n\n【出力形式】\n以下のJSON形式で5件出力してください:\n\n```json\n{\n  \"posts\": [\n    {\n      \"author_username\": \"実際のユーザー名\",\n      \"author_name\": \"表示名\",\n      \"text\": \"投稿内容\",\n      \"url\": \"https://x.com/username/status/投稿ID\",\n      \"likes\": 数値,\n      \"retweets\": 数値,\n      \"replies\": 数値,\n      \"buzz_reason\": \"なぜバズっているか一言\"\n    }\n  ]\n}\n```\n\n【重要】\n- 必ず実在するPostのURLを含めてください\n- 架空の投稿を作成しないでください"
}
```

---

## レスポンス

### 完全なレスポンス構造

```json
{
  "created_at": 1767449587,
  "id": "f19d3441-b9e0-987b-4172-aee6dbf2f493",
  "model": "grok-4-1-fast-reasoning",
  "object": "response",
  "output": [
    {
      "call_id": "xs_call_58684062",
      "input": "{\"query\":\"lang:ja since:2026-01-02_18:00:00_JST min_faves:100\",\"limit\":30,\"mode\":\"Top\"}",
      "name": "x_keyword_search",
      "type": "custom_tool_call",
      "status": "completed"
    },
    {
      "call_id": "xs_call_38481282",
      "input": "{\"query\":\"lang:ja since:2026-01-02_18:00:00_JST min_retweets:20\",\"limit\":30,\"mode\":\"Top\"}",
      "name": "x_keyword_search",
      "type": "custom_tool_call",
      "status": "completed"
    },
    {
      "call_id": "xs_call_31169483",
      "input": "{\"query\":\"lang:ja since:2026-01-02_18:00:00_JST min_replies:50\",\"limit\":30,\"mode\":\"Latest\"}",
      "name": "x_keyword_search",
      "type": "custom_tool_call",
      "status": "completed"
    },
    {
      "call_id": "xs_call_52578255",
      "input": "{\"query\":\"lang:ja since:2026-01-02_18:00:00_JST filter:has_engagement min_faves:50\",\"limit\":30,\"mode\":\"Top\"}",
      "name": "x_keyword_search",
      "type": "custom_tool_call",
      "status": "completed"
    },
    {
      "call_id": "xs_call_36859976",
      "input": "{\"query\":\"今バズってる日本語の話題 急拡散\",\"limit\":20,\"from_date\":\"2026-01-02\",\"min_score_threshold\":0.2}",
      "name": "x_semantic_search",
      "type": "custom_tool_call",
      "status": "completed"
    },
    {
      "content": [
        {
          "type": "output_text",
          "text": "（下記参照）",
          "annotations": [
            {
              "type": "url_citation",
              "url": "https://x.com/i/status/2007300888075833367"
            }
          ]
        }
      ],
      "role": "assistant",
      "type": "message",
      "status": "completed"
    }
  ],
  "usage": {
    "input_tokens": 50680,
    "output_tokens": 3610,
    "total_tokens": 54290,
    "num_server_side_tools_used": 5
  },
  "status": "completed"
}
```

### output_text の内容（抽出対象）

```json
{
  "posts": [
    {
      "author_username": "Genshin_7",
      "author_name": "原神（Genshin）公式",
      "text": "#原神_キャラ生誕祭\n【#放浪者生誕祭2026】\nここ最近、僕がどこに泊まっているか気になるって？\nナド・クライには泊まれる場所なんていくらでもある。僕にだって、行くてあてはあるのさ。\nあと、ここには僕の誕生日を知っている人がいないからね。騒がしい連中が飛び出してきて、「サプライズ」とやらを仕掛けてくる心配もない。良いと思わないかい？\n君はもう来てしまっているし、まぁ、五月蠅いのは君一人で十分だ。",
      "url": "https://x.com/Genshin_7/status/2007300888075833367",
      "likes": 89159,
      "retweets": 23827,
      "replies": 351,
      "buzz_reason": "原神キャラ生誕祭でファン爆発的反応"
    },
    {
      "author_username": "nitamusement777",
      "author_name": "遊技機総合商社 （株）NIT",
      "text": "✨新年プレゼントキャンペーン第三弾✨\n３日連続プレゼントキャンペーン‼️\n\n３日目は急きょフォロワー3万人突破記念に切り替えさせて頂きます‼️‼️\n\nフォロワー3万人突破ありがとうございます‼️次は5万人突破でお祭り開催‼️\n\n今回3万人突破記念を祝しまして、抽選で1名様にマギレコの実機プレゼント🎁‼️\n\n📮応募方法📮\n① @nitamusement777をフォロー✔️\n② このポストをリポスト＆いいね👍\n※3日連続応募で当選確率2倍✌️\n\n⚠️応募条件⚠️\n① 当選された場合は賞品到着に必ず当選ポストをお願いします。\n② こちらの実機は転売不可となりますので、ご不要になりましたら当店で無料回収いたします。\n\n🗓️応募期間🗓️\n2026年1月3日〜1月8日23時59分",
      "url": "https://x.com/nitamusement777/status/2007395921110483455",
      "likes": 11587,
      "retweets": 11492,
      "replies": 329,
      "buzz_reason": "新年プレゼントキャンペーンで爆拡散"
    },
    {
      "author_username": "milk_info",
      "author_name": "M!LK OFFICIAL",
      "text": "🎉🎊🎉\nM!LK 公式 #YouTube\nチャンネル登録者数\n50万人突破しました!!!!!\n\nみなさま本当に\nありがとうございます、、、！\n\nこれからも\nみ！るきーずのみなさまに\n笑顔を届けられるように\n頑張ります🩷💙❤️🤍💛\nhttps://www.youtube.com/@MILK_2014 \n#MILK",
      "url": "https://x.com/milk_info/status/2007448452557377948",
      "likes": 6874,
      "retweets": 1326,
      "replies": 44,
      "buzz_reason": "YouTubeチャンネル50万人突破祝賀"
    },
    {
      "author_username": "Colon56Nsab",
      "author_name": "ころんくん@すとぷり",
      "text": "ころわん1日目終わったぁぁあ！！✨\n\nこれからリハーサルだぁああ✨\n\n今日はエゴサいっぱいするタイムなので明日か次の放送とかでいっぱいお写真見せます！！✨\n\n素敵な思い出をありがとう🩵",
      "url": "https://x.com/Colon56Nsab/status/2007420499991900215",
      "likes": 11810,
      "retweets": 2603,
      "replies": 939,
      "buzz_reason": "ころわんライブ1日目報告でリプライ爆発"
    },
    {
      "author_username": "KAGAYA_11949",
      "author_name": "KAGAYA",
      "text": "今年最初の満月。\n富士山の山頂から昇る姿、パール富士です。\n（先ほど、静岡県にて撮影）\n2026年が皆様にとって良い年になりますように。",
      "url": "https://x.com/KAGAYA_11949/status/2007423756826734797",
      "likes": 12022,
      "retweets": 2749,
      "replies": 35,
      "buzz_reason": "美しいパール富士写真でシェア急増"
    }
  ]
}
```

---

## レスポンス構造の解説

### 1. ツール呼び出し履歴

Grokは自動的に複数の検索を実行します：

| ツール名 | 説明 |
|---------|------|
| `x_keyword_search` | キーワード検索（いいね数、RT数、リプライ数でフィルタ） |
| `x_semantic_search` | 意味的検索（自然言語クエリ） |

### 2. output配列の構造

```
output[]
  ├── type: "custom_tool_call"  ← ツール呼び出しの記録
  │     ├── name: "x_keyword_search" / "x_semantic_search"
  │     ├── input: "{検索クエリJSON}"
  │     └── status: "completed"
  │
  └── type: "message"           ← 最終回答
        └── content[]
              └── type: "output_text"
                    ├── text: "..."      ← ★ここにJSONが含まれる
                    └── annotations[]    ← 引用URL一覧
```

### 3. annotations（引用）

`annotations`配列には、Grokが参照した実際のポストURLが含まれます：

```json
{
  "type": "url_citation",
  "url": "https://x.com/i/status/2007300888075833367"
}
```

---

## データ抽出のポイント

### TypeScript実装例

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

  // JSONコードブロックを抽出
  const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    const parsed = JSON.parse(jsonBlockMatch[1].trim());
    return parsed.posts || [];
  }

  // フォールバック: 直接JSONオブジェクトを探す
  const jsonObjectMatch = fullText.match(/\{\s*"posts"\s*:\s*\[[\s\S]*?\]\s*\}/);
  if (jsonObjectMatch) {
    return JSON.parse(jsonObjectMatch[0]).posts || [];
  }

  return [];
}
```

---

## 使用量（Usage）

```json
{
  "input_tokens": 50680,
  "output_tokens": 3610,
  "total_tokens": 54290,
  "num_server_side_tools_used": 5
}
```

- **入力トークン**: プロンプト + 検索結果（サーバー側で追加）
- **出力トークン**: 生成されたJSON
- **ツール使用回数**: 5回（複数の検索クエリを自動実行）

---

## 注意事項

1. **日付形式**: `from_date`/`to_date`は `YYYY-MM-DD` 形式
2. **モデル**: `grok-4-1-fast-reasoning` が高速でおすすめ
3. **トークン消費**: ツール呼び出しにより入力トークンが増加する
4. **レート制限**: 大量リクエスト時は適切な間隔を設ける
