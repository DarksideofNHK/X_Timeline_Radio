import type { BuzzPost, Genre, CollectBuzzPostsResponse, RelatedPost } from '../../src/types/index.js';
import { GENRES } from '../../src/lib/genres.js';

const GROK_API_URL = 'https://api.x.ai/v1/responses';

export async function collectBuzzPosts(
  genre: Genre,
  apiKey: string
): Promise<CollectBuzzPostsResponse> {
  const genreConfig = GENRES.find((g) => g.id === genre);
  if (!genreConfig) {
    throw new Error(`Unknown genre: ${genre}`);
  }

  // 日付範囲（過去6時間）
  const now = new Date();
  const fromDate = new Date(now.getTime() - 6 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];
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

  console.log(`[Grok] Searching for ${genreConfig.name}...`);

  const requestBody = {
    model: 'grok-4-1-fast-reasoning',
    tools: [
      {
        type: 'x_search',
        x_search: {
          from_date: fromDate,
          to_date: toDate,
        },
      },
    ],
    input: prompt,
  };

  const response = await fetch(GROK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Grok API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // デバッグ: レスポンス構造をログ
  console.log(`[Grok] Response keys:`, Object.keys(data));

  // トップレベルの text フィールドを確認
  if (data.text !== undefined) {
    console.log(`[Grok] data.text type:`, typeof data.text);
    if (typeof data.text === 'string') {
      console.log(`[Grok] data.text (first 1000 chars):`, data.text.substring(0, 1000));
    } else if (typeof data.text === 'object') {
      console.log(`[Grok] data.text (object):`, JSON.stringify(data.text, null, 2).substring(0, 1000));
    } else {
      console.log(`[Grok] data.text value:`, data.text);
    }
  }

  if (data.output) {
    console.log(`[Grok] Output items:`, data.output.length);
    data.output.forEach((item: any, i: number) => {
      console.log(`  [${i}] type: ${item.type}, keys: ${Object.keys(item).join(', ')}`);
      // messageタイプの内容を表示
      if (item.type === 'message' && item.content) {
        console.log(`    content length: ${item.content.length}`);
        item.content.forEach((c: any, j: number) => {
          console.log(`    [content ${j}] type: ${c.type}, keys: ${Object.keys(c).join(', ')}`);
          // すべてのテキスト系コンテンツを表示
          if (c.text) {
            console.log(`    [content ${j}] text (first 500 chars):`);
            console.log(`    ${c.text.substring(0, 500)}`);
          }
        });
      }
    });
  }

  // レスポンスからPostとannotationsを抽出
  const { posts, annotations } = await extractPostsFromResponse(data, genre);

  console.log(`[Grok] Found ${posts.length} posts and ${annotations.length} annotations for ${genreConfig.name}`);

  return { posts, genre, annotations };
}

async function extractPostsFromResponse(
  data: any,
  genre: Genre
): Promise<{ posts: BuzzPost[]; annotations: RelatedPost[] }> {
  const posts: BuzzPost[] = [];
  const allAnnotations: RelatedPost[] = [];

  // テキストを抽出（output配列から取得 - これが正しいソース）
  let fullText = '';

  // output配列からテキストを抽出
  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      // messageタイプのアイテムからコンテンツを取得
      if (item.type === 'message' && item.content && Array.isArray(item.content)) {
        for (const content of item.content) {
          // output_text タイプからテキストを取得
          if (content.type === 'output_text' && content.text) {
            fullText += content.text;
            console.log('[Extract] Found output_text content');
          }
        }
      }
    }
  }

  // フォールバック: トップレベルの text が文字列の場合のみ使用
  if (!fullText && data.text && typeof data.text === 'string') {
    fullText = data.text;
    console.log('[Extract] Using data.text (string fallback)');
  }

  console.log(`[Extract] fullText length: ${fullText.length}`);
  if (fullText.length > 0) {
    console.log(`[Extract] fullText preview: ${fullText.substring(0, 300)}...`);
  }

  // JSONを抽出（複数のフォーマットに対応）
  let jsonText = '';

  // 方法1: ```json ... ``` ブロック
  const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    jsonText = jsonBlockMatch[1].trim();
    console.log('[Extract] Found JSON in code block');
  }

  // 方法2: { "posts": [...] } 形式を直接探す
  if (!jsonText) {
    const jsonObjectMatch = fullText.match(/\{\s*"posts"\s*:\s*\[[\s\S]*?\]\s*\}/);
    if (jsonObjectMatch) {
      jsonText = jsonObjectMatch[0];
      console.log('[Extract] Found JSON object directly');
    }
  }

  // 方法3: [ {...}, {...} ] 形式の配列を探す
  if (!jsonText) {
    const jsonArrayMatch = fullText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
    if (jsonArrayMatch) {
      jsonText = `{"posts": ${jsonArrayMatch[0]}}`;
      console.log('[Extract] Found JSON array directly');
    }
  }

  if (jsonText) {
    console.log(`[Extract] Parsing JSON (${jsonText.length} chars): ${jsonText.substring(0, 200)}...`);
    try {
      const parsed = JSON.parse(jsonText);
      const postsArray = parsed.posts || (Array.isArray(parsed) ? parsed : []);

      for (const p of postsArray) {
        // URLからIDを抽出
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
      console.log(`[Extract] Parsed ${posts.length} posts from JSON`);
    } catch (e) {
      console.error('[Extract] Failed to parse JSON:', e);
      console.error('[Extract] JSON text was:', jsonText.substring(0, 500));
    }
  } else {
    console.log('[Extract] No JSON found in response');
  }

  // annotationsからURL抽出（すべてのURLを収集）
  const citationUrls: string[] = [];

  if (data.output && Array.isArray(data.output)) {
    for (const item of data.output) {
      if (item.content && Array.isArray(item.content)) {
        for (const content of item.content) {
          if (content.annotations && Array.isArray(content.annotations)) {
            for (const ann of content.annotations) {
              const url = ann.url || ann.url_citation?.url;
              if (url && url.includes('/status/')) {
                // status IDを抽出
                const statusIdMatch = url.match(/status\/(\d+)/);
                if (statusIdMatch) {
                  const statusId = statusIdMatch[1];
                  // 正規化したURLを作成
                  const normalizedUrl = `https://x.com/i/status/${statusId}`;

                  // 重複チェック
                  if (!allAnnotations.some(a => a.statusId === statusId)) {
                    allAnnotations.push({
                      url: normalizedUrl,
                      statusId: statusId
                    });
                  }

                  // oEmbed補完用のURLリストにも追加（ユーザー名付きURLのみ）
                  if (!url.includes('/i/status/')) {
                    citationUrls.push(url);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  console.log(`[Extract] Found ${allAnnotations.length} unique annotations`);

  // oEmbedで補完（JSONから取得できなかったPostのみ）
  const existingIds = new Set(posts.map((p) => p.id));
  for (const url of citationUrls.slice(0, 15)) {
    const idMatch = url.match(/status\/(\d+)/);
    if (idMatch && !existingIds.has(idMatch[1])) {
      const enriched = await enrichWithOembed(url, genre);
      if (enriched) {
        posts.push(enriched);
        existingIds.add(enriched.id);
      }
    }
  }

  return {
    posts: posts.slice(0, 10),
    annotations: allAnnotations
  };
}

async function enrichWithOembed(
  url: string,
  genre: Genre
): Promise<BuzzPost | null> {
  try {
    const oembedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=true`;
    const response = await fetch(oembedUrl);

    if (!response.ok) return null;

    const data = await response.json();
    const html = data.html || '';

    // テキスト抽出
    const textMatch = html.match(/<p[^>]*>(.*?)<\/p>/is);
    let text = '';
    if (textMatch) {
      text = textMatch[1]
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim();
    }

    // ユーザー名抽出
    const usernameMatch = html.match(/\(@(\w+)\)/);
    const username = usernameMatch ? usernameMatch[1] : 'unknown';

    // ID抽出
    const idMatch = url.match(/status\/(\d+)/);
    const postId = idMatch ? idMatch[1] : Date.now().toString();

    return {
      id: postId,
      author: {
        id: username,
        name: data.author_name || username,
        username: username,
      },
      text: text,
      url: `https://x.com/${username}/status/${postId}`,
      metrics: {
        likes: 0,
        retweets: 0,
        replies: 0,
      },
      genre: genre,
      createdAt: new Date().toISOString(),
    };
  } catch (e) {
    console.error(`[oEmbed] Failed for ${url}:`, e);
    return null;
  }
}
