#!/usr/bin/env npx tsx
/**
 * 事件速報ダイジェスト - 試作版
 * 今日起きた主要事件・事故を速報的に紹介
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
const OUTPUT_DIR = path.join(__dirname, '../public/shows/incident-news-test');

// 事件・事故のジャンル定義
const GENRES = [
  { id: 'crime', name: '事件・犯罪', query: '逮捕 OR 事件 OR 犯罪 OR 容疑者 OR 殺人 OR 強盗 OR 詐欺 速報ニュース' },
  { id: 'accident', name: '事故', query: '事故 OR 衝突 OR 火災 OR 爆発 OR 転落 OR 死亡事故 速報ニュース' },
  { id: 'disaster', name: '災害', query: '地震 OR 台風 OR 洪水 OR 土砂崩れ OR 災害 速報' },
  { id: 'scandal', name: '不祥事', query: '不祥事 OR 隠蔽 OR 改ざん OR 横領 OR パワハラ OR セクハラ 発覚' },
];

const GENRE_INFO: Record<string, { name: string; icon: string }> = {
  crime: { name: '事件・犯罪', icon: '🚨' },
  accident: { name: '事故', icon: '🚗' },
  disaster: { name: '災害', icon: '⚠️' },
  scandal: { name: '不祥事', icon: '📋' },
};

// 落ち着いた男性アナウンサー用のTTSインストラクション
const JAPANESE_INSTRUCTIONS = `あなたは「事件速報ダイジェスト」のニュースアナウンサーです。

【キャラクター】
落ち着いた声で淡々と事実を伝えるプロのアナウンサー。感情を抑え、正確に情報を伝えることを重視。

【発話スタイル】
低めの落ち着いたトーンで、ゆっくりはっきりと。重要な情報（日時、場所、人数など）は特に明瞭に発音。

【表現のニュアンス】
感情的にならず、客観的に事実を伝える。深刻な事件でも冷静さを保つ。

【ポーズと呼吸】
各ニュースの区切りでしっかり間を取る。重要な情報の前後で短いポーズ。

【読み方】
数字は明瞭に。地名・人名ははっきりと発音。英語はカタカナで読む。`;

// Grok APIでPost収集
async function collectPosts(genreConfig: { id: string; name: string; query: string }): Promise<any[]> {
  console.log(`[Collect] ${GENRE_INFO[genreConfig.id]?.icon || '📌'} ${genreConfig.name}...`);

  const now = new Date();
  const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  const prompt = `
あなたはXの速報ニュースキュレーターです。

【検索条件】
- ジャンル: ${genreConfig.name}
- 条件: ${genreConfig.query}
- 直近12時間以内に投稿された日本語のPost
- Xならではの速報性を重視:
  1. 「速報」「今」「たった今」「現在」を含む投稿
  2. 現場にいる人からのリアルタイム投稿
  3. 第一報的な情報
  4. 急激に拡散されている投稿

【重要：Xの速報性を活かす】
- テレビより早い「第一報」を集めてください
- 現場からの生の声、目撃情報を優先
- 「○○で事故発生」「今○○で」のようなリアルタイム投稿
- 報道機関の速報ツイートも含める

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
      "buzz_reason": "ニュースの概要"
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

  return posts.slice(0, 10);
}

// 台本生成
async function generateScript(allPosts: Record<string, any[]>): Promise<any> {
  console.log('[Script] 台本生成中...');

  const now = new Date();
  const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const month = japanTime.getMonth() + 1;
  const day = japanTime.getDate();
  const hour = japanTime.getHours();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[japanTime.getDay()];

  let allPostsText = '';
  for (const genre of Object.keys(GENRE_INFO)) {
    const posts = allPosts[genre] || [];
    if (posts.length > 0) {
      const info = GENRE_INFO[genre];
      allPostsText += `\n\n### ${info.icon} ${info.name}（${posts.length}件）\n`;
      allPostsText += posts.map((p, i) => {
        const buzzReason = p.buzzReason ? ` [概要: ${p.buzzReason}]` : '';
        return `${i + 1}. @${p.author?.username}さん${buzzReason}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 250)}」`;
      }).join('\n\n');
    }
  }

  const prompt = `あなたは「事件速報ダイジェスト」の台本作家です。

【番組コンセプト】
今日起きた主要な事件・事故・災害・不祥事を淡々と伝えるニュース番組。
感情を排し、事実のみを正確に伝える。

【アナウンサーキャラクター】
- プロのニュースアナウンサー
- 落ち着いた低めの声
- 感情を抑えて客観的に伝える
- 重要な数字や地名は明瞭に

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
- ❌ 「（ジングル）」「（SE）」などの演出指示
- ❌ カッコ書きの補足説明
- ✅ ニュース原稿として読める文章のみ

【重要：TTSが誤読しやすい漢字のひらがな化】
訓読みで複数の読み方がある漢字はひらがなにしてください。

【重要：英語のカタカナ化】
英語表記はカタカナで書いてください。

【重要：数字・地名の読み方】
- 数字は「3人」「午後2時」のように明確に
- 地名は正式名称で

【番組概要】
- 番組名: 事件速報ダイジェスト
- 放送日時: ${month}月${day}日（${weekday}）${hour}時

【今回のニュース素材】
${allPostsText}

【番組構成】
1. **オープニング**（15-20秒）
   - 「事件速報ダイジェスト、${month}月${day}日${hour}時の情報です。」
   - 主要ニュースの見出しを簡潔に予告

2. **事件・犯罪ニュース**
   - 収集した事件情報を要約して伝える
   - 5W1Hを意識した正確な情報

3. **事故ニュース**
   - 事故情報を伝える
   - 被害状況、現場の状況

4. **災害情報**（該当があれば）
   - 災害関連の情報

5. **不祥事・その他**（該当があれば）
   - 企業・組織の不祥事など

6. **エンディング**（10-15秒）
   - 「以上、事件速報ダイジェストでした。」
   - 次回予告なし、淡々と終わる

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
      "id": "crime-news",
      "type": "news",
      "title": "事件・犯罪",
      "script": "読み上げテキスト"
    },
    {
      "id": "accident-news",
      "type": "news",
      "title": "事故",
      "script": "読み上げテキスト"
    },
    {
      "id": "other-news",
      "type": "news",
      "title": "その他",
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
          maxOutputTokens: 8192,
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
      voice: 'onyx',  // 落ち着いた男性
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
  console.log('🚨 事件速報ダイジェスト - 試作版');
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
