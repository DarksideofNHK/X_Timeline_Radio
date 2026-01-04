import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SHOW_TYPES } from './show-types';

// Gemini API
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.0-flash-preview:generateContent';

// レガシー: X Timeline Radio用ジャンル情報
const LEGACY_GENRE_INFO: Record<string, { name: string; icon: string }> = {
  trending: { name: '今バズってる話題', icon: '🔥' },
  politics: { name: '政治ニュース', icon: '🏛️' },
  economy: { name: '経済・マネー', icon: '💹' },
  lifestyle: { name: '暮らし・生活', icon: '🏠' },
  entertainment: { name: 'エンタメ', icon: '🎬' },
  science: { name: '科学・テクノロジー', icon: '🔬' },
  international: { name: '国際ニュース', icon: '🌍' },
};

const LEGACY_SEGMENT_ORDER = ['trending', 'politics', 'economy', 'lifestyle', 'entertainment', 'science', 'international'];

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
    const { allPosts, apiKey, showType } = req.body;

    console.log(`[FullScript] Request: showType=${showType}, allPosts keys=${allPosts ? Object.keys(allPosts).join(',') : 'null'}`);

    if (!apiKey) {
      return res.status(400).json({ error: 'Gemini API key is required' });
    }

    if (!allPosts || Object.keys(allPosts).length === 0) {
      return res.status(400).json({ error: 'No posts provided' });
    }

    // 日付情報を生成
    const now = new Date();
    const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const month = japanTime.getMonth() + 1;
    const day = japanTime.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[japanTime.getDay()];

    let prompt: string;
    let showConfig = SHOW_TYPES[showType];

    // 番組タイプに応じたプロンプト生成
    if (showType === 'politician-watch') {
      prompt = generatePoliticianWatchPrompt(allPosts, month, day, weekday);
    } else if (showType === 'old-media-buster') {
      prompt = generateOldMediaBusterPrompt(allPosts, month, day, weekday);
    } else {
      // レガシー: X Timeline Radio
      prompt = generateLegacyPrompt(allPosts, month, day, weekday);
    }

    console.log(`[FullScript] Generating script for showType: ${showType || 'legacy'}`);

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.9,
          maxOutputTokens: 16384,
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
      console.error('[FullScript] Raw response:', responseText.slice(0, 500));
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

    const totalSeconds = sections.reduce((sum: number, section: any) => {
      return sum + (section.estimatedDuration || 180);
    }, 0);
    const totalDuration = Math.round(totalSeconds / 60);

    // 番組設定を返す
    return res.status(200).json({
      sections,
      totalDuration,
      showType: showType || 'x-timeline-radio',
      showConfig: showConfig ? {
        name: showConfig.name,
        voice: showConfig.voice,
        bgm: showConfig.bgm,
        allowDownload: showConfig.allowDownload,
        ttsInstructions: showConfig.ttsInstructions,
      } : null,
    });
  } catch (error: any) {
    console.error('[API] Error generating full script:', error);
    console.error('[API] Error stack:', error.stack);
    return res.status(500).json({
      error: error.message || 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// ========================================
// X政治家ウオッチ用プロンプト
// ========================================
function generatePoliticianWatchPrompt(allPosts: any, month: number, day: number, weekday: string): string {
  // 与党・野党・一般でグループ化
  let rulingPartyPosts = '';
  let oppositionPosts = '';
  let publicPosts = '';

  const genreInfo: Record<string, { name: string; icon: string; camp: string }> = {
    'ruling-ldp': { name: '自民党', icon: '🔴', camp: '与党' },
    'ruling-komeito': { name: '公明党', icon: '🟡', camp: '与党' },
    'opposition-cdp': { name: '立憲民主党', icon: '🔵', camp: '野党' },
    'opposition-ishin': { name: '日本維新の会', icon: '🟢', camp: '野党' },
    'opposition-dpfp': { name: '国民民主党', icon: '🟠', camp: '野党' },
    'opposition-others': { name: 'その他野党', icon: '🟣', camp: '野党' },
    'public-reaction': { name: '国民の声', icon: '👥', camp: '一般' },
  };

  for (const [genreId, posts] of Object.entries(allPosts)) {
    if (!Array.isArray(posts) || posts.length === 0) continue;
    const info = genreInfo[genreId];
    if (!info) continue;

    const postsText = posts.map((p: any, i: number) => {
      const stance = p.stance ? ` [${p.stance}]` : '';
      const topic = p.topic ? ` 【${p.topic}】` : '';
      return `${i + 1}. ${p.author?.name || 'ユーザー'}${stance}${topic}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 200)}」`;
    }).join('\n\n');

    if (info.camp === '与党') {
      rulingPartyPosts += `\n### ${info.icon} ${info.name}\n${postsText}\n`;
    } else if (info.camp === '野党') {
      oppositionPosts += `\n### ${info.icon} ${info.name}\n${postsText}\n`;
    } else {
      publicPosts += `\n### ${info.icon} ${info.name}\n${postsText}\n`;
    }
  }

  return `あなたは「X政治家ウオッチ」の台本作家です。プロレス実況風の熱い政治討論番組を作ります。

【番組コンセプト】
日本の国政政党の政治家のX投稿を分析し、与党vs野党の対立構造を「政治バトル」として熱く実況する番組。
モデレーターはスポーツ実況アナウンサーのように、政治家同士の論戦を盛り上げる。

【モデレーターキャラクター】
- スポーツ実況アナウンサー風
- テンション高め、熱い語り口
- 「おーっと！」「これは効いた！」「反撃だー！」などの表現
- ただし特定政党への肩入れはせず、両陣営を平等に煽る
- 政策の本質はしっかり伝える

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
- ❌ 「（ジングル）」「（SE）」「（歓声）」などの演出指示
- ❌ カッコ書きの補足説明
- ✅ 実況者が話す言葉のみ

【重要：TTSの読み方（必ず守ること）】
- 政治家名はひらがなで（例：たかいち さなえ、いしば しげる）
- 政党名ははっきりと
- 英語はカタカナで
- 難読漢字・熟語はひらがなで書く：
  - 舌戦→ぜっせん、論戦→ろんせん、激戦→げきせん
  - 反駁→はんばく、糾弾→きゅうだん、弾劾→だんがい
  - 与党→よとう、野党→やとう
  - 閣僚→かくりょう、大臣→だいじん
- 中学生でも読める漢字以外は基本的にひらがなで

【番組概要】
- 番組名: X政治家ウオッチ
- 放送日: ${month}月${day}日（${weekday}）

【収集した与党の投稿】
${rulingPartyPosts || '（該当なし）'}

【収集した野党の投稿】
${oppositionPosts || '（該当なし）'}

【国民の声】
${publicPosts || '（該当なし）'}

【番組構成】

1. **オープニング**（60-90秒）
   - 「X政治家ウオッチ、${month}月${day}日${weekday}曜日！」
   - 「今日も政界のリングから熱い戦いをお届けします！」
   - 今日の見どころ・対立ポイントを煽る予告

2. **与党陣営の動き**（3-4分）
   - 「まずは与党コーナーから！」
   - 自民党・公明党の主要な発言を紹介
   - 政策スタンスを解説

3. **野党陣営の反撃**（3-4分）
   - 「続いて野党陣営！」
   - 立憲・維新・国民・その他野党の発言
   - 与党への批判・反論を紹介

4. **激突！対立ポイント分析**（2-3分）
   - 「さあ、ここからが本日のメインイベント！」
   - 与党と野党の主張を対比

5. **国民の声**（2分）
   - 「ここで国民の声を聞いてみましょう！」
   - 一般の反応を紹介

6. **エンディング**（60秒）
   - 今日の政治バトルまとめ
   - 「X政治家ウオッチ、また次回！」

【出力形式】
\`\`\`json
{
  "sections": [
    { "id": "opening", "type": "opening", "title": "オープニング", "script": "読み上げテキスト", "estimatedDuration": 90 },
    { "id": "ruling-party", "type": "segment", "title": "与党陣営", "script": "読み上げテキスト", "estimatedDuration": 180 },
    { "id": "opposition", "type": "segment", "title": "野党陣営", "script": "読み上げテキスト", "estimatedDuration": 180 },
    { "id": "clash", "type": "segment", "title": "対立ポイント", "script": "読み上げテキスト", "estimatedDuration": 150 },
    { "id": "public-voice", "type": "segment", "title": "国民の声", "script": "読み上げテキスト", "estimatedDuration": 120 },
    { "id": "ending", "type": "ending", "title": "エンディング", "script": "読み上げテキスト", "estimatedDuration": 60 }
  ]
}
\`\`\`

台本をJSON形式で出力してください。`;
}

// ========================================
// オールドメディアをぶっ壊せラジオ用プロンプト
// ========================================
function generateOldMediaBusterPrompt(allPosts: any, month: number, day: number, weekday: string): string {
  const genreInfo: Record<string, { name: string; icon: string }> = {
    'nhk': { name: 'NHK批判', icon: '📺' },
    'newspapers': { name: '新聞批判', icon: '📰' },
    'tv-stations': { name: '民放批判', icon: '📡' },
  };

  let allPostsText = '';
  for (const [genreId, posts] of Object.entries(allPosts)) {
    if (!Array.isArray(posts) || posts.length === 0) continue;
    const info = genreInfo[genreId];
    if (!info) continue;

    const postsText = posts.map((p: any, i: number) => {
      return `${i + 1}. ${p.author?.name || 'ユーザー'}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 200)}」`;
    }).join('\n\n');

    allPostsText += `\n### ${info.icon} ${info.name}（${posts.length}件）\n${postsText}\n`;
  }

  return `あなたは「オールドメディアをぶっ壊せラジオ」の台本作家です。皮肉を込めたコメンテーター風の番組を作ります。

【番組コンセプト】
NHK、新聞、民放テレビなどのオールドメディアに対する批判的な投稿を紹介し、皮肉を込めてコメントする番組。
過激すぎず、でも鋭い視点で問題点を指摘する。

【パーソナリティキャラクター】
- 皮肉を込めたコメンテーター
- 低めの落ち着いた声
- 「またですか」「驚きですね」のような皮肉
- 淡々と、しかし鋭く
- 過激な表現は避けつつ、問題点は明確に指摘

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
- ❌ 演出指示やカッコ書き
- ✅ パーソナリティが話す言葉のみ

【重要：TTSの読み方】
- メディア名ははっきりと
- 難読漢字はひらがなで
- 英語はカタカナで

【番組概要】
- 番組名: オールドメディアをぶっ壊せラジオ
- 放送日: ${month}月${day}日（${weekday}）

【収集した投稿】
${allPostsText || '（該当なし）'}

【番組構成】

1. **オープニング**（60秒）
   - 「オールドメディアをぶっ壊せラジオ、${month}月${day}日${weekday}曜日です」
   - 「今日もオールドメディアの問題点をチェックしていきましょう」

2. **NHK批判コーナー**（3-4分）
   - NHKに関する批判的な投稿を紹介
   - 皮肉を込めたコメント

3. **新聞批判コーナー**（3-4分）
   - 朝日、毎日、読売、産経などへの批判
   - 偏向報道、誤報などを指摘

4. **民放批判コーナー**（3-4分）
   - フジ、日テレ、TBS、テレ朝への批判
   - やらせ、偏向などを指摘

5. **エンディング**（60秒）
   - 今日のまとめ
   - 「メディアリテラシー、大事ですね」
   - 「オールドメディアをぶっ壊せラジオ、また次回」

【出力形式】
\`\`\`json
{
  "sections": [
    { "id": "opening", "type": "opening", "title": "オープニング", "script": "読み上げテキスト", "estimatedDuration": 60 },
    { "id": "nhk", "type": "segment", "title": "NHK批判", "script": "読み上げテキスト", "estimatedDuration": 180 },
    { "id": "newspapers", "type": "segment", "title": "新聞批判", "script": "読み上げテキスト", "estimatedDuration": 180 },
    { "id": "tv-stations", "type": "segment", "title": "民放批判", "script": "読み上げテキスト", "estimatedDuration": 180 },
    { "id": "ending", "type": "ending", "title": "エンディング", "script": "読み上げテキスト", "estimatedDuration": 60 }
  ]
}
\`\`\`

台本をJSON形式で出力してください。`;
}

// ========================================
// レガシー: X Timeline Radio用プロンプト
// ========================================
function generateLegacyPrompt(allPosts: any, month: number, day: number, weekday: string): string {
  let allPostsText = '';
  let totalPostCount = 0;

  for (const genre of LEGACY_SEGMENT_ORDER) {
    const posts = allPosts[genre] || [];
    if (posts.length > 0) {
      const info = LEGACY_GENRE_INFO[genre];
      allPostsText += `\n\n### ${info.icon} ${info.name}（${posts.length}件）\n`;
      allPostsText += formatPostsForPrompt(posts);
      totalPostCount += posts.length;
    }
  }

  return `あなたはラジオ番組のパーソナリティです。Xで話題の投稿を紹介する番組の台本を作成してください。

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
- ❌ 演出指示やカッコ書き
- ✅ パーソナリティが話す言葉のみ

【重要：TTSの読み方】
- 英語はカタカナで
- 難読漢字はひらがなで
- @マークは読まない

【番組概要】
- 番組名: X Timeline Radio
- 放送日: ${month}月${day}日（${weekday}）

【今回の投稿データ】
${allPostsText}

【番組構成】
1. オープニング（30-45秒）
2. 7つのコーナー（各コーナー投稿を紹介）
3. エンディング（短く）

【出力形式】
\`\`\`json
{
  "sections": [
    { "id": "opening", "type": "opening", "title": "オープニング", "script": "読み上げテキスト", "estimatedDuration": 30 },
    { "id": "corner-trending", "type": "corner", "genre": "trending", "title": "🔥 今バズってる話題", "script": "読み上げテキスト", "estimatedDuration": 180 },
    ...
    { "id": "ending", "type": "ending", "title": "エンディング", "script": "読み上げテキスト", "estimatedDuration": 30 }
  ]
}
\`\`\`

台本をJSON形式で出力してください。`;
}

function formatPostsForPrompt(posts: any[]): string {
  return posts
    .map((p: any, i: number) => {
      const metrics = [];
      if (p.metrics?.likes > 0) metrics.push(`いいね${p.metrics.likes.toLocaleString()}`);
      if (p.metrics?.retweets > 0) metrics.push(`RT${p.metrics.retweets.toLocaleString()}`);
      const metricsStr = metrics.length > 0 ? `（${metrics.join('/')}）` : '';
      return `${i + 1}. ${p.author?.name || 'ユーザー'}${metricsStr}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 200)}」`;
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
