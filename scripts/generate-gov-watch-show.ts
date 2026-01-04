#!/usr/bin/env npx tsx
/**
 * 政府発信ウォッチ - 試作版
 * 霞ヶ関の省庁と政令指定都市の公式発表を解説付きで紹介
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const GROK_API_KEY = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// 出力ディレクトリ
const OUTPUT_DIR = path.join(__dirname, '../public/shows/gov-watch-test');

// 政府機関のジャンル定義
const GENRES = [
  {
    id: 'cabinet',
    name: '首相官邸・内閣府',
    query: '首相官邸 OR 内閣府 OR 官房長官 OR 岸田 OR 総理 公式発表 OR 会見 OR 発表'
  },
  {
    id: 'ministries',
    name: '中央省庁',
    query: '(厚労省 OR 厚生労働省 OR 経産省 OR 経済産業省 OR 総務省 OR 財務省 OR 外務省 OR 文科省 OR 国交省 OR 環境省 OR 防衛省 OR デジタル庁) 発表 OR 公表 OR 通知'
  },
  {
    id: 'agencies',
    name: '庁・委員会',
    query: '(気象庁 OR 警察庁 OR 消防庁 OR 金融庁 OR 消費者庁 OR 観光庁 OR 林野庁 OR 水産庁) 発表 OR 注意 OR 警報'
  },
  {
    id: 'cities',
    name: '政令指定都市',
    query: '(札幌市 OR 仙台市 OR さいたま市 OR 千葉市 OR 横浜市 OR 川崎市 OR 名古屋市 OR 京都市 OR 大阪市 OR 神戸市 OR 広島市 OR 福岡市) 公式 OR 発表 OR お知らせ OR 市長'
  },
];

const GENRE_INFO: Record<string, { name: string; icon: string }> = {
  cabinet: { name: '首相官邸・内閣府', icon: '🏛️' },
  ministries: { name: '中央省庁', icon: '🏢' },
  agencies: { name: '庁・委員会', icon: '📋' },
  cities: { name: '政令指定都市', icon: '🏙️' },
};

// 解説者風のTTSインストラクション
const JAPANESE_INSTRUCTIONS = `あなたは「ガバメントウオッチ」の解説キャスターです。

【キャラクター】
政治・行政に詳しい解説者。難しい政府発表を分かりやすく噛み砕いて説明する。中立的だが、視聴者目線で「つまりこういうこと」と解説を加える。

【発話スタイル】
落ち着いた知的なトーンで、ゆっくり丁寧に。専門用語は避け、平易な言葉で説明。

【表現のニュアンス】
「これは要するに」「つまり」「ポイントは」など、解説を入れる時は少しトーンを変える。

【ポーズと呼吸】
解説の前後で間を取る。重要なポイントはゆっくり強調。

【読み方】
省庁名、政策名は明瞭に。数字や日付ははっきりと。英語はカタカナで読む。`;

// Grok APIでPost収集
async function collectPosts(genreConfig: { id: string; name: string; query: string }): Promise<any[]> {
  console.log(`[Collect] ${GENRE_INFO[genreConfig.id]?.icon || '📌'} ${genreConfig.name}...`);

  const now = new Date();
  const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  const prompt = `
あなたは政府・自治体の公式発表をキュレーションする専門家です。

【検索条件】
- ジャンル: ${genreConfig.name}
- 条件: ${genreConfig.query}
- 直近24時間以内に投稿された日本語のPost
- 以下を優先:
  1. 政府機関・自治体の公式アカウントからの投稿
  2. 政策発表、制度変更、注意喚起などの公式情報
  3. 記者会見、閣議決定、通知などの重要発表
  4. 市民生活に関わる情報

【重要】
- 公式発表、正式な情報発信を集めてください
- 批判や意見ではなく、発表内容そのものを優先
- 政治的な論争より、事実の発表を優先

【出力形式】
以下のJSON形式で15件出力してください:

\`\`\`json
{
  "posts": [
    {
      "author_username": "実際のユーザー名",
      "author_name": "表示名（省庁名・自治体名）",
      "text": "投稿内容（280文字以内）",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "retweets": 数値,
      "replies": 数値,
      "buzz_reason": "発表の概要・ポイント"
    }
  ]
}
\`\`\`

【重要】
- 必ず実在するPostのURLを含めてください
- 架空の投稿を作成しないでください
- URLは必ず https://x.com/ユーザー名/status/数字 の形式で
`;

  try {
    const response = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROK_API_KEY}`,
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
    const posts = extractPostsFromResponse(data, genreConfig.id);
    console.log(`[Collect] ${GENRE_INFO[genreConfig.id]?.icon || '📌'} ${posts.length}件取得`);
    return posts;
  } catch (error) {
    console.error(`[Collect] Error:`, error);
    return [];
  }
}

// レスポンス抽出ロジック
function extractPostsFromResponse(data: any, genre: string): any[] {
  const posts: any[] = [];
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

  if (!fullText && data.text && typeof data.text === 'string') {
    fullText = data.text;
  }

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
        });
      }
    } catch (e) {
      console.error('[Extract] Failed to parse JSON:', e);
    }
  }

  return posts.slice(0, 15);
}

// 台本生成
async function generateScript(allPosts: Record<string, any[]>): Promise<any> {
  console.log('[Script] 台本生成中...');

  const now = new Date();
  const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const month = japanTime.getMonth() + 1;
  const day = japanTime.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[japanTime.getDay()];

  let allPostsText = '';
  for (const genre of Object.keys(GENRE_INFO)) {
    const posts = allPosts[genre] || [];
    if (posts.length > 0) {
      const info = GENRE_INFO[genre];
      allPostsText += `\n\n### ${info.icon} ${info.name}（${posts.length}件）\n`;
      allPostsText += posts.map((p, i) => {
        const buzzReason = p.buzzReason ? ` [ポイント: ${p.buzzReason}]` : '';
        return `${i + 1}. @${p.author?.username}（${p.author?.name}）${buzzReason}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 250)}」`;
      }).join('\n\n');
    }
  }

  const prompt = `あなたは「ガバメントウオッチ」の台本作家です。

【番組コンセプト】
霞ヶ関の省庁と政令指定都市の公式発表を、分かりやすい解説付きで紹介する番組。
難しい政府発表を「つまりこういうこと」と噛み砕いて説明する。

【解説キャスターキャラクター】
- 政治・行政に詳しい解説者
- 中立的だが視聴者目線
- 専門用語を避け、平易に説明
- 「要するに」「ポイントは」と解説を入れる

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
- ❌ 「（ジングル）」「（SE）」などの演出指示
- ❌ カッコ書きの補足説明
- ✅ 自然な解説口調の文章のみ

【重要：TTSが誤読しやすい漢字のひらがな化】
訓読みで複数の読み方がある漢字はひらがなにしてください。

【重要：英語のカタカナ化】
英語表記はカタカナで書いてください。

【重要：省庁名の読み方】
- 厚労省→「こうろうしょう」
- 経産省→「けいさんしょう」
- 国交省→「こっこうしょう」
- 文科省→「もんかしょう」
など、略称も正式に読む

【番組概要】
- 番組名: ガバメントウオッチ
- 放送日: ${month}月${day}日（${weekday}）

【今回の政府発信】
${allPostsText}

【番組構成】
1. **オープニング**（20-30秒）
   - 「ガバメントウオッチ、${month}月${day}日${weekday}曜日です。」
   - 今日の主要な発表を予告

2. **首相官邸・内閣府**
   - 官邸からの発表を紹介
   - 「これは要するに〇〇ということです」と解説

3. **中央省庁**
   - 各省庁の発表を紹介
   - 市民生活への影響を解説

4. **庁・委員会**
   - 気象庁、警察庁などの発表
   - 注意点をわかりやすく

5. **政令指定都市**
   - 自治体からの発表
   - 地域の動きを紹介

6. **エンディング**（15-20秒）
   - 今日のまとめ
   - 「ガバメントウオッチでした」

【出力形式】
\`\`\`json
{
  "sections": [
    {
      "id": "opening",
      "type": "opening",
      "title": "オープニング",
      "script": "読み上げテキスト"
    },
    {
      "id": "cabinet",
      "type": "news",
      "title": "首相官邸・内閣府",
      "script": "読み上げテキスト"
    },
    {
      "id": "ministries",
      "type": "news",
      "title": "中央省庁",
      "script": "読み上げテキスト"
    },
    {
      "id": "agencies",
      "type": "news",
      "title": "庁・委員会",
      "script": "読み上げテキスト"
    },
    {
      "id": "cities",
      "type": "news",
      "title": "政令指定都市",
      "script": "読み上げテキスト"
    },
    {
      "id": "ending",
      "type": "ending",
      "title": "エンディング",
      "script": "読み上げテキスト"
    }
  ]
}
\`\`\`

台本をJSON形式で出力してください。`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 16384,
        }
      })
    }
  );

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) {
    console.error('[Script] Raw response:', text.slice(0, 500));
    throw new Error('Failed to parse script JSON');
  }

  const script = JSON.parse(jsonMatch[1].trim());
  console.log(`[Script] ${script.sections.length}セクション生成完了`);

  return script;
}

// TTS生成（落ち着いた男性voice: onyx）
async function generateAudio(text: string, filename: string): Promise<void> {
  console.log(`[TTS] ${filename}`);

  if (!OPENAI_API_KEY) {
    console.log('  ⚠️ OPENAI_API_KEY not set');
    return;
  }

  let response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice: 'onyx',
      response_format: 'mp3',
      instructions: JAPANESE_INSTRUCTIONS,
    }),
  });

  if (!response.ok) {
    console.log('  ⚠️ Fallback to tts-1...');
    response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: 'onyx',
        response_format: 'mp3',
      }),
    });
  }

  if (!response.ok) {
    throw new Error(`TTS failed: ${response.status}`);
  }

  const buffer = await response.arrayBuffer();
  fs.writeFileSync(path.join(OUTPUT_DIR, filename), Buffer.from(buffer));
  console.log(`  ✅ 保存完了`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('🏛️ ガバメントウオッチ - 試作版');
  console.log('='.repeat(60));

  // 出力ディレクトリ作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // 1. Post収集
  console.log('\n📡 Post収集開始...\n');
  const allPosts: Record<string, any[]> = {};

  for (const genre of GENRES) {
    const posts = await collectPosts(genre);
    allPosts[genre.id] = posts;
    await new Promise(r => setTimeout(r, 2000));
  }

  const totalPosts = Object.values(allPosts).reduce((sum, posts) => sum + posts.length, 0);
  console.log(`\n📊 合計 ${totalPosts}件収集完了\n`);

  if (totalPosts === 0) {
    console.log('❌ Postが収集できませんでした');
    return;
  }

  fs.writeFileSync(path.join(OUTPUT_DIR, 'posts.json'), JSON.stringify(allPosts, null, 2));

  // 2. 台本生成
  const script = await generateScript(allPosts);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'script.json'), JSON.stringify(script, null, 2));

  // 3. 音声生成
  if (OPENAI_API_KEY) {
    console.log('\n🎙️ 音声生成開始...\n');

    for (const section of script.sections) {
      const filename = `${section.id}.mp3`;
      await generateAudio(section.script, filename);
      await new Promise(r => setTimeout(r, 500));
    }

    // filelist.txt生成
    const filelist = script.sections.map((s: any) => `file '${s.id}.mp3'`).join('\n');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'filelist.txt'), filelist + '\n');

    console.log('\n✅ 音声生成完了！');
    console.log(`\n連結コマンド:`);
    console.log(`cd ${OUTPUT_DIR} && ffmpeg -f concat -safe 0 -i filelist.txt -c copy full_show.mp3`);
  } else {
    console.log('\n⚠️ OPENAI_API_KEY未設定、台本のみ生成');
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 完了！');
  console.log('='.repeat(60));
}

main().catch(console.error);
