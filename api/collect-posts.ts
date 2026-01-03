import type { VercelRequest, VercelResponse } from '@vercel/node';

const GROK_API_URL = 'https://api.x.ai/v1/responses';

// ジャンル定義
const GENRES = [
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

    const genreConfig = GENRES.find((g) => g.id === genre);
    if (!genreConfig) {
      return res.status(400).json({ error: `Unknown genre: ${genre}` });
    }

    // 日付範囲（過去6時間）
    const now = new Date();
    const fromDate = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = now.toISOString().split('T')[0];

    const prompt = `
あなたはXのバズ投稿キュレーターです。

【検索条件】
- ジャンル: ${genreConfig.name}
- 条件: ${genreConfig.query}
- 直近6時間以内に投稿された日本語のPost
- 以下の「盛り上がり指標」が高いものを優先:
  1. いいね数が多い（100以上推奨）
  2. リツイート/引用が多い
  3. リプライが活発（議論になっている）
  4. 短時間で急激に伸びている

【出力形式】
以下のJSON形式で10件出力してください:

\`\`\`json
{
  "posts": [
    {
      "author_username": "実際のユーザー名",
      "author_name": "表示名",
      "text": "投稿内容（280文字以内）",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "retweets": 数値,
      "replies": 数値,
      "buzz_reason": "なぜバズっているか一言"
    }
  ]
}
\`\`\`

【重要】
- 必ず実在するPostのURLを含めてください
- 架空の投稿を作成しないでください
- URLは必ず https://x.com/ユーザー名/status/数字 の形式で
`;

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
      const errorText = await response.text();
      throw new Error(`Grok API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const posts = extractPostsFromResponse(data, genre);

    return res.status(200).json({ posts, genre });
  } catch (error: any) {
    console.error('[API] Error collecting posts:', error);
    return res.status(500).json({ error: error.message });
  }
}

function extractPostsFromResponse(data: any, genre: string): any[] {
  const posts: any[] = [];
  let fullText = '';

  // output配列からテキストを抽出
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

  // フォールバック
  if (!fullText && data.text && typeof data.text === 'string') {
    fullText = data.text;
  }

  // JSONを抽出
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
            name: p.author_name || p.name || p.author_username || p.username || 'ユーザー',
            username: p.author_username || p.username || 'unknown',
          },
          text: p.text || p.content || '',
          url: p.url || `https://x.com/i/status/${postId}`,
          metrics: {
            likes: p.likes || p.like_count || 0,
            retweets: p.retweets || p.retweet_count || 0,
            replies: p.replies || p.reply_count || 0,
          },
          buzzReason: p.buzz_reason || p.reason,
          genre: genre,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error('[Extract] Failed to parse JSON:', e);
    }
  }

  return posts.slice(0, 10);
}
