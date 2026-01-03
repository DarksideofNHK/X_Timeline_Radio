# Grok API 完全リクエスト・レスポンス記録

取得日時: 2026年1月3日 23:40 JST

---

## 1. リクエスト

### エンドポイント
```
POST https://api.x.ai/v1/responses
```

### ヘッダー
```
Content-Type: application/json
Authorization: Bearer {API_KEY}
```

### リクエストボディ（実際に送信したもの）

```json
{
  "model": "grok-4-1-fast-reasoning",
  "tools": [
    {
      "type": "x_search",
      "x_search": {
        "from_date": "2026-01-03",
        "to_date": "2026-01-03"
      }
    }
  ],
  "input": "あなたはXのバズ投稿キュレーターです。\n\n【検索条件】\n- ジャンル: 今バズってる話題\n- 条件: 直近数時間で急激に拡散されているPost\n- 直近6時間以内に投稿された日本語のPost\n- 以下の「盛り上がり指標」が高いものを優先:\n  1. いいね数が多い（100以上推奨）\n  2. リツイート/引用が多い\n  3. リプライが活発（議論になっている）\n  4. 短時間で急激に伸びている\n\n【出力形式】\n以下のJSON形式で10件出力してください:\n\n```json\n{\n  \"posts\": [\n    {\n      \"author_username\": \"実際のユーザー名\",\n      \"author_name\": \"表示名\",\n      \"text\": \"投稿内容（280文字以内）\",\n      \"url\": \"https://x.com/username/status/投稿ID\",\n      \"likes\": 数値,\n      \"retweets\": 数値,\n      \"replies\": 数値,\n      \"buzz_reason\": \"なぜバズっているか一言\"\n    }\n  ]\n}\n```\n\n【重要】\n- 必ず実在するPostのURLを含めてください\n- 架空の投稿を作成しないでください\n- URLは必ず https://x.com/ユーザー名/status/数字 の形式で"
}
```

---

## 2. レスポンス

### メタ情報

```json
{
  "created_at": 1767451206,
  "id": "5479022a-546e-f3ae-d425-a41305aba7ab",
  "model": "grok-4-1-fast-reasoning",
  "object": "response",
  "status": "completed"
}
```

### ツール呼び出し履歴（output配列の最初の4要素）

Grokが自動的に実行した検索クエリ：

#### 検索1: キーワード検索（Top）
```json
{
  "call_id": "xs_call_34275269",
  "name": "x_keyword_search",
  "input": "{\"query\":\"lang:ja since:2026-01-03 min_faves:100 min_retweets:10 filter:has_engagement\",\"limit\":50,\"mode\":\"Top\"}",
  "status": "completed"
}
```

#### 検索2: キーワード検索（Latest）
```json
{
  "call_id": "xs_call_32191007",
  "name": "x_keyword_search",
  "input": "{\"query\":\"lang:ja since:2026-01-03 min_faves:100 min_retweets:10 filter:has_engagement\",\"limit\":50,\"mode\":\"Latest\"}",
  "status": "completed"
}
```

#### 検索3: キーワード検索（時間指定・Latest）
```json
{
  "call_id": "xs_call_62723563",
  "name": "x_keyword_search",
  "input": "{\"query\":\"lang:ja since:2026-01-03_06:00:00_JST min_faves:50 min_retweets:5 filter:has_engagement\",\"limit\":30,\"mode\":\"Latest\"}",
  "status": "completed"
}
```

#### 検索4: 意味的検索
```json
{
  "call_id": "xs_call_31139057",
  "name": "x_semantic_search",
  "input": "{\"query\":\"直近でバズってる日本語の話題やニュース\",\"limit\":20,\"from_date\":\"2026-01-03\",\"min_score_threshold\":0.25}",
  "status": "completed"
}
```

### 最終回答（output配列の最後の要素）

```json
{
  "type": "message",
  "role": "assistant",
  "status": "completed",
  "content": [
    {
      "type": "output_text",
      "text": "（下記JSON）",
      "annotations": ["（147件の引用URL）"]
    }
  ]
}
```

### 抽出されたJSON（output_textの中身）

```json
{
  "posts": [
    {
      "author_username": "ponto_nei",
      "author_name": "先斗寧🫐ぽんとねい",
      "text": "ご視聴ありがとうございました！\n\n驚かせてしまったとは思うのですがこうして新しい姿をお見せすることができて今は一安心しています…！\n見慣れなかったり受け入れられなかったりあると思うのですが無理せず見守ってくれると嬉しいです🙇‍♂️\n\nこれからもよろしくお願いします✨",
      "url": "https://x.com/ponto_nei/status/2007425467868164500",
      "likes": 71408,
      "retweets": 12031,
      "replies": 469,
      "buzz_reason": "にじさんじライバーの新姿発表で大反響"
    },
    {
      "author_username": "nijisanji_app",
      "author_name": "にじさんじ公式🌈🕒",
      "text": "【新春！#にじさんじ麻雀杯2026 開催決定！】\n\n1月10日(土)、11日(日)、12日(月・祝)に\n恒例の『新春！にじさんじ麻雀杯』が今年も開催！\n\n参加者は国内・海外を含めてなんと✨🎍102名🎍✨\n\nメンバー発表&抽選会は\n🗓1月5日(月)20時スタート！",
      "url": "https://x.com/nijisanji_app/status/2007424264249717179",
      "likes": 44641,
      "retweets": 14787,
      "replies": 130,
      "buzz_reason": "にじさんじ大規模麻雀イベント告知"
    },
    {
      "author_username": "hanazawa_staff",
      "author_name": "花澤香菜",
      "text": "あけましておめでとうございます！！！\n今年もよろしくお願いいたします🐴✨\n初めてさわやか食べられたよ！\n美味しかった〜☺️",
      "url": "https://x.com/hanazawa_staff/status/2007404097146892321",
      "likes": 82588,
      "retweets": 4363,
      "replies": 664,
      "buzz_reason": "声優の新年挨拶写真が可愛く拡散"
    },
    {
      "author_username": "conan_anime1000",
      "author_name": "アニメ名探偵コナン【公式】⚽️",
      "text": "━━━━━━━━━━━━━\n　　　快斗＆青子　\n　  新ビジュアル解禁✨\n「キッドVS白馬 青の玉座」\n　　  coming soon‼️\n━━━━━━━━━━━━",
      "url": "https://x.com/conan_anime1000/status/2007369101342339523",
      "likes": 58159,
      "retweets": 13505,
      "replies": 221,
      "buzz_reason": "コナン新ビジュアル解禁でファン熱狂"
    },
    {
      "author_username": "DEATHDOL_NOTE",
      "author_name": "DEATHDOL NOTE",
      "text": "初めましてデスドルノートと申します。はじめしゃちょーさんの繋がり(2023年8月〜)と名乗る人物が2024年12月にはじめしゃちょーさんから「会いたくなった」とDMが来た告発がきております。",
      "url": "https://x.com/DEATHDOL_NOTE/status/2007406840817369532",
      "likes": 41233,
      "retweets": 1521,
      "replies": 935,
      "buzz_reason": "YouTuberスキャンダル暴露で議論沸騰"
    },
    {
      "author_username": "PIYO_KAERU",
      "author_name": "ぴよ@カエルと暮らす",
      "text": "←寝てる\n     起きてる→",
      "url": "https://x.com/PIYO_KAERU/status/2007257872565186780",
      "likes": 96714,
      "retweets": 8190,
      "replies": 111,
      "buzz_reason": "カエルの寝起きイラストが癒し拡散"
    },
    {
      "author_username": "onipro",
      "author_name": "萩原幸也 ®️",
      "text": "神社にあった干支の絵が良かったから見て",
      "url": "https://x.com/onipro/status/2007343843310813235",
      "likes": 57679,
      "retweets": 4711,
      "replies": 45,
      "buzz_reason": "新年干支イラストのクールさが話題"
    },
    {
      "author_username": "sputnik_jp",
      "author_name": "Sputnik 日本",
      "text": "【世界最高齢の猫が30歳の誕生日】\n\nブリティッシュショートヘアのフロッシーが30歳の誕生日（1995年12月29日生まれ）を迎えた。",
      "url": "https://x.com/sputnik_jp/status/2007325181791158463",
      "likes": 57003,
      "retweets": 9361,
      "replies": 89,
      "buzz_reason": "世界最高齢猫30歳誕生日の驚き"
    },
    {
      "author_username": "KAGAYA_11949",
      "author_name": "KAGAYA",
      "text": "今年最初の満月。\n富士山の山頂から昇る姿、パール富士です。\n（先ほど、静岡県にて撮影）\n2026年が皆様にとって良い年になりますように。",
      "url": "https://x.com/KAGAYA_11949/status/2007423756826734797",
      "likes": 13841,
      "retweets": 3082,
      "replies": 37,
      "buzz_reason": "美しいパール富士の新年満月写真"
    },
    {
      "author_username": "uesaka_official",
      "author_name": "上坂すみれ_official",
      "text": "艦これ新春ライブ！ありがとうございましたっ！吹雪、司令官にお逢いできて…本当に幸せですっ！（すみぺ）",
      "url": "https://x.com/uesaka_official/status/2007450037765185605",
      "likes": 4355,
      "retweets": 769,
      "replies": 70,
      "buzz_reason": "艦これライブ報告でファン歓喜"
    }
  ]
}
```

### 引用URL（annotations）- 抜粋

Grokが参照した実際のポストURL（147件中最初の20件）:

```
https://x.com/i/status/2007460475986948600
https://x.com/i/status/2007300541786083568
https://x.com/i/status/2007410962274611616
https://x.com/i/status/2007459432956039444
https://x.com/i/status/2007460872285802512
https://x.com/i/status/2007397106009682395
https://x.com/i/status/2007457869705179608
https://x.com/i/status/2007459828822618587
https://x.com/i/status/2007459465788870679
https://x.com/i/status/2007406590366720175
https://x.com/i/status/2007288756945227888
https://x.com/i/status/2007353636809306179
https://x.com/i/status/2007418399996162404
https://x.com/i/status/2007443091243049143
https://x.com/i/status/2007458560146583820
https://x.com/i/status/2007304663343739045
https://x.com/i/status/2007423756826734797
https://x.com/i/status/2007451948425888065
https://x.com/i/status/2007460681470329035
https://x.com/i/status/2007460592664342800
```

### 使用量（usage）

```json
{
  "input_tokens": 52204,
  "input_tokens_details": {
    "cached_tokens": 2609
  },
  "output_tokens": 3678,
  "output_tokens_details": {
    "reasoning_tokens": 1882
  },
  "total_tokens": 55882,
  "num_sources_used": 0,
  "num_server_side_tools_used": 4,
  "cost_in_usd_ticks": 318884500,
  "server_side_tool_usage_details": {
    "web_search_calls": 0,
    "x_search_calls": 4,
    "code_interpreter_calls": 0,
    "file_search_calls": 0,
    "mcp_calls": 0,
    "document_search_calls": 0
  }
}
```

---

## 3. 構造図

```
レスポンス
├── id: "5479022a-546e-f3ae-d425-a41305aba7ab"
├── model: "grok-4-1-fast-reasoning"
├── status: "completed"
├── output: [
│     ├── [0] type: "custom_tool_call"  ← x_keyword_search (Top)
│     │        name: "x_keyword_search"
│     │        input: {"query":"lang:ja...", "mode":"Top"}
│     │
│     ├── [1] type: "custom_tool_call"  ← x_keyword_search (Latest)
│     │        name: "x_keyword_search"
│     │        input: {"query":"lang:ja...", "mode":"Latest"}
│     │
│     ├── [2] type: "custom_tool_call"  ← x_keyword_search (時間指定)
│     │        name: "x_keyword_search"
│     │        input: {"query":"lang:ja since:2026-01-03_06:00:00_JST..."}
│     │
│     ├── [3] type: "custom_tool_call"  ← x_semantic_search
│     │        name: "x_semantic_search"
│     │        input: {"query":"直近でバズってる日本語の話題..."}
│     │
│     └── [4] type: "message"           ← 最終回答
│              role: "assistant"
│              content: [
│                {
│                  type: "output_text"
│                  text: "{ \"posts\": [...] }"  ← ★ここにJSON
│                  annotations: [147件の引用URL]
│                }
│              ]
│   ]
└── usage: {
      input_tokens: 52204,
      output_tokens: 3678,
      total_tokens: 55882,
      x_search_calls: 4
    }
```

---

## 4. 重要ポイント

### プロンプト設計
- 日本語で具体的な条件を指定
- JSON出力形式を例示
- 「実在するPost」「架空禁止」を明記

### Grokの自動検索
- 1回のリクエストで4回の検索を自動実行
- `x_keyword_search`: X標準検索演算子
- `x_semantic_search`: 自然言語検索
- 検索モード: "Top"（人気順）と"Latest"（新着順）を併用

### トークン消費
- 入力: 52,204トークン（検索結果が自動追加される）
- 出力: 3,678トークン
- 合計: 55,882トークン

### コスト（参考）
- `cost_in_usd_ticks`: 318,884,500（約$0.32）
