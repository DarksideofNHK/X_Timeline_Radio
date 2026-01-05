import type { VercelRequest, VercelResponse } from '@vercel/node';

const GROK_API_URL = 'https://api.x.ai/v1/responses';

// 番組タイプ設定（インライン定義でインポート問題を回避）
const INLINE_SHOW_TYPES: Record<string, { name: string; genres: Array<{ id: string; name: string; icon: string; query: string; camp?: string }> }> = {
  'politician-watch': {
    name: 'X政治家ウオッチ',
    // 2026年1月時点: 高市早苗内閣
    genres: [
      {
        id: 'ruling-ldp',
        name: '自民党',
        icon: '🔴',
        query: '(from:takaichi_sanae OR from:jimin_koho OR 高市早苗 OR 自民党 OR 鈴木俊一 OR 麻生太郎 OR 小泉進次郎 OR 小野田紀美) (政策 OR 発言 OR 批判 OR 主張)',
        camp: '与党'
      },
      {
        id: 'ruling-komeito',
        name: '公明党',
        icon: '🟡',
        query: '(from:komei_koho OR 公明党 OR 斎藤健) (政策 OR 発言 OR 主張)',
        camp: '与党'
      },
      {
        id: 'opposition-cdp',
        name: '立憲民主党',
        icon: '🔵',
        query: '(from:NODAYOSHI55 OR from:CDP2017 OR 立憲民主党 OR 立憲 OR 野田佳彦 OR 蓮舫 OR 辻元清美) (政策 OR 批判 OR 主張)',
        camp: '野党'
      },
      {
        id: 'opposition-ishin',
        name: '日本維新の会',
        icon: '🟢',
        query: '(from:hiroyoshimura OR from:osaka_ishin OR 維新 OR 日本維新の会 OR 吉村洋文) (政策 OR 発言 OR 主張)',
        camp: '野党'
      },
      {
        id: 'opposition-dpfp',
        name: '国民民主党',
        icon: '🟠',
        query: '(from:tamakiyuichiro OR from:DPFPnews OR 国民民主党 OR 玉木雄一郎) (政策 OR 発言 OR 主張)',
        camp: '野党'
      },
      {
        id: 'opposition-others',
        name: 'その他野党',
        icon: '🟣',
        query: '(from:tamutomojcp OR from:jcp_cc OR from:reiwashinsen OR from:jinkamiya OR 共産党 OR 田村智子 OR れいわ新選組 OR 山本太郎 OR 参政党 OR 神谷宗幣) (政策 OR 発言 OR 主張)',
        camp: '野党'
      },
      {
        id: 'public-reaction',
        name: '国民の声',
        icon: '👥',
        query: '(高市内閣 OR 高市政権 OR 与党 OR 野党 OR 国会) (批判 OR 支持 OR おかしい OR 反対 OR 賛成)',
        camp: '一般'
      },
    ],
  },
  'old-media-buster': {
    name: 'オールドメディアをぶっ壊せラジオ',
    genres: [
      { id: 'nhk', name: 'NHK批判', icon: '📺', query: '(NHK OR エヌエイチケー OR 日本放送協会) (偏向報道 OR 捏造 OR 印象操作 OR 切り取り OR 受信料 OR おかしい OR ひどい OR 嘘 OR フェイク) -from:nhk_news' },
      { id: 'newspapers', name: '新聞批判', icon: '📰', query: '(朝日新聞 OR 毎日新聞 OR 読売新聞 OR 産経新聞 OR 東京新聞 OR 新聞) (偏向 OR 捏造 OR 誤報 OR フェイク OR 印象操作 OR プロパガンダ OR 嘘 OR ひどい) -from:asahi -from:mainichi -from:ylogin' },
      { id: 'tv-stations', name: '民放批判', icon: '📡', query: '(フジテレビ OR 日テレ OR TBS OR テレ朝 OR テレビ朝日 OR 民放 OR マスゴミ OR マスコミ) (偏向 OR やらせ OR 捏造 OR 印象操作 OR 切り取り OR ひどい OR おかしい) -from:fujitv -from:ntv -from:tbs' },
    ],
  },
  'disaster-news': {
    name: 'X災害ニュース',
    genres: [
      // 被害情報を最初に（速報の次に配置）
      { id: 'damage', name: '被害情報', icon: '🔥', query: '(火災 OR 火事 OR 焼失 OR 全焼 OR 半焼 OR 倒壊 OR 損壊 OR 浸水被害 OR 土砂崩れ OR 家屋 OR 建物) (被害 OR 発生 OR 出動 OR 現場 OR 消火)' },
      // 速報
      { id: 'breaking', name: '速報', icon: '🚨', query: '(緊急地震速報 OR 特別警報 OR 津波警報 OR 震度5 OR 震度6 OR 震度7 OR 氾濫 OR 決壊) (速報 OR 発生 OR 警戒 OR 避難)' },
      // 現地の声
      { id: 'local-voices', name: '現地の声', icon: '📢', query: '(揺れた OR 停電した OR 浸水 OR 冠水 OR やばい OR すごい雨 OR すごい雪 OR 避難中) (今 OR さっき OR 現在)' },
      // 警報・注意報
      { id: 'warnings', name: '警報・注意報', icon: '⚠️', query: '(from:JMA_kishou OR from:FDMA_JAPAN OR 気象庁 OR 消防庁) (警報 OR 注意報 OR 警戒 OR 発表)' },
      // 交通・ライフライン
      { id: 'infrastructure', name: '交通・ライフライン', icon: '🚃', query: '(運休 OR 運転見合わせ OR 通行止め OR 停電 OR 断水 OR 欠航) (現在 OR 影響 OR 復旧)' },
      // 防災情報（エンディング前）
      { id: 'preparedness', name: '防災情報', icon: '🛡️', query: '(避難所 OR 避難指示 OR 防災 OR 備え OR ハザードマップ OR 非常食 OR 備蓄) (開設 OR 確認 OR 準備 OR 情報)' },
    ],
  },
};

// レガシー: X Timeline Radio用ジャンル
const LEGACY_GENRES = [
  { id: 'trending', name: '今バズってる話題', query: '直近数時間で急激に拡散されているPost' },
  { id: 'politics', name: '政治ニュース', query: '政治、国会、選挙、政党、政策に関するPost' },
  { id: 'economy', name: '経済・マネー', query: '株価、為替、投資、企業業績、経済ニュースに関するPost' },
  { id: 'lifestyle', name: '暮らし・生活', query: '生活の知恵、家事、育児、健康、食事に関するPost' },
  { id: 'entertainment', name: 'エンタメ', query: '芸能、映画、ドラマ、音楽、ゲームに関するPost' },
  { id: 'science', name: '科学・テクノロジー', query: 'AI、宇宙、医療、IT、新技術に関するPost' },
  { id: 'international', name: '国際ニュース', query: '海外ニュース、国際情勢、外交に関するPost' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORSヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { genre, showType, apiKey } = req.body;

    // 新形式: showTypeが指定された場合
    if (showType && INLINE_SHOW_TYPES[showType]) {
      const show = INLINE_SHOW_TYPES[showType];
      const allPosts: Record<string, any[]> = {};
      const allAnnotations: any[] = [];

      // 政治家ウオッチ用の特別な収集プロンプト
      if (showType === 'politician-watch') {
        const collectPromises = show.genres.map(async (genreConfig) => {
          const { posts, annotations } = await collectPoliticianPostsSimple(genreConfig, apiKey);
          return { id: genreConfig.id, posts, annotations };
        });
        const results = await Promise.all(collectPromises);
        for (const result of results) {
          allPosts[result.id] = result.posts;
          allAnnotations.push(...result.annotations);
        }
      } else if (showType === 'disaster-news') {
        // 災害ニュース用の収集を並列実行
        const collectPromises = show.genres.map(async (genreConfig) => {
          const { posts, annotations } = await collectDisasterPosts(genreConfig, apiKey);
          return { id: genreConfig.id, posts, annotations };
        });
        const results = await Promise.all(collectPromises);
        for (const result of results) {
          allPosts[result.id] = result.posts;
          allAnnotations.push(...result.annotations);
        }
      } else {
        // オールドメディア等：汎用収集を並列実行
        const collectPromises = show.genres.map(async (genreConfig) => {
          const { posts, annotations } = await collectGenericPosts(genreConfig, show.name, apiKey);
          return { id: genreConfig.id, posts, annotations };
        });
        const results = await Promise.all(collectPromises);
        for (const result of results) {
          allPosts[result.id] = result.posts;
          allAnnotations.push(...result.annotations);
        }
      }

      return res.status(200).json({
        posts: allPosts,
        showType,
        showName: show.name,
        annotations: allAnnotations
      });
    }

    // レガシー形式: genre のみ指定
    const genreConfig = LEGACY_GENRES.find((g) => g.id === genre);
    if (!genreConfig) {
      return res.status(400).json({ error: `Unknown genre: ${genre}` });
    }

    const { posts, annotations } = await collectLegacyPosts(genreConfig, apiKey);
    return res.status(200).json({ posts, genre, annotations });

  } catch (error: any) {
    console.error('[API] Error collecting posts:', error);
    return res.status(500).json({ error: error.message });
  }
}

// 政治家Post収集（シンプル版 - キーワードベース）
async function collectPoliticianPostsSimple(
  genreConfig: { id: string; name: string; query: string; camp?: string },
  apiKey: string
): Promise<{ posts: any[]; annotations: any[] }> {
  const now = new Date();
  const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  const prompt = `
あなたは日本の政治に詳しいXキュレーターです。

【番組】X政治家ウオッチ
【収集対象】${genreConfig.name}（${genreConfig.camp || ''}）に関する投稿
【検索クエリ】${genreConfig.query}
【条件】直近24時間以内の日本語Post

【収集の優先順位】
1. 政治家本人のX投稿（公式アカウント）
2. 政策に対する明確なスタンス表明
3. 他党・他議員への批判や反論
4. 注目を集めている発言やニュース

【出力形式】
\`\`\`json
{
  "posts": [
    {
      "author_username": "ユーザー名",
      "author_name": "表示名（政治家名・役職など）",
      "party": "${genreConfig.name}",
      "text": "投稿内容",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "retweets": 数値,
      "stance": "主張/批判/反論/提案など",
      "topic": "言及トピック"
    }
  ]
}
\`\`\`

10件出力。実在する投稿のみを返してください。架空の投稿は絶対に作成しないでください。`;

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        tools: [{ type: 'x_search', x_search: { from_date: fromDate, to_date: toDate } }],
        input: prompt,
      }),
    });

    if (!response.ok) {
      console.error(`[PoliticianSimple ${genreConfig.id}] API error: ${response.status}`);
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[PoliticianSimple ${genreConfig.id}] Got response`);
    return extractPostsFromResponse(data, genreConfig.id);
  } catch (error) {
    console.error(`[PoliticianSimple ${genreConfig.id}] Error:`, error);
    return { posts: [], annotations: [] };
  }
}

// 政治家アカウントリストを取得（レガシー - 現在未使用）
async function fetchPoliticianAccounts(apiKey: string): Promise<Record<string, any[]>> {
  const prompt = `あなたは日本の政治に詳しい専門家です。

【タスク】
日本の主要政党の国会議員・幹部のXアカウントを調べてください。

【対象政党】
1. 自民党（与党）- 総裁、幹事長、政調会長、大臣、有力議員
2. 公明党（与党）- 代表、幹事長、有力議員
3. 立憲民主党（野党）- 代表、幹事長、有力議員
4. 日本維新の会（野党）- 代表、共同代表、有力議員
5. 国民民主党（野党）- 代表、有力議員
6. その他野党 - 共産党、れいわ新選組、社民党、参政党の代表・有力議員

【出力形式】
\`\`\`json
{
  "ruling-ldp": [{ "name": "政治家名", "username": "Xユーザー名", "role": "役職" }],
  "ruling-komeito": [...],
  "opposition-cdp": [...],
  "opposition-ishin": [...],
  "opposition-dpfp": [...],
  "opposition-others": [...]
}
\`\`\`

各政党5-10名、アクティブに発信している政治家を優先。`;

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        tools: [{ type: 'x_search' }],
        input: prompt,
      }),
    });

    if (!response.ok) throw new Error(`Grok API error: ${response.status}`);

    const data = await response.json();
    const fullText = extractTextFromResponse(data);

    // JSON抽出
    let jsonText = '';
    const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1].trim();
    } else if (fullText.includes('"ruling-ldp"')) {
      const startIdx = fullText.indexOf('{');
      const endIdx = fullText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx > startIdx) {
        jsonText = fullText.slice(startIdx, endIdx + 1);
      }
    }

    if (jsonText) {
      return JSON.parse(jsonText);
    }
  } catch (error) {
    console.error('[Accounts] Error:', error);
  }

  return {};
}

// 政治家Post収集（一時的に無効化）
async function collectPoliticianPosts(
  genreConfig: any,
  accounts: Record<string, any[]>,
  apiKey: string
): Promise<any[]> {
  // 国民の声は別処理
  if (genreConfig.id === 'public-reaction') {
    return collectPublicReaction(apiKey);
  }

  const partyAccounts = accounts[genreConfig.id] || [];
  if (partyAccounts.length === 0) return [];

  const accountList = partyAccounts.map((a: any) => `@${a.username}（${a.name}/${a.role}）`).join('\n');
  const usernameQuery = partyAccounts.map((a: any) => `from:${a.username}`).join(' OR ');

  const now = new Date();
  const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  const prompt = `
あなたは日本の政治家のX投稿を分析する専門家です。

【検索対象アカウント】
${accountList}

【検索クエリ】
${usernameQuery}

【検索条件】
- 政党: ${genreConfig.name}（${genreConfig.camp}）
- 直近24時間以内の日本語Post

【収集の優先順位】
1. 政策に対する明確なスタンス表明
2. 他党・他議員への批判や反論
3. 重要法案・政策への賛否
4. 注目を集めている発言

【出力形式】
\`\`\`json
{
  "posts": [
    {
      "author_username": "ユーザー名",
      "author_name": "政治家名（役職）",
      "party": "${genreConfig.name}",
      "text": "投稿内容",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "retweets": 数値,
      "stance": "主張/批判/反論/提案など",
      "topic": "言及トピック"
    }
  ]
}
\`\`\`

10件出力。実在するPostのみ。`;

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        tools: [{ type: 'x_search', x_search: { from_date: fromDate, to_date: toDate } }],
        input: prompt,
      }),
    });

    if (!response.ok) throw new Error(`Grok API error: ${response.status}`);

    const data = await response.json();
    return extractPostsFromResponse(data, genreConfig.id).posts;
  } catch (error) {
    console.error(`[Collect ${genreConfig.id}] Error:`, error);
    return [];
  }
}

// 国民の声収集
async function collectPublicReaction(apiKey: string): Promise<any[]> {
  const now = new Date();
  const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  const prompt = `
あなたは日本の政治に関する一般市民の声を収集する専門家です。

【検索条件】
- 直近24時間以内の日本語Post
- 一般ユーザー（政治家・メディア以外）の投稿
- 政治家や政策に対する意見・反応

【収集の優先順位】
1. 政治家の発言への賛否コメント
2. 政策・法案への一般市民の意見
3. 話題になっている政治ニュースへの反応

【バランス】
賛成意見と反対意見を半々程度で

【出力形式】
\`\`\`json
{
  "posts": [
    {
      "author_username": "ユーザー名",
      "author_name": "表示名",
      "party": "一般市民",
      "text": "投稿内容",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "stance": "賛成/反対/疑問など",
      "topic": "言及トピック"
    }
  ]
}
\`\`\`

10件出力。`;

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        tools: [{ type: 'x_search', x_search: { from_date: fromDate, to_date: toDate } }],
        input: prompt,
      }),
    });

    if (!response.ok) throw new Error(`Grok API error: ${response.status}`);

    const data = await response.json();
    return extractPostsFromResponse(data, 'public-reaction').posts;
  } catch (error) {
    console.error('[PublicReaction] Error:', error);
    return [];
  }
}

// 汎用Post収集（オールドメディア等）
async function collectGenericPosts(
  genreConfig: { id: string; name: string; query: string },
  showName: string,
  apiKey: string
): Promise<{ posts: any[]; annotations: any[] }> {
  const now = new Date();
  const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  // オールドメディア用の詳細な指示
  const isOldMediaBuster = showName.includes('オールドメディア');

  const oldMediaInstructions = isOldMediaBuster ? `
【重要：オールドメディア批判投稿の収集ポイント】

★最重要★ 「オールドメディアが何をしたか」の具体例付き投稿を優先：
- 「NHKが○○について△△と報道した」という具体的なメディア行動を含む投稿
- 「朝日新聞の○○記事で△△と書いてあった」という元記事への言及がある投稿
- 「TBSの○○番組で△△の発言を切り取っていた」という番組内容への言及がある投稿

★オールドメディア側の報道内容・問題行動を特定できる投稿：
- どのメディアが
- 何のニュース/番組で
- どんな報道・対応をしたか
が分かる投稿を探す

【求める投稿の例】
- 「NHKニュース7で○○事件を完全スルー。代わりに△△を長々と放送。これが公共放送？」
- 「朝日新聞の○月○日の記事『△△』、事実と全く違う。ソースは□□」
- 「TBSの○○で政治家の発言を切り取り。実際は△△と言っていたのに」
- 「読売が○○について報道するも、××という重要な事実を隠蔽」

【投稿データに含めるべき情報】
- media_action: オールドメディアが何をしたか（報道内容、問題行動）
- target_media: どのメディアか
- criticism_point: 何が問題か（偏向、捏造、スルー、切り取りなど）
` : '';

  const prompt = `
あなたはXの投稿キュレーターです。

【番組】${showName}
【ジャンル】${genreConfig.name}
【検索クエリ】${genreConfig.query}
【条件】直近24時間以内の日本語Post
${oldMediaInstructions}
【出力形式】
\`\`\`json
{
  "posts": [
    {
      "author_username": "ユーザー名",
      "author_name": "表示名",
      "text": "投稿内容（できるだけ全文、最低100文字以上）",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "retweets": 数値,
      "summary": "何を批判しているかの要約",
      "target_media": "批判対象のメディア名（NHK、朝日新聞など）",
      "media_action": "オールドメディアが具体的に何をしたか（例：○○事件を報道しなかった、△△の発言を切り取った）",
      "criticism_point": "批判のポイント（偏向報道、捏造、印象操作、報道しない自由など）"
    }
  ]
}
\`\`\`

10件出力。実在するPostのみ。「オールドメディアが何をしたか」と「それへの批判」の両方が分かる投稿を優先。`;

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        tools: [{ type: 'x_search', x_search: { from_date: fromDate, to_date: toDate } }],
        input: prompt,
      }),
    });

    if (!response.ok) throw new Error(`Grok API error: ${response.status}`);

    const data = await response.json();
    return extractPostsFromResponse(data, genreConfig.id);
  } catch (error) {
    console.error(`[Collect ${genreConfig.id}] Error:`, error);
    return { posts: [], annotations: [] };
  }
}

// 災害ニュース用Post収集
async function collectDisasterPosts(
  genreConfig: { id: string; name: string; query: string },
  apiKey: string
): Promise<{ posts: any[]; annotations: any[] }> {
  const now = new Date();
  // 災害情報は直近12時間を収集（より新鮮な情報を優先）
  const fromDate = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  // ジャンル別の収集指示
  const genreInstructions: Record<string, string> = {
    'damage': `
【被害情報コーナー】現在発生している被害を詳しく収集
★優先順位★
1. 火災発生・消火活動の状況（○棟焼失、消防車出動など）
2. 建物の倒壊・損壊情報
3. 浸水・冠水被害の状況
4. 人的被害の情報（けが人、救助など）
5. 土砂崩れ・がけ崩れの発生
→ 消防・警察の公式情報と現地の声を両方集める
→ 具体的な数字（○棟、○人、○台など）を含む投稿を優先`,
    'breaking': `
【速報コーナー】最も緊急性の高い災害情報を収集
★優先順位★
1. 緊急地震速報、津波警報、特別警報の発表
2. 震度5以上の地震発生報告
3. 河川氾濫・堤防決壊の速報
→ 公式発表と、現地からの「今！」という声を両方集める`,
    'local-voices': `
【現地の声コーナー】一般ユーザーのリアルタイム報告を中心に収集
★優先順位★
1. 「今揺れた」「停電した」「浸水してる」などの現在進行形の報告
2. 写真・動画付きの被害状況投稿
3. 「○○市住みだけど」のような地元民の体験談
4. 避難中・被災中の人の状況報告
→ 公式より一般ユーザーを多めに（7:3くらい）`,
    'warnings': `
【警報・注意報コーナー】公式情報を中心に収集
★優先順位★
1. 気象庁の警報・注意報発表
2. 自治体の避難情報
3. 消防・警察の注意喚起
4. 報道機関の速報
→ 公式アカウントを中心に（8:2くらい）`,
    'infrastructure': `
【交通・ライフラインコーナー】生活への影響を収集
★優先順位★
1. 鉄道・バスの運休・遅延情報
2. 道路の通行止め情報
3. 停電・断水の状況
4. 空港・航空便の欠航情報
→ 公式と現地の声を半々で`,
    'preparedness': `
【防災情報コーナー】避難・備えの情報を収集
★優先順位★
1. 避難所の開設情報
2. 避難指示・避難勧告
3. 防災グッズ・備蓄の情報
4. ハザードマップの確認呼びかけ
→ 公式情報を中心に`
  };

  const instruction = genreInstructions[genreConfig.id] || '';

  const prompt = `
あなたは災害情報の速報キュレーターです。**今まさに起きていること**を集めてください。

【番組】X災害ニュース
【ジャンル】${genreConfig.name}
【検索クエリ】${genreConfig.query}
【条件】直近6時間以内の日本語Post（新しいものを優先）
${instruction}

【★速報性を最重視★】
- 「○時○分現在」「たった今」「今」を含む投稿を優先
- 投稿時刻が新しいものを上位に
- 進行中の災害 > 過去の災害報告

【出力形式】
\`\`\`json
{
  "posts": [
    {
      "author_username": "ユーザー名",
      "author_name": "表示名",
      "text": "投稿内容（全文）",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "retweets": 数値,
      "location": "場所",
      "posted_time": "投稿時刻（分かれば）",
      "source_type": "公式/報道/現地住民/一般"
    }
  ]
}
\`\`\`

10件出力。実在する投稿のみ。新しい投稿を優先。`;

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        tools: [{ type: 'x_search', x_search: { from_date: fromDate, to_date: toDate } }],
        input: prompt,
      }),
    });

    if (!response.ok) {
      console.error(`[Disaster ${genreConfig.id}] API error: ${response.status}`);
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    console.log(`[Disaster ${genreConfig.id}] Got response`);
    return extractDisasterPostsFromResponse(data, genreConfig.id);
  } catch (error) {
    console.error(`[Disaster ${genreConfig.id}] Error:`, error);
    return { posts: [], annotations: [] };
  }
}

// 災害Post専用の抽出関数
function extractDisasterPostsFromResponse(data: any, genre: string): { posts: any[]; annotations: any[] } {
  const posts: any[] = [];
  const allAnnotations: any[] = [];
  const fullText = extractTextFromResponse(data);

  // JSON抽出
  let jsonText = '';
  const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonText = jsonBlockMatch[1].trim();
  }

  if (!jsonText) {
    const jsonObjectMatch = fullText.match(/\{\s*"posts"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (jsonObjectMatch) {
      jsonText = jsonObjectMatch[0];
    }
  }

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const postsArray = parsed.posts || (Array.isArray(parsed) ? parsed : []);

      for (const p of postsArray) {
        const idMatch = p.url?.match(/status\/(\d+)/);
        const postId = idMatch ? idMatch[1] : Date.now().toString();

        posts.push({
          id: postId,
          author: {
            id: p.author_username || p.username || 'unknown',
            name: p.author_name || p.name || 'ユーザー',
            username: p.author_username || p.username || 'unknown',
          },
          text: p.text || p.content || '',
          url: p.url || `https://x.com/i/status/${postId}`,
          metrics: {
            likes: p.likes || 0,
            retweets: p.retweets || 0,
            replies: p.replies || 0,
          },
          // 災害ニュース専用フィールド
          location: p.location || '',
          disasterType: p.disaster_type || '',
          severity: p.severity || '',
          infoType: p.info_type || '',
          sourceType: p.source_type || '',
          genre: genre,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('[ExtractDisaster] Failed to parse JSON:', e);
    }
  }

  // annotations抽出
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.content && Array.isArray(item.content)) {
        for (const content of item.content) {
          if (content.annotations && Array.isArray(content.annotations)) {
            for (const ann of content.annotations) {
              const url = ann.url || ann.url_citation?.url;
              if (url && url.includes('/status/')) {
                const statusIdMatch = url.match(/status\/(\d+)/);
                if (statusIdMatch) {
                  allAnnotations.push({
                    url: `https://x.com/i/status/${statusIdMatch[1]}`,
                    statusId: statusIdMatch[1]
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return { posts: posts.slice(0, 10), annotations: allAnnotations };
}

// レガシーPost収集（X Timeline Radio用）
async function collectLegacyPosts(
  genreConfig: { id: string; name: string; query: string },
  apiKey: string
): Promise<{ posts: any[]; annotations: any[] }> {
  const now = new Date();
  const fromDate = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  const prompt = `
あなたはXのバズ投稿キュレーターです。

【検索条件】
- ジャンル: ${genreConfig.name}
- 条件: ${genreConfig.query}
- 直近6時間以内に投稿された日本語のPost
- いいね数100以上推奨

【出力形式】
\`\`\`json
{
  "posts": [
    {
      "author_username": "ユーザー名",
      "author_name": "表示名",
      "text": "投稿内容",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "retweets": 数値,
      "replies": 数値,
      "buzz_reason": "なぜバズっているか"
    }
  ]
}
\`\`\`

10件出力。実在するPostのみ。`;

  try {
    const response = await fetch(GROK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4-1-fast-reasoning',
        tools: [{ type: 'x_search', x_search: { from_date: fromDate, to_date: toDate } }],
        input: prompt,
      }),
    });

    if (!response.ok) throw new Error(`Grok API error: ${response.status}`);

    const data = await response.json();
    return extractPostsFromResponse(data, genreConfig.id);
  } catch (error) {
    console.error(`[Legacy ${genreConfig.id}] Error:`, error);
    return { posts: [], annotations: [] };
  }
}

// レスポンスからテキスト抽出
function extractTextFromResponse(data: any): string {
  let fullText = '';
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.type === 'message' && item.content && Array.isArray(item.content)) {
        for (const content of item.content) {
          if (content.type === 'output_text' && content.text) {
            fullText += content.text;
          }
        }
      }
    }
  }
  if (!fullText && data.text) {
    fullText = data.text;
  }
  return fullText;
}

// レスポンスからPost抽出
function extractPostsFromResponse(data: any, genre: string): { posts: any[]; annotations: any[] } {
  const posts: any[] = [];
  const allAnnotations: any[] = [];
  const fullText = extractTextFromResponse(data);

  // JSON抽出
  let jsonText = '';
  const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonText = jsonBlockMatch[1].trim();
  }

  if (!jsonText) {
    const jsonObjectMatch = fullText.match(/\{\s*"posts"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (jsonObjectMatch) {
      jsonText = jsonObjectMatch[0];
    }
  }

  if (!jsonText) {
    const jsonArrayMatch = fullText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (jsonArrayMatch) {
      jsonText = `{"posts": ${jsonArrayMatch[0]}}`;
    }
  }

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const postsArray = parsed.posts || (Array.isArray(parsed) ? parsed : []);

      for (const p of postsArray) {
        const idMatch = p.url?.match(/status\/(\d+)/);
        const postId = idMatch ? idMatch[1] : Date.now().toString();

        posts.push({
          id: postId,
          author: {
            id: p.author_username || p.username || 'unknown',
            name: p.author_name || p.name || 'ユーザー',
            username: p.author_username || p.username || 'unknown',
          },
          text: p.text || p.content || '',
          url: p.url || `https://x.com/i/status/${postId}`,
          metrics: {
            likes: p.likes || 0,
            retweets: p.retweets || 0,
            replies: p.replies || 0,
          },
          party: p.party || '',
          stance: p.stance || '',
          topic: p.topic || '',
          summary: p.summary || '',
          buzzReason: p.buzz_reason || '',
          genre: genre,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('[Extract] Failed to parse JSON:', e);
    }
  }

  // annotations抽出
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.content && Array.isArray(item.content)) {
        for (const content of item.content) {
          if (content.annotations && Array.isArray(content.annotations)) {
            for (const ann of content.annotations) {
              const url = ann.url || ann.url_citation?.url;
              if (url && url.includes('/status/')) {
                const statusIdMatch = url.match(/status\/(\d+)/);
                if (statusIdMatch) {
                  const statusId = statusIdMatch[1];
                  allAnnotations.push({
                    url: `https://x.com/i/status/${statusId}`,
                    statusId
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  return { posts: posts.slice(0, 10), annotations: allAnnotations };
}
