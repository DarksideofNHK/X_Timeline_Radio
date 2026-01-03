import type { BuzzPost, Genre, ScriptSection, ProgramStyle } from '../../src/types/index.js';

// Gemini 3 Flash Preview (最新版)
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

// ジャンル情報
const GENRE_INFO: Record<Genre, { name: string; icon: string }> = {
  trending: { name: '今バズってる話題', icon: '🔥' },
  politics: { name: '政治ニュース', icon: '🏛️' },
  economy: { name: '経済・マネー', icon: '💹' },
  lifestyle: { name: '暮らし・生活', icon: '🏠' },
  entertainment: { name: 'エンタメ', icon: '🎬' },
  science: { name: '科学・テクノロジー', icon: '🔬' },
  international: { name: '国際ニュース', icon: '🌍' },
};

// セグメント順序
const SEGMENT_ORDER: Genre[] = [
  'trending',
  'politics',
  'economy',
  'lifestyle',
  'entertainment',
  'science',
  'international',
];

interface GenerateFullScriptRequest {
  allPosts: Record<Genre, BuzzPost[]>;
  apiKey: string;
  style?: ProgramStyle;
}

interface GenerateFullScriptResponse {
  sections: ScriptSection[];
  totalDuration: number;
}

// 投稿をフォーマット
function formatPostsForPrompt(posts: BuzzPost[], genreName: string): string {
  return posts
    .map((p, i) => {
      const metrics = [];
      if (p.metrics.likes > 0) metrics.push(`いいね${p.metrics.likes.toLocaleString()}`);
      if (p.metrics.retweets > 0) metrics.push(`RT${p.metrics.retweets.toLocaleString()}`);
      const metricsStr = metrics.length > 0 ? `（${metrics.join('/')}）` : '';
      const buzzReason = p.buzzReason ? ` [バズ理由: ${p.buzzReason}]` : '';
      return `${i + 1}. @${p.author.username}${p.author.name !== p.author.username ? `（${p.author.name}）` : ''}さん${metricsStr}${buzzReason}\n   「${p.text.replace(/\n/g, ' ').slice(0, 200)}」`;
    })
    .join('\n\n');
}

// スクリプトをチャンクに分割（TTS用、各2000文字以内）
function splitIntoChunks(text: string, maxLength: number = 2000): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // 段落が長すぎる場合は文で分割
    if (paragraph.length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      // 文で分割
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

// JSONを抽出
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

export async function generateFullScript(
  request: GenerateFullScriptRequest
): Promise<GenerateFullScriptResponse> {
  const { allPosts, apiKey, style = 'comprehensive' } = request;

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

  console.log(`[FullScript] Generating script for ${totalPostCount} posts across ${SEGMENT_ORDER.length} genres`);

  const prompt = `あなたは経験豊富なラジオ番組のパーソナリティです。
NHKラジオ「らじるラボ」やTBSラジオ「荻上チキ・Session」のような、総合情報番組の台本を作成してください。

【番組概要】
- 番組名: X Timeline Radio
- 形式: 20分間の情報バラエティ番組
- コンセプト: Xで話題になっている投稿を紹介しながら、今の日本を読み解く

【今回の投稿データ】
${allPostsText}

【番組構成】
以下の構成でJSONを出力してください：

1. **オープニング** (約1分)
   - 番組タイトルコール
   - 今日のX全体の雰囲気を簡潔に
   - 各コーナーの予告

2. **7つのコーナー** (各3-4分)
   - 🔥 今バズってる話題
   - 🏛️ 政治ニュース
   - 💹 経済・マネー
   - 🏠 暮らし・生活
   - 🎬 エンタメ
   - 🔬 科学・テクノロジー
   - 🌍 国際ニュース

   各コーナーで：
   - コーナー導入（ジングル風の台詞）
   - 投稿紹介（@ユーザー名さんの投稿として原文を読む）
   - 合いの手やコメント（「なるほど〜」「これは面白い」など）
   - ジャンル全体の傾向への言及
   - 次のコーナーへの繋ぎ

3. **エンディング** (約1分)
   - 今日のハイライト振り返り
   - 番組の締めくくり

【スタイルガイド】
- 親しみやすく、でも品のある話し方
- 投稿内容はできるだけ原文のまま読む（URLは省略）
- 過度な盛り上げは不要、淡々と情報を伝える中にユーモアを
- 政治的な投稿は中立的なスタンスでコメント
- 各投稿の紹介後に短いリアクションを入れる

【出力形式】
以下のJSON形式で出力してください。scriptsは必ず読み上げ用の完全なテキストを含めてください：

\`\`\`json
{
  "sections": [
    {
      "id": "opening",
      "type": "opening",
      "title": "オープニング",
      "script": "こんにちは、X Timeline Radioの時間です。今日もXで話題になっている投稿をお届けします...",
      "estimatedDuration": 60
    },
    {
      "id": "corner-trending",
      "type": "corner",
      "genre": "trending",
      "title": "🔥 今バズってる話題",
      "script": "まずは今バズっている話題から...",
      "estimatedDuration": 180
    },
    ...
  ],
  "totalDuration": 30
}
\`\`\`

各セクションのscriptは、そのまま読み上げられる完全なテキストにしてください。`;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 65536,  // 20分番組に十分なトークン
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[FullScript] Gemini API error:', errorText);
    throw new Error(`Gemini API error: ${response.status} - ${errorText.slice(0, 200)}`);
  }

  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  console.log(`[FullScript] Raw response length: ${responseText.length} chars`);

  // JSONを抽出
  let parsed: any;
  try {
    parsed = extractJSON(responseText);
  } catch (e) {
    console.error('[FullScript] Failed to parse JSON:', e);
    console.error('[FullScript] Response text:', responseText.slice(0, 500));
    throw new Error('Failed to parse Gemini response as JSON');
  }

  // セクションをチャンク分割
  const sections: ScriptSection[] = parsed.sections.map((section: any, index: number) => {
    const script = section.script || '';
    const chunks = splitIntoChunks(script);

    return {
      id: section.id || `section-${index}`,
      type: section.type || 'corner',
      genre: section.genre as Genre | undefined,
      title: section.title || '',
      chunks,
      estimatedDuration: section.estimatedDuration || 180,
    };
  });

  const totalDuration = parsed.totalDuration || 30;

  console.log(`[FullScript] Generated ${sections.length} sections, total ${totalDuration} minutes`);
  sections.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.title}: ${s.chunks.length} chunks, ~${s.estimatedDuration}s`);
  });

  return { sections, totalDuration };
}
