#!/usr/bin/env npx tsx
/**
 * オールドメディアをぶっ壊せラジオ - 試作版
 * Vercelと同じロジックをベースに構築
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
const OUTPUT_DIR = path.join(__dirname, '../public/shows/oldmedia-test');

// オールドメディア関連のジャンル定義（Vercelと同じ形式）
const GENRES = [
  { id: 'nhk', name: 'NHK批判', query: 'NHK 偏向報道 OR NHK 受信料 OR NHK 炎上 に関する批判的なPost' },
  { id: 'newspaper', name: '新聞批判', query: '朝日新聞 OR 毎日新聞 OR 東京新聞 偏向 OR 捏造 OR 炎上 に関するPost' },
  { id: 'tv', name: '民放批判', query: 'TBS OR 日テレ OR フジテレビ OR テレビ朝日 やらせ OR 偏向 OR 炎上 に関するPost' },
  { id: 'general', name: 'メディア批判全般', query: 'オールドメディア OR 報道しない自由 OR 切り取り報道 OR マスコミ批判 に関するPost' },
];

const GENRE_INFO: Record<string, { name: string; icon: string }> = {
  nhk: { name: 'NHKウォッチ', icon: '📺' },
  newspaper: { name: '新聞炎上速報', icon: '📰' },
  tv: { name: '民放やらかし情報', icon: '📡' },
  general: { name: 'オールドメディア総括', icon: '🔥' },
};

// 男性DJ用のTTSインストラクション
const JAPANESE_INSTRUCTIONS = `あなたは「オールドメディアをぶっ壊せラジオ」のDJタケシです。

【キャラクター】
既存メディアの問題点を指摘する批評家タイプ。皮肉とユーモアを交え、視聴者目線で語る。ただし下品にならず、知的な批判を心がける。

【発話スタイル】
落ち着いた低めのトーンで、時に皮肉っぽく、時に呆れたように。重要なポイントは少し力を込める。

【表現のニュアンス】
「またですか...」「やれやれ」といった呆れ感を自然に。「これはちょっと...」と問題提起。

【ポーズと呼吸】
皮肉を言う前に少し間を取る。「...」では意味深な沈黙。

【読み方】
メディア名は少し強調。批判的な引用は感情を込めて読む。英語はカタカナで読む。`;

// Grok APIでPost収集（Vercelと同じロジック）
async function collectPosts(genreConfig: { id: string; name: string; query: string }): Promise<any[]> {
  console.log(`[Collect] ${GENRE_INFO[genreConfig.id]?.icon || '📌'} ${genreConfig.name}...`);

  const now = new Date();
  const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  const prompt = `
あなたはXのバズ投稿キュレーターです。

【検索条件】
- ジャンル: ${genreConfig.name}
- 条件: ${genreConfig.query}
- 直近24時間以内に投稿された日本語のPost
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

// Vercelと同じレスポンス抽出ロジック
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
        });
      }
    } catch (e) {
      console.error('[Extract] Failed to parse JSON:', e);
    }
  }

  return posts.slice(0, 10);
}

// 台本生成（regenerate-show.tsと同じロジック）
async function generateScript(allPosts: Record<string, any[]>): Promise<any> {
  console.log('[Script] 台本生成中...');

  const now = new Date();
  const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const year = japanTime.getFullYear();
  const month = japanTime.getMonth() + 1;
  const day = japanTime.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[japanTime.getDay()];
  const todayString = `${year}年${month}月${day}日（${weekday}）`;

  let allPostsText = '';
  for (const genre of Object.keys(GENRE_INFO)) {
    const posts = allPosts[genre] || [];
    if (posts.length > 0) {
      const info = GENRE_INFO[genre];
      allPostsText += `\n\n### ${info.icon} ${info.name}（${posts.length}件）\n`;
      allPostsText += posts.map((p, i) => {
        const metrics = [];
        if (p.metrics?.likes > 0) metrics.push(`いいね${p.metrics.likes.toLocaleString()}`);
        if (p.metrics?.retweets > 0) metrics.push(`RT${p.metrics.retweets.toLocaleString()}`);
        const metricsStr = metrics.length > 0 ? `（${metrics.join('/')}）` : '';
        const buzzReason = p.buzzReason ? ` [理由: ${p.buzzReason}]` : '';
        return `${i + 1}. @${p.author?.username}${p.author?.name !== p.author?.username ? `（${p.author?.name}）` : ''}さん${metricsStr}${buzzReason}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 200)}」`;
      }).join('\n\n');
    }
  }

  const prompt = `あなたは「オールドメディアをぶっ壊せラジオ」の台本作家です。

【番組コンセプト】
NHK、民放、新聞などのオールドメディアの問題点を、Xの声を交えながら痛快に斬っていく番組。
視聴者目線で、偏向報道、やらせ、切り取り報道などを批判的かつ知的に紹介する。

【DJキャラクター】
- 名前: タケシ
- 既存メディアに批判的だが、下品にはならない
- 皮肉とユーモアを交えた知的な語り口
- 「マスゴミ」は使わず「オールドメディア」と呼ぶ

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
- ❌ 「（ジングル）」「（SE）」などの演出指示
- ❌ カッコ書きの補足説明
- ✅ 自然な話し言葉のみ

【重要：TTSが誤読しやすい漢字のひらがな化】
訓読みで複数の読み方がある漢字はひらがなにしてください。

【重要：英語のカタカナ化】
英語表記はカタカナで書いてください。

【重要：ユーザー名の読み方】
@マークは読まない。ユーザー名はカタカナで読みやすく変換。

【番組概要】
- 番組名: オールドメディアをぶっ壊せラジオ
- 今日の日付: ${todayString}

【今回の投稿データ】
${allPostsText}

【番組構成】
1. **オープニング**（30-45秒）
   - 「オールドメディアをぶっ壊せラジオ、${month}月${day}日${weekday}曜日です。」
   - 今日のオールドメディア炎上状況を予告
   - 皮肉を込めた挨拶

2. **4つのコーナー**（各コーナー投稿を全て紹介）
   - 📺 NHKウォッチ
   - 📰 新聞炎上速報
   - 📡 民放やらかし情報
   - 🔥 オールドメディア総括

   各コーナーの構成:
   A. 冒頭でそのジャンルの傾向を皮肉を込めて一言
   B. 各投稿を紹介（投稿者名、内容、なぜ問題か）
   C. DJタケシのツッコミやコメント

3. **エンディング**（20-30秒）
   - 今日の総括
   - 「オールドメディアに負けるな」的なメッセージ

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
      "id": "corner-nhk",
      "type": "corner",
      "genre": "nhk",
      "title": "NHKウォッチ",
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
          temperature: 0.9,
          maxOutputTokens: 8192,
        }
      })
    }
  );

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // JSON抽出
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) {
    console.error('[Script] Raw response:', text.slice(0, 500));
    throw new Error('Failed to parse script JSON');
  }

  const script = JSON.parse(jsonMatch[1].trim());
  console.log(`[Script] ${script.sections.length}セクション生成完了`);

  return script;
}

// TTS生成（男性voice: onyx）
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
      voice: 'onyx',  // 男性の低い声
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
  console.log('🔥 オールドメディアをぶっ壊せラジオ - 試作版');
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
    console.log(`\nBGM追加（Victory Lap -12dB）:`);
    console.log(`ffmpeg -i full_show.mp3 -stream_loop -1 -i ../../../public/bgm/Victory_Lap_2026-01-04T074742.mp3 -filter_complex "[1:a]volume=-12dB[bgm];[0:a][bgm]amix=inputs=2:duration=first[out]" -map "[out]" -y full_show_with_bgm.mp3`);
  } else {
    console.log('\n⚠️ OPENAI_API_KEY未設定、台本のみ生成');
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 完了！');
  console.log('='.repeat(60));
}

main().catch(console.error);
