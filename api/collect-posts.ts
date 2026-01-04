import type { VercelRequest, VercelResponse } from '@vercel/node';

const GROK_API_URL = 'https://api.x.ai/v1/responses';

// レガシー: X Timeline Radio用ジャンル（後方互換性）
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
    const { genre, apiKey } = req.body;

    // レガシー形式: genre のみ指定（新形式は一時的に無効化）
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

// 政治家アカウントリストを取得
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

// 汎用Post収集（ガバメントウオッチ、その他番組用）- 一時的に無効化
async function collectPostsForGenre(
  genreConfig: any,
  show: any,
  apiKey: string
): Promise<{ posts: any[]; annotations: any[] }> {
  const now = new Date();
  const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  const prompt = `
あなたはXの投稿キュレーターです。

【番組】${show.name}
【ジャンル】${genreConfig.name}
【検索クエリ】${genreConfig.query}
【条件】直近24時間以内の日本語Post

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
      "summary": "内容の要約"
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
    console.error(`[Collect ${genreConfig.id}] Error:`, error);
    return { posts: [], annotations: [] };
  }
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
