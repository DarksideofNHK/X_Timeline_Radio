import type { VercelRequest, VercelResponse } from '@vercel/node';

// Gemini 3 Flash Preview
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

// ジャンル情報
const GENRE_INFO: Record<string, { name: string; icon: string }> = {
  trending: { name: '今バズってる話題', icon: '🔥' },
  politics: { name: '政治ニュース', icon: '🏛️' },
  economy: { name: '経済・マネー', icon: '💹' },
  lifestyle: { name: '暮らし・生活', icon: '🏠' },
  entertainment: { name: 'エンタメ', icon: '🎬' },
  science: { name: '科学・テクノロジー', icon: '🔬' },
  international: { name: '国際ニュース', icon: '🌍' },
};

const SEGMENT_ORDER = ['trending', 'politics', 'economy', 'lifestyle', 'entertainment', 'science', 'international'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const { allPosts, apiKey, style = 'comprehensive' } = req.body;

    // 全投稿をジャンルごとにフォーマット
    let allPostsText = '';
    let totalPostCount = 0;

    for (const genre of SEGMENT_ORDER) {
      const posts = allPosts[genre] || [];
      if (posts.length > 0) {
        const info = GENRE_INFO[genre];
        allPostsText += `\n\n### ${info.icon} ${info.name}（${posts.length}件）\n`;
        allPostsText += formatPostsForPrompt(posts, info.name);
        totalPostCount += posts.length;
      }
    }

    console.log(`[FullScript] Generating script for ${totalPostCount} posts`);

    const prompt = `あなたはラジオ番組のパーソナリティです。Xで話題の投稿を紹介する番組の台本を作成してください。

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
以下のような表現は絶対に含めないでください：
- ❌ 「（ジングル）」「（軽快な音楽）」「（SE）」などの演出指示
- ❌ 「♪」「🎵」などの音楽記号
- ❌ カッコ書きの補足説明
- ❌ 「BGM：〇〇」などのト書き

【重要：固有名詞の読み方（重複禁止）】
音声合成（TTS）で正しく読み上げられるよう、以下のルールを守ってください。
**絶対に同じ名前を漢字とひらがなの両方で出力しないこと！**

1. **人名**：
   - 難読の場合は「ひらがなのみ」で出力（漢字を書かない）
   - ✅ 正しい例：「やまもとたろうさん」
   - ❌ 間違い例：「山本太郎、やまもとたろう、さん」（重複している）
   - 一般的な名前（田中、山田など）は漢字のままでOK

2. **ユーザー名（@）**：
   - 「@username さん」の形式で出力
   - ❌ 「アットマーク」は不要
   - ✅ 正しい例：「@narumi さんの投稿です」

3. **外国人名・外来語**：
   - カタカナのみで表記
   - ✅ 正しい例：「イーロン・マスクさん」

4. **企業・組織名**：
   - カタカナ読みのみで出力
   - ✅ 正しい例：「ナサ」「グーグル」「オープンエーアイ」
   - ❌ 間違い例：「NASA、ナサ」（重複している）

5. **地名**：
   - 難読の場合はひらがなのみで出力
   - ✅ 正しい例：「こうべ三宮」
   - ❌ 間違い例：「神戸、こうべ、」（重複している）

**重要**: 読み仮名を追加する場合は、元の表記を削除してひらがな/カタカナのみにすること。両方を並べて書かないこと。

【番組概要】
- 番組名: X Timeline Radio
- コンセプト: Xで話題になっている投稿をテンポよく紹介

【今回の投稿データ】
${allPostsText}

【番組構成】

1. **オープニング** (短く簡潔に)
   - 「X Timeline Radio、始まります。今日の話題をお届けします。」程度でOK
   - 自己紹介は不要
   - 長い前置きは不要

2. **7つのコーナー**
   - 🔥 今バズってる話題
   - 🏛️ 政治ニュース
   - 💹 経済・マネー
   - 🏠 暮らし・生活
   - 🎬 エンタメ
   - 🔬 科学・テクノロジー
   - 🌍 国際ニュース

   各コーナーで：
   - コーナー名を言う（「続いては政治ニュースです」など）
   - 投稿紹介（@ユーザー名さんの投稿です、として原文を読む）
   - 短いコメント（「なるほど」「興味深いですね」など一言）
   - 次のコーナーへシンプルに繋ぐ

3. **エンディング** (短く)
   - 「以上、X Timeline Radioでした。また次回お会いしましょう。」程度

【スタイルガイド】
- テンポよく、簡潔に
- 投稿内容は原文を読む（URLは省略）
- 過度な盛り上げや長いコメントは不要
- 政治的な投稿は中立的に
- 「では」「さて」などの繋ぎ言葉でテンポを出す

【出力形式】
JSON形式で出力。scriptは必ず「そのまま読み上げられる」テキストのみ：

\`\`\`json
{
  "sections": [
    {
      "id": "opening",
      "type": "opening",
      "title": "オープニング",
      "script": "X Timeline Radio、始まります。今日もXで話題の投稿をお届けします。まずはバズっている話題から。",
      "estimatedDuration": 15
    },
    {
      "id": "corner-trending",
      "type": "corner",
      "genre": "trending",
      "title": "🔥 今バズってる話題",
      "script": "最初の投稿です。@〇〇さん。「投稿内容」。なるほど、これは話題になりますね。続いて...",
      "estimatedDuration": 120
    }
  ],
  "totalDuration": 20
}
\`\`\`

scriptには演出指示やカッコ書きを含めず、純粋な読み上げテキストのみを出力してください。`;

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 65536,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText.slice(0, 200)}`);
    }

    const data = await response.json();
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // JSONを抽出
    let parsed: any;
    try {
      parsed = extractJSON(responseText);
    } catch (e) {
      console.error('[FullScript] Failed to parse JSON:', e);
      throw new Error('Failed to parse Gemini response as JSON');
    }

    // セクションをチャンク分割
    const sections = parsed.sections.map((section: any, index: number) => {
      const script = section.script || '';
      const chunks = splitIntoChunks(script);

      return {
        id: section.id || `section-${index}`,
        type: section.type || 'corner',
        genre: section.genre,
        title: section.title || '',
        chunks,
        estimatedDuration: section.estimatedDuration || 180,
      };
    });

    const totalDuration = parsed.totalDuration || 30;

    return res.status(200).json({ sections, totalDuration });
  } catch (error: any) {
    console.error('[API] Error generating full script:', error);
    return res.status(500).json({ error: error.message });
  }
}

function formatPostsForPrompt(posts: any[], genreName: string): string {
  return posts
    .map((p: any, i: number) => {
      const metrics = [];
      if (p.metrics?.likes > 0) metrics.push(`いいね${p.metrics.likes.toLocaleString()}`);
      if (p.metrics?.retweets > 0) metrics.push(`RT${p.metrics.retweets.toLocaleString()}`);
      const metricsStr = metrics.length > 0 ? `（${metrics.join('/')}）` : '';
      const buzzReason = p.buzzReason ? ` [バズ理由: ${p.buzzReason}]` : '';
      return `${i + 1}. @${p.author?.username}${p.author?.name !== p.author?.username ? `（${p.author?.name}）` : ''}さん${metricsStr}${buzzReason}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 200)}」`;
    })
    .join('\n\n');
}

function splitIntoChunks(text: string, maxLength: number = 2000): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      const sentences = paragraph.split(/(?<=[。！？])/);
      for (const sentence of sentences) {
        if (currentChunk.length + sentence.length > maxLength) {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk += sentence;
        }
      }
    } else if (currentChunk.length + paragraph.length + 2 > maxLength) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

function extractJSON(text: string): any {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return JSON.parse(codeBlockMatch[1].trim());
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }

  throw new Error('No JSON found in response');
}
