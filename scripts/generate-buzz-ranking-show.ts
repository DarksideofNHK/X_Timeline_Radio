#!/usr/bin/env npx tsx
/**
 * Xバズネタグランプリ - 試作版
 * 万バズした爆笑ネタ + 大喜利の神回答をランキング形式で紹介
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
const OUTPUT_DIR = path.join(__dirname, '../public/shows/buzz-ranking-test');

// 笑えるネタのジャンル定義
const GENRES = [
  { id: 'funny', name: '爆笑ネタ', query: '面白い OR 笑った OR 草 OR www 万バズ、大量のいいねがついている爆笑ネタ投稿' },
  { id: 'ogiri', name: '大喜利', query: '大喜利 OR お題 OR 回答 秀逸な回答、神回答と言われている投稿' },
  { id: 'relatable', name: 'あるあるネタ', query: 'あるある OR わかる OR それな 共感を呼ぶ日常の面白ネタ' },
  { id: 'genius', name: '天才ボケ', query: '天才 OR センス OR 発想 予想外の切り返しや秀逸な例えで笑わせる投稿' },
];

const GENRE_INFO: Record<string, { name: string; icon: string }> = {
  funny: { name: '爆笑ネタ', icon: '🤣' },
  ogiri: { name: '大喜利神回答', icon: '🎯' },
  relatable: { name: 'あるある', icon: '👆' },
  genius: { name: '天才ボケ', icon: '💡' },
};

// 明るい男性DJ用のTTSインストラクション
const JAPANESE_INSTRUCTIONS = `あなたは「Xバズネタグランプリ」のDJケンタです。

【キャラクター】
明るくテンション高めの若手DJ。面白い投稿を楽しそうに紹介する。ツッコミも入れつつ、投稿者をリスペクトする姿勢。

【発話スタイル】
明るく軽快なトーンで、笑いを誘うように。ランキング発表は盛り上げて。ツッコミは鋭く、でも愛のある感じで。

【表現のニュアンス】
「これはすごい！」「天才か！」など感嘆を込めて。笑いどころでは少し間を取って期待感を作る。

【ポーズと呼吸】
オチの前に少し間を取る。ランキング発表前はタメを作る。

【読み方】
ネタの部分は少しゆっくり、はっきりと。ツッコミは勢いよく。英語はカタカナで読む。`;

// Grok APIでPost収集（Vercelと同じロジック）
async function collectPosts(genreConfig: { id: string; name: string; query: string }): Promise<any[]> {
  console.log(`[Collect] ${GENRE_INFO[genreConfig.id]?.icon || '📌'} ${genreConfig.name}...`);

  const now = new Date();
  const fromDate = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  const prompt = `
あなたはXのバズ投稿キュレーターです。

【検索条件】
- ジャンル: ${genreConfig.name}
- 条件: ${genreConfig.query}
- 直近48時間以内に投稿された日本語のPost
- 以下の「盛り上がり指標」が高いものを優先:
  1. いいね数が多い（1000以上推奨、万バズ優先）
  2. リツイート/引用が多い
  3. リプライで「草」「www」「天才」などの反応が多い
  4. 短時間で急激に伸びている

【重要】
- 笑える投稿、面白い投稿のみを集めてください
- 政治、炎上、ネガティブな内容は除外
- 純粋に笑えるネタ、秀逸なボケを優先

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
      "buzz_reason": "なぜ面白いか、笑いのポイント"
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
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[japanTime.getDay()];

  // 全投稿をいいね数でソートしてTOP10を選出
  const allPostsList = Object.values(allPosts).flat();
  const sortedPosts = allPostsList.sort((a, b) => (b.metrics?.likes || 0) - (a.metrics?.likes || 0));
  const top10 = sortedPosts.slice(0, 10);

  let postsText = top10.map((p, i) => {
    const metrics = [];
    if (p.metrics?.likes > 0) metrics.push(`いいね${p.metrics.likes.toLocaleString()}`);
    if (p.metrics?.retweets > 0) metrics.push(`RT${p.metrics.retweets.toLocaleString()}`);
    const metricsStr = metrics.length > 0 ? `（${metrics.join('/')}）` : '';
    const buzzReason = p.buzzReason ? ` [笑いポイント: ${p.buzzReason}]` : '';
    const genreInfo = GENRE_INFO[p.genre] || { name: '不明', icon: '📌' };
    return `${i + 1}. ${genreInfo.icon} @${p.author?.username}さん${metricsStr}${buzzReason}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 200)}」`;
  }).join('\n\n');

  const prompt = `あなたは「Xバズネタグランプリ」の台本作家です。

【番組コンセプト】
Xで万バズした爆笑ネタ、大喜利の神回答をランキング形式で紹介する番組。
明るく楽しい雰囲気で、リスナーを笑わせる。

【DJキャラクター】
- 名前: ケンタ
- 明るくテンション高めの若手DJ
- ツッコミを入れながら楽しく紹介
- 投稿者へのリスペクトを忘れない

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
- ❌ 「（ジングル）」「（SE）」「（笑）」などの演出指示
- ❌ カッコ書きの補足説明
- ✅ 自然な話し言葉のみ

【重要：TTSが誤読しやすい漢字のひらがな化】
訓読みで複数の読み方がある漢字はひらがなにしてください。

【重要：英語のカタカナ化】
英語表記はカタカナで書いてください。「w」や「草」はそのまま読まず、「めちゃくちゃ笑える」などに言い換え。

【重要：ユーザー名の読み方】
@マークは読まない。ユーザー名はカタカナで読みやすく変換。

【番組概要】
- 番組名: Xバズネタグランプリ
- 今日の日付: ${month}月${day}日（${weekday}）

【今回のTOP10投稿】
${postsText}

【番組構成】
1. **オープニング**（20-30秒）
   - 「Xバズネタグランプリ、${month}月${day}日${weekday}曜日！」
   - 今日も爆笑ネタを紹介する予告
   - テンション高めに

2. **第10位〜第6位**（各投稿15-20秒）
   - サクサクとテンポよく紹介
   - 軽いツッコミを入れる
   - 「続いて第9位！」と繋ぐ

3. **第5位〜第2位**（各投稿25-30秒）
   - じっくり紹介
   - なぜ面白いかを解説
   - ツッコミも丁寧に

4. **第1位発表**（40-50秒）
   - タメを作って盛り上げる
   - じっくり紹介
   - 今日一番の爆笑ネタを称える

5. **エンディング**（15-20秒）
   - 今日のまとめ
   - 「また来週もバズネタをお届け！」

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
      "id": "rank-10-6",
      "type": "ranking",
      "title": "第10位〜第6位",
      "script": "読み上げテキスト"
    },
    {
      "id": "rank-5-2",
      "type": "ranking",
      "title": "第5位〜第2位",
      "script": "読み上げテキスト"
    },
    {
      "id": "rank-1",
      "type": "ranking",
      "title": "第1位",
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
          temperature: 0.9,
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

// TTS生成（明るめ男性voice: echo）
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
      voice: 'echo',  // 明るめ男性
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
        voice: 'echo',
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
  console.log('🏆 Xバズネタグランプリ - 試作版');
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
    console.log(`\nBGM追加（Xylophones Adventure -12dB）:`);
    console.log(`ffmpeg -i full_show.mp3 -stream_loop -1 -i ../../../public/bgm/Xylophones_Adventure_2026-01-04T073920.mp3 -filter_complex "[1:a]volume=-12dB[bgm];[0:a][bgm]amix=inputs=2:duration=first[out]" -map "[out]" -y full_show_with_bgm.mp3`);
  } else {
    console.log('\n⚠️ OPENAI_API_KEY未設定、台本のみ生成');
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 完了！');
  console.log('='.repeat(60));
}

main().catch(console.error);
