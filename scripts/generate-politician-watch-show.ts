#!/usr/bin/env npx tsx
/**
 * X政治家ウオッチ - 試作版
 * 国政政党の政治家アカウントを網羅的にチェックし、
 * 対立構造を再構成しながらニューストピックへのスタンスを炙り出す
 * プロレス実況風モデレーターで討論番組の雰囲気を演出
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
const OUTPUT_DIR = path.join(__dirname, '../public/shows/politician-watch-test');

// 政党・陣営別の収集定義
const GENRES = [
  {
    id: 'ruling-ldp',
    name: '自民党',
    camp: '与党',
  },
  {
    id: 'ruling-komeito',
    name: '公明党',
    camp: '与党',
  },
  {
    id: 'opposition-cdp',
    name: '立憲民主党',
    camp: '野党',
  },
  {
    id: 'opposition-ishin',
    name: '日本維新の会',
    camp: '野党',
  },
  {
    id: 'opposition-dpfp',
    name: '国民民主党',
    camp: '野党',
  },
  {
    id: 'opposition-others',
    name: 'その他野党（共産党・れいわ新選組・社民党・参政党）',
    camp: '野党',
  },
  {
    id: 'public-reaction',
    name: '国民の声',
    camp: '一般',
  },
];

// 政治家アカウント情報を格納
let POLITICIAN_ACCOUNTS: Record<string, { name: string; username: string; role: string }[]> = {};

// Step 1: Grokで各政党の政治家Xアカウントリストを取得
async function fetchPoliticianAccounts(): Promise<void> {
  console.log('\n📋 政治家Xアカウントリスト取得中...\n');

  const prompt = `あなたは日本の政治に詳しい専門家です。

【タスク】
日本の主要政党の国会議員・幹部のXアカウント（旧Twitter）を調べてください。
特に、以下の政党の幹部・有力議員のアカウントをリストアップしてください。

【対象政党】
1. 自民党（与党）- 総裁、幹事長、政調会長、大臣、有力議員など
2. 公明党（与党）- 代表、幹事長、有力議員など
3. 立憲民主党（野党）- 代表、幹事長、有力議員など
4. 日本維新の会（野党）- 代表、共同代表、有力議員など
5. 国民民主党（野党）- 代表、有力議員など
6. その他野党 - 共産党、れいわ新選組、社民党、参政党の代表・有力議員

【出力形式】
以下のJSON形式で出力してください。各政党最低5名、できれば10名程度。
Xで実際に活発に発信している政治家を優先してください。

\`\`\`json
{
  "ruling-ldp": [
    { "name": "政治家名", "username": "Xのユーザー名（@なし）", "role": "役職" }
  ],
  "ruling-komeito": [...],
  "opposition-cdp": [...],
  "opposition-ishin": [...],
  "opposition-dpfp": [...],
  "opposition-others": [...]
}
\`\`\`

【重要】
- 実在するXアカウントのみを記載
- usernameは@マークなしで記載
- アクティブに発信している政治家を優先
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
        tools: [{ type: 'x_search' }],
        input: prompt,
      }),
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();

    // レスポンスからテキストを抽出
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

    // JSONを抽出（コードブロックありなし両対応）
    let jsonText = '';

    // 1. まずコードブロック内を試す
    const jsonBlockMatch = fullText.match(/```json\s*([\s\S]*?)```/);
    if (jsonBlockMatch) {
      jsonText = jsonBlockMatch[1].trim();
    }

    // 2. コードブロックなしの場合、直接JSONオブジェクトを探す
    if (!jsonText) {
      const jsonObjectMatch = fullText.match(/\{\s*"ruling-ldp"\s*:\s*\[[\s\S]*?\]\s*(?:,\s*"[^"]+"\s*:\s*\[[\s\S]*?\]\s*)*\}/);
      if (jsonObjectMatch) {
        jsonText = jsonObjectMatch[0];
      }
    }

    // 3. それでも見つからない場合、最初の { から最後の } までを取得
    if (!jsonText && fullText.includes('"ruling-ldp"')) {
      const startIdx = fullText.indexOf('{');
      const endIdx = fullText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        jsonText = fullText.slice(startIdx, endIdx + 1);
      }
    }

    if (jsonText) {
      try {
        POLITICIAN_ACCOUNTS = JSON.parse(jsonText);

        // 結果を表示
        for (const [partyId, accounts] of Object.entries(POLITICIAN_ACCOUNTS)) {
          const genre = GENRES.find(g => g.id === partyId);
          if (genre) {
            console.log(`  ${GENRE_INFO[partyId]?.icon || '📌'} ${genre.name}: ${(accounts as any[]).length}名`);
          }
        }
      } catch (parseError) {
        console.error('[Accounts] JSONパースエラー:', parseError);
        console.log('[Accounts] 抽出したJSON:', jsonText.slice(0, 300));
      }
    } else {
      console.error('[Accounts] JSON抽出失敗');
      console.log('[Accounts] Raw response:', fullText.slice(0, 500));
    }
  } catch (error) {
    console.error('[Accounts] Error:', error);
  }
}

const GENRE_INFO: Record<string, { name: string; icon: string; camp: string }> = {
  'ruling-ldp': { name: '自民党', icon: '🔴', camp: '与党' },
  'ruling-komeito': { name: '公明党', icon: '🟡', camp: '与党' },
  'opposition-cdp': { name: '立憲民主党', icon: '🔵', camp: '野党' },
  'opposition-ishin': { name: '日本維新の会', icon: '🟢', camp: '野党' },
  'opposition-dpfp': { name: '国民民主党', icon: '🟠', camp: '野党' },
  'opposition-others': { name: 'その他野党', icon: '🟣', camp: '野党' },
  'public-reaction': { name: '国民の声', icon: '👥', camp: '一般' },
};

// プロレス実況風モデレーターのTTSインストラクション
const JAPANESE_INSTRUCTIONS = `あなたはスポーツ実況のような熱いラジオパーソナリティです。

話し方のポイント：
- エネルギッシュでテンション高め、でもうるさくならない
- 「おおっと！」「さあ！」「ここで！」など感嘆詞を自然に
- 政治家の名前ははっきり発音
- 重要なポイントで少し間を取る
- 盛り上がる場面で声に力を込める
- 全体的にスポーツニュースのキャスターのような明るさ

発音注意：
- 漢字の人名は正確に
- 英語はカタカナ読み
- 句読点で適切に区切る`;

// Grok APIでPost収集（Step 2: アカウントリストを使って収集）
async function collectPosts(genreConfig: typeof GENRES[0]): Promise<any[]> {
  const info = GENRE_INFO[genreConfig.id];
  console.log(`[Collect] ${info.icon} ${genreConfig.name}（${info.camp}）...`);

  const now = new Date();
  const fromDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const toDate = now.toISOString().split('T')[0];

  // 国民の声は別処理
  if (genreConfig.id === 'public-reaction') {
    return collectPublicReaction(fromDate, toDate);
  }

  // 取得した政治家アカウントリストを使用
  const accounts = POLITICIAN_ACCOUNTS[genreConfig.id] || [];
  if (accounts.length === 0) {
    console.log(`  ⚠️ アカウントリストなし`);
    return [];
  }

  // アカウントリストを文字列化
  const accountList = accounts.map(a => `@${a.username}（${a.name}/${a.role}）`).join('\n');
  const usernameQuery = accounts.map(a => `from:${a.username}`).join(' OR ');

  const prompt = `
あなたは日本の政治家のX投稿を分析する専門家です。

【検索対象アカウント】
${accountList}

【検索クエリ】
${usernameQuery}

【検索条件】
- 政党: ${genreConfig.name}（${genreConfig.camp}）
- 直近24時間以内の日本語Post
- 上記アカウントからの投稿を検索

【収集の優先順位】
1. 政策に対する明確なスタンス表明
2. 他党・他議員への批判や反論
3. 重要法案・政策への賛否
4. 話題のニュースへのコメント
5. 注目を集めている発言（いいね・RT多数）

【重要】
- 上記リストの政治家本人のアカウントからの投稿のみ収集
- 政策スタンスが分かる投稿を重視
- 対立構造が見える投稿を優先

【出力形式】
以下のJSON形式で10件出力してください:

\`\`\`json
{
  "posts": [
    {
      "author_username": "ユーザー名",
      "author_name": "政治家名（役職）",
      "party": "${genreConfig.name}",
      "text": "投稿内容",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "retweets": 数値,
      "stance": "この投稿のスタンス（主張/批判/反論/提案/賛成/反対など）",
      "topic": "言及しているトピック",
      "target": "批判・言及対象（あれば）"
    }
  ]
}
\`\`\`

【重要】
- 必ず実在するPostのURLを含めてください
- 架空の投稿を作成しないでください
- 上記リストの政治家からの投稿のみを収集
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
    console.log(`[Collect] ${info.icon} ${posts.length}件取得`);
    return posts;
  } catch (error) {
    console.error(`[Collect] Error:`, error);
    return [];
  }
}

// 国民の声を収集（政治家以外の一般ユーザー）
async function collectPublicReaction(fromDate: string, toDate: string): Promise<any[]> {
  const prompt = `
あなたは日本の政治に関する一般市民の声を収集する専門家です。

【検索条件】
- 直近24時間以内の日本語Post
- 一般ユーザー（政治家・メディア以外）の投稿
- 政治家や政策に対する意見・反応

【収集の優先順位】
1. 政治家の発言への賛否コメント
2. 政策・法案への一般市民の意見
3. 与党・野党への支持/不支持の声
4. 話題になっている政治ニュースへの反応
5. バズっている政治コメント

【バランス】
- 賛成意見と反対意見を半々程度でバランスよく
- 与党支持・野党支持を偏りなく

【出力形式】
\`\`\`json
{
  "posts": [
    {
      "author_username": "ユーザー名",
      "author_name": "表示名",
      "party": "一般市民",
      "text": "投稿内容",
      "url": "https://x.com/username/status/投稿ID",
      "likes": 数値,
      "retweets": 数値,
      "stance": "賛成/反対/疑問/批判など",
      "topic": "言及しているトピック",
      "target": "言及対象（政治家名や政党名）"
    }
  ]
}
\`\`\`

10件出力してください。
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
      throw new Error(`Grok API error: ${response.status}`);
    }

    const data = await response.json();
    return extractPostsFromResponse(data, 'public-reaction');
  } catch (error) {
    console.error('[PublicReaction] Error:', error);
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
            name: p.author_name || p.name || 'ユーザー',
            username: p.author_username || p.username || 'unknown',
          },
          party: p.party || '',
          text: p.text || p.content || '',
          url: p.url || `https://x.com/i/status/${postId}`,
          metrics: {
            likes: p.likes || 0,
            retweets: p.retweets || 0,
          },
          stance: p.stance || '',
          topic: p.topic || '',
          target: p.target || '',
          genre: genre,
        });
      }
    } catch (e) {
      console.error('[Extract] Failed to parse JSON:', e);
    }
  }

  return posts.slice(0, 10);
}

// 台本生成（討論番組風・プロレス実況スタイル）
async function generateScript(allPosts: Record<string, any[]>): Promise<any> {
  console.log('[Script] 台本生成中...');

  const now = new Date();
  const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const month = japanTime.getMonth() + 1;
  const day = japanTime.getDate();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const weekday = weekdays[japanTime.getDay()];

  // 与党・野党・一般でグループ化
  let rulingPartyPosts = '';
  let oppositionPosts = '';
  let publicPosts = '';

  for (const [genreId, posts] of Object.entries(allPosts)) {
    if (posts.length === 0) continue;
    const info = GENRE_INFO[genreId];
    const postsText = posts.map((p, i) => {
      const stance = p.stance ? ` [${p.stance}]` : '';
      const topic = p.topic ? ` 【${p.topic}】` : '';
      const target = p.target ? ` →対象:${p.target}` : '';
      return `${i + 1}. ${p.author?.name}${stance}${topic}${target}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 200)}」`;
    }).join('\n\n');

    if (info.camp === '与党') {
      rulingPartyPosts += `\n### ${info.icon} ${info.name}\n${postsText}\n`;
    } else if (info.camp === '野党') {
      oppositionPosts += `\n### ${info.icon} ${info.name}\n${postsText}\n`;
    } else {
      publicPosts += `\n### ${info.icon} ${info.name}\n${postsText}\n`;
    }
  }

  const prompt = `あなたは「X政治家ウオッチ」の台本作家です。プロレス実況風の熱い政治討論番組を作ります。

【番組コンセプト】
日本の国政政党の政治家のX投稿を分析し、与党vs野党の対立構造を「政治バトル」として熱く実況する番組。
モデレーターはプロレスのリングアナウンサーのように、政治家同士の論戦を盛り上げる。

【モデレーターキャラクター】
- プロレス実況アナウンサー風
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
- 「!」は力強く、「?」は疑問を込めて
- 難読漢字・熟語はひらがなで書く：
  - 舌戦→ぜっせん、論戦→ろんせん、激戦→げきせん
  - 反駁→はんばく、糾弾→きゅうだん、弾劾→だんがい
  - 与党→よとう、野党→やとう
  - 閣僚→かくりょう、大臣→だいじん
  - 法案→ほうあん、政策→せいさく
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
   - 「与党vs野党、今日はどんな攻防が繰り広げられるのか！」

2. **与党陣営の動き**（3-4分）
   - 「まずは与党コーナーから！」
   - 自民党・公明党の主要な発言を紹介
   - 「〇〇大臣が強気の発言！」「これは挑発か!?」
   - 政策スタンスを解説

3. **野党陣営の反撃**（3-4分）
   - 「続いて野党陣営！黙っていません！」
   - 立憲・維新・国民・その他野党の発言
   - 「〇〇議員が痛烈な一撃！」「これは効いたか!?」
   - 与党への批判・反論を紹介

4. **激突！対立ポイント分析**（2-3分）
   - 「さあ、ここからが本日のメインイベント！」
   - 与党と野党の主張を対比
   - 「与党は〇〇と主張！しかし野党は△△と真っ向対立！」
   - 「この問題、決着はつくのか!?」

5. **国民の声・レフェリー判定**（2分）
   - 「ここで国民の声を聞いてみましょう！」
   - 一般の反応（賛成派・反対派）を紹介
   - 「国民はこの戦いをどう見ているのか！」

6. **エンディング**（60秒）
   - 今日の政治バトルまとめ
   - 「今日の勝者は...まだ決まっていない！」
   - 「明日も政界のリングから目が離せません！」
   - 「X政治家ウオッチ、また来週！」

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
      "id": "ruling-party",
      "type": "segment",
      "title": "与党陣営",
      "script": "読み上げテキスト"
    },
    {
      "id": "opposition",
      "type": "segment",
      "title": "野党陣営",
      "script": "読み上げテキスト"
    },
    {
      "id": "clash",
      "type": "segment",
      "title": "対立ポイント",
      "script": "読み上げテキスト"
    },
    {
      "id": "public-voice",
      "type": "segment",
      "title": "国民の声",
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
          maxOutputTokens: 16384,
        }
      })
    }
  );

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) {
    console.error('[Script] Raw response:', text.slice(0, 1000));
    throw new Error('Failed to parse script JSON');
  }

  const script = JSON.parse(jsonMatch[1].trim());
  console.log(`[Script] ${script.sections.length}セクション生成完了`);

  return script;
}

// TTS生成（プロレス実況風voice: echo - テンション高め）
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
      voice: 'echo',  // テンション高めの男性
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
  console.log('🥊 X政治家ウオッチ - 試作版');
  console.log('   〜政界バトルロイヤル実況〜');
  console.log('='.repeat(60));

  // 出力ディレクトリ作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Step 1: 政治家Xアカウントリストを取得
  await fetchPoliticianAccounts();

  // アカウントリストを保存
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'politician_accounts.json'),
    JSON.stringify(POLITICIAN_ACCOUNTS, null, 2)
  );

  const totalAccounts = Object.values(POLITICIAN_ACCOUNTS).reduce(
    (sum, accounts) => sum + (accounts as any[]).length, 0
  );
  console.log(`\n✅ 合計 ${totalAccounts}名の政治家アカウントを取得\n`);

  // Step 2: Post収集
  console.log('📡 政治家Post収集開始...\n');
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
