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

    // 今日の日付情報を生成
    const now = new Date();
    const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const year = japanTime.getFullYear();
    const month = japanTime.getMonth() + 1;
    const day = japanTime.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[japanTime.getDay()];
    const todayString = `${year}年${month}月${day}日（${weekday}）`;

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

【重要：難読漢字のひらがな化】
音声合成（TTS）で正しく読み上げられるよう、中学生以上の難読漢字はひらがなで書いてください。

**ひらがなで書く例：**
- ✅「こうごうしい」 ←「神々しい」は誤読されやすい
- ✅「おごそかな」 ←「厳かな」
- ✅「あでやか」 ←「艶やか」
- ✅「はなばなしい」 ←「華々しい」
- ✅「まばゆい」 ←「眩い」
- ✅「いさましい」 ←「勇ましい」
- ✅「けなげ」 ←「健気」
- ✅「いにしえ」 ←「古」
- ✅「おぼろげ」 ←「朧げ」
- ✅「うるわしい」 ←「麗しい」
- ✅「いとおしい」 ←「愛おしい」
- ✅「たくましい」 ←「逞しい」
- ✅「あらたまった」 ←「改まった」
- ✅「あざやか」 ←「鮮やか」

**小中学生が読める一般的な漢字はそのまま：**
- ✅「美しい」「大きい」「楽しい」「素敵」「話題」などは漢字のままでOK

【重要：英語・アルファベットのカタカナ化】
英語やアルファベット表記は、TTSが正しく発音できるようカタカナで書いてください。

**カタカナで書く例：**
- ✅「エックスタイムラインラジオ」 ←「X Timeline Radio」
- ✅「エックス」 ←「X」（SNSの名前）
- ✅「ツイッター」 ←「Twitter」
- ✅「インスタグラム」 ←「Instagram」
- ✅「ユーチューブ」 ←「YouTube」
- ✅「ティックトック」 ←「TikTok」
- ✅「ブイチューバー」 ←「VTuber」
- ✅「エーアイ」 ←「AI」
- ✅「エスエヌエス」 ←「SNS」
- ✅「アールティー」 ←「RT」（リツイート）

**そのまま書いてよい例（TTSが正しく読める）：**
- ✅ 数字：「100万」「2026年」
- ✅ 一般的な略語：「OK」「URL」

【重要：ユーザー名の読み方】
**@マークは絶対に読まない！「アット」「アットマーク」は禁止！**

**努力目標：ユーザー名はできるだけカタカナで読みやすく変換してください。**
- 例：「DEATHDOL_NOTE」→「デスドルノートさん」
- 例：「narumi」→「ナルミさん」
- 例：「usadapekora」→「ウサダペコラさん」

※完璧な変換が難しい場合は、読みやすさを優先して適宜判断してください。

【重要：固有名詞の読み方】
音声合成（TTS）で正しく読み上げられるよう、すべての固有名詞をひらがなまたはカタカナで出力してください。

**基本ルール：**
- 人名（芸能人、政治家、VTuber、YouTuber等）→ ひらがなで出力
- 外国人名・企業名・英語表記 → カタカナで出力
- 漢字表記とふりがなの重複は絶対禁止（どちらか一方のみ）

**数字・日付：**
- 年月日は「2026年1月3日」のようにアラビア数字で書く（TTSが正しく読む）

【番組概要】
- 番組名: X Timeline Radio
- コンセプト: Xで話題になっている投稿をテンポよく紹介
- 今日の日付: ${todayString}

【今回の投稿データ】
${allPostsText}

【番組構成】

1. **オープニング**（30-45秒程度）
   以下の流れで構成してください：

   A. **挨拶と日付**
      - 「X Timeline Radio、${month}月${day}日${weekday}曜日です。」

   B. **今日は何の日？トリビア**（へーっとなる豆知識）
      - 今日（${month}月${day}日）にちなんだ記念日、歴史的出来事、または季節の話題を1つ紹介
      - 例：「今日1月3日は『ひとみの日』。1と3で『ひとみ』の語呂合わせだそうです。目を大切にしたいですね。」
      - 例：「今日は1969年に日本初のコンビニが開店した日だそうです。今では生活に欠かせない存在ですよね。」
      - 堅苦しくなく、ちょっとした雑学として軽く紹介
      - 2-3文程度で簡潔に

   C. **リスナーへの一言**（元気づけるコメント）
      - 例：「今日も一日、良い情報との出会いがありますように。それでは始めていきましょう。」
      - 例：「皆さんにとって素敵な一日になりますように。さあ、今日の話題をチェックしていきましょう。」
      - 例：「今日も楽しんでいってくださいね。それでは参りましょう。」
      - ※「まずは〇〇コーナーから」とは言わない（次のセクションと重複するため）

   ※オープニングは番組の「つかみ」です。リスナーが「へー」と思える小ネタで興味を引き、前向きな気持ちで本編に入れるようにしてください。

2. **7つのコーナー**（各コーナー最低5件以上の投稿を紹介）
   - 🔥 今バズってる話題
   - 🏛️ 政治ニュース
   - 💹 経済・マネー
   - 🏠 暮らし・生活
   - 🎬 エンタメ
   - 🔬 科学・テクノロジー
   - 🌍 国際ニュース

   **重要：提供された投稿はできるだけ全て紹介してください。省略しないこと。**

   **各コーナーの構成：**

   A. **コーナー冒頭のトレンド概要**（2-3文で簡潔に）
      - 集めた投稿から読み取れる全体傾向を短く語る
      - 例：「エンタメコーナーです。今日は新年ということもあり、VTuberや声優さんの新年挨拶が多く見られますね。プレゼントキャンペーンも盛り上がっています。」

   B. **投稿の紹介**（ストーリー性を意識）
      - 関連する投稿はまとめて紹介（例：新年挨拶系、キャンペーン系など）
      - 投稿間のつながりを意識した繋ぎ言葉を使う
      - 例：「新年挨拶が続きますが、次は...」「同じくVTuberから...」「話題を変えて...」

   C. **各投稿の紹介フォーマット**
      - 「続いてはnarumiさんの投稿です」（@なし、アットなし、スペースなし）
      - 投稿内容を原文のまま読む（URLは省略）
      - 一言コメント（「なるほど」「素敵ですね」など短く）

   D. **コーナー締め**
      - 「以上、エンタメコーナーでした」程度で簡潔に

3. **エンディング** (短く)
   - 「以上、X Timeline Radioでした。また次回お会いしましょう。」程度

【スタイルガイド】
- テンポよく、簡潔に
- 投稿内容は原文を読む（URLは省略）
- 過度な盛り上げや長いコメントは不要
- 政治的な投稿は中立的に
- 関連する投稿をグルーピングして、話の流れを作る
- 「では」「さて」「続いて」「同じく」などの繋ぎ言葉でテンポを出す

【重要：話題転換時の間】
同じコーナー内でも、話題が大きく変わる場面では「　」（全角スペース）を入れて間を作ってください。
これにより、音声合成がワンテンポ間を置いて自然に聞こえます。

**使い方：**
- ✅ 「素敵ですね。　さて、話題を変えて経済の話題です。」（話題転換で全角スペース）
- ✅ 「以上がプレゼント系でした。　続いて新年挨拶に移りましょう。」（サブトピック転換で全角スペース）
- ❌ 「続いてnarumiさんの投稿です。　」（同じ話題の続きには不要）

**全角スペースを入れるタイミング：**
- コーナー内で話題のカテゴリが変わるとき
- 「さて」「話題を変えて」「では次に」などの場面転換フレーズの前
- 同じカテゴリの投稿紹介が続く場合は不要

【出力形式】
JSON形式で出力。scriptは必ず「そのまま読み上げられる」テキストのみ：

\`\`\`json
{
  "sections": [
    {
      "id": "opening",
      "type": "opening",
      "title": "オープニング",
      "script": "X Timeline Radio、1月3日金曜日です。今日1月3日は『ひとみの日』だそうです。1と3で『ひとみ』の語呂合わせなんですね。目の健康、大事にしたいですね。皆さんにとって素敵な一日になりますように。それでは始めていきましょう。",
      "estimatedDuration": 30
    },
    {
      "id": "corner-entertainment",
      "type": "corner",
      "genre": "entertainment",
      "title": "🎬 エンタメ",
      "script": "エンタメコーナーです。今日は新年ということもあり、VTuberや声優さんからの新年挨拶や、プレゼントキャンペーンの投稿が目立ちますね。では早速見ていきましょう。まずはプレゼントキャンペーンから。nitamusement777さんの投稿です。「新年プレゼントキャンペーン第三弾...」実機プレゼントは夢がありますね。同じくキャンペーン系で、RC_REJECTさんの投稿です。「いつもリジェクトを応援してくださるファンの皆様...」豪華なプレゼントですね。続いて新年挨拶に移りましょう。usadapekoraさんの投稿です。「新春三期生24時間配信、完走...」完走お疲れ様でした。以上、エンタメコーナーでした。",
      "estimatedDuration": 180
    }
  ],
  "totalDuration": 20
}
\`\`\`

scriptには演出指示やカッコ書きを含めず、純粋な読み上げテキストのみを出力してください。@マークは絶対に含めないこと。`;

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

    // セクションのestimatedDuration（秒）を合計して分に変換
    const totalSeconds = sections.reduce((sum: number, section: any) => {
      return sum + (section.estimatedDuration || 180);
    }, 0);
    const totalDuration = Math.round(totalSeconds / 60);

    console.log(`[FullScript] Total duration: ${totalSeconds}s = ${totalDuration}min`);

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
