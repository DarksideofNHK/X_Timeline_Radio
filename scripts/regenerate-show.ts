/**
 * 台本とTTSを再生成するスクリプト（posts.jsonを再利用）
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const GENRES = ['trending', 'politics', 'economy', 'lifestyle', 'entertainment', 'science', 'international'];
const GENRE_INFO: Record<string, { name: string; icon: string }> = {
  trending: { name: '今バズってる話題', icon: '🔥' },
  politics: { name: '政治ニュース', icon: '🏛️' },
  economy: { name: '経済・マネー', icon: '💹' },
  lifestyle: { name: '暮らし・生活', icon: '🏠' },
  entertainment: { name: 'エンタメ', icon: '🎬' },
  science: { name: '科学・テクノロジー', icon: '🔬' },
  international: { name: '国際ニュース', icon: '🌍' },
};

const JAPANESE_INSTRUCTIONS = `日本のラジオ情報番組のDJとして、リスナーに語りかけるように話してください。

【発話スタイル】
明るく親しみやすいトーンで、適度な抑揚をつけて単調にならないように。句読点では自然なポーズを取り、聞きやすいテンポを保つ。重要な情報や数字は少し強調する。

【表現のニュアンス】
「！」の文は少し元気よく。「？」の文は語尾を軽く上げる。「…」や「、、」は少し長めの間を取る。新しいトピックに移る際はわずかにトーンを変えて場面転換を表現する。

【ポーズと呼吸】
文の区切りでは自然な息継ぎを入れる。長い文は意味のまとまりで区切って読む。全角スペース「　」がある箇所では、話題の転換として少し長めの間を取る。

【読み方】
英語・アルファベットはカタカナ読み。人名・固有名詞は丁寧に、はっきりと発音。

ロボット的な単調読み上げは避け、実際のラジオ番組のような生き生きとした発話を心がけてください。`;

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
  for (const genre of GENRES) {
    const posts = allPosts[genre] || [];
    if (posts.length > 0) {
      const info = GENRE_INFO[genre];
      allPostsText += `\n\n### ${info.icon} ${info.name}（${posts.length}件）\n`;
      allPostsText += posts.map((p, i) => {
        const metrics = [];
        if (p.metrics?.likes > 0) metrics.push(`いいね${p.metrics.likes.toLocaleString()}`);
        if (p.metrics?.retweets > 0) metrics.push(`RT${p.metrics.retweets.toLocaleString()}`);
        const metricsStr = metrics.length > 0 ? `（${metrics.join('/')}）` : '';
        const buzzReason = p.buzzReason ? ` [バズ理由: ${p.buzzReason}]` : '';
        return `${i + 1}. @${p.author?.username}${p.author?.name !== p.author?.username ? `（${p.author?.name}）` : ''}さん${metricsStr}${buzzReason}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 200)}」`;
      }).join('\n\n');
    }
  }

  const prompt = `あなたはラジオ番組のパーソナリティです。Xで話題の投稿を紹介する番組の台本を作成してください。

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
以下のような表現は絶対に含めないでください：
- ❌ 「（ジングル）」「（軽快な音楽）」「（SE）」などの演出指示
- ❌ 「♪」「🎵」などの音楽記号
- ❌ カッコ書きの補足説明
- ❌ 「BGM：〇〇」などのト書き

【重要：TTSが誤読しやすい漢字のひらがな化】
**内容は大人向けのまま維持しつつ、TTSが誤読しやすい漢字だけをひらがなにしてください。**
内容を平易にする必要はありません。あくまで「読み」の問題を解決するためのルールです。

**必ずひらがなで書く漢字（TTSが誤読するもの）：**
- ✅「かきおろし」 ←「描き下ろし」（×えがきおろし と誤読される）
- ✅「こうごうしい」 ←「神々しい」
- ✅「おごそかな」 ←「厳かな」
- ✅「あでやか」 ←「艶やか」
- ✅「はなばなしい」 ←「華々しい」
- ✅「まばゆい」 ←「眩い」
- ✅「けなげ」 ←「健気」
- ✅「いにしえ」 ←「古」
- ✅「おぼろげ」 ←「朧げ」
- ✅「うるわしい」 ←「麗しい」
- ✅「いとおしい」 ←「愛おしい」
- ✅「ひっさげる」 ←「引っ提げる」
- ✅「つのる」 ←「募る」
- ✅「かかげる」 ←「掲げる」
- ✅「こころざし」 ←「志」（単体で使う場合）

**そのまま漢字でOK（TTSが正しく読めるもの）：**
- ✅「話題」「投稿」「紹介」「特典」「限定」「抱負」「挑戦」「応援」「発表」など一般的な熟語はそのまま

**判断基準：** 訓読みで複数の読み方がある漢字（描く→かく/えがく）は誤読されやすいのでひらがなに。
音読みの熟語（特典、限定など）はTTSが正しく読むのでそのまま漢字でOK。

【重要：英語・アルファベットのカタカナ化】
英語やアルファベット表記は、TTSが正しく発音できるようカタカナで書いてください。

**カタカナで書く例：**
- ✅「エックスタイムラインラジオ」 ←「X Timeline Radio」
- ✅「エックス」 ←「X」（SNSの名前）
- ✅「ブイチューバー」 ←「VTuber」
- ✅「エーアイ」 ←「AI」
- ✅「エスエヌエス」 ←「SNS」

【重要：ユーザー名の読み方】
**@マークは絶対に読まない！「アット」「アットマーク」は禁止！**

**努力目標：ユーザー名はできるだけカタカナで読みやすく変換してください。**
- 例：「DEATHDOL_NOTE」→「デスドルノートさん」
- 例：「narumi」→「ナルミさん」
- 例：「usadapekora」→「ウサダペコラさん」

【重要：固有名詞の読み方】
音声合成（TTS）で正しく読み上げられるよう、すべての固有名詞をひらがなまたはカタカナで出力してください。

**基本ルール：**
- 人名（芸能人、政治家、VTuber、YouTuber等）→ ひらがなで出力
- 外国人名・企業名・英語表記 → カタカナで出力
- 漢字表記とふりがなの重複は絶対禁止（どちらか一方のみ）

**重要：日本人名は姓と名の間にスペースを入れる！**
TTSが正しく区切って読めるよう、姓と名の間に半角スペースを入れてください。

- ✅「かのう えいこう」 ←「狩野英孝」（正しい区切り）
- ❌「かのうえいこう」 ← スペースなしだと「かのうえ いこう」と誤読される
- ✅「まつもと ひとし」 ←「松本人志」
- ✅「ひろゆき」 ← 名前だけで知られる人はスペース不要
- ✅「はまだ まさとし」 ←「浜田雅功」
- ✅「あべ しんぞう」 ←「安倍晋三」
- ✅「きしだ ふみお」 ←「岸田文雄」

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
      - 堅苦しくなく、ちょっとした雑学として軽く紹介
      - 2-3文程度で簡潔に

   C. **リスナーへの一言**（元気づけるコメント）
      - 例：「今日も一日、良い情報との出会いがありますように。それでは始めていきましょう。」
      - ※「まずは〇〇コーナーから」とは言わない（次のセクションと重複するため）

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
      - 例：「エンタメコーナーです。今日は新年ということもあり、VTuberや声優さんの新年挨拶が多く見られますね。」

   B. **投稿の紹介**（ストーリー性を意識）
      - 関連する投稿はまとめて紹介（例：新年挨拶系、キャンペーン系など）
      - 投稿間のつながりを意識した繋ぎ言葉を使う
      - 例：「新年挨拶が続きますが、次は...」「同じくVTuberから...」「話題を変えて...」

   C. **各投稿の紹介フォーマット**
      - 「続いてはナルミさんの投稿です」（@なし、アットなし、スペースなし）
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
- ❌ 「続いてナルミさんの投稿です。　」（同じ話題の続きには不要）

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
      "script": "エンタメコーナーです。今日は新年ということもあり、VTuberや声優さんからの新年挨拶や、プレゼントキャンペーンの投稿が目立ちますね。では早速見ていきましょう。まずはプレゼントキャンペーンから。ニタミューズメントさんの投稿です。「新年プレゼントキャンペーン第三弾...」実機プレゼントは夢がありますね。以上、エンタメコーナーでした。",
      "estimatedDuration": 180
    }
  ],
  "totalDuration": 20
}
\`\`\`

scriptには演出指示やカッコ書きを含めず、純粋な読み上げテキストのみを出力してください。@マークは絶対に含めないこと。`;

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`, {
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
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/) || responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr.trim());
    console.log(`[Script] ${parsed.sections?.length || 0}セクション生成完了`);
    return parsed;
  }

  throw new Error('Failed to parse script JSON');
}

async function generateAudio(text: string, outputPath: string, voice: string = 'nova'): Promise<void> {
  console.log(`[TTS] 生成中: ${text.substring(0, 30)}...`);

  let response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      input: text,
      voice: voice,
      response_format: 'mp3',
      instructions: JAPANESE_INSTRUCTIONS,
    }),
  });

  if (!response.ok && response.status === 400) {
    console.log(`[TTS] Falling back to tts-1`);
    response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: voice,
        response_format: 'mp3',
      }),
    });
  }

  if (!response.ok) {
    throw new Error(`OpenAI TTS error: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(arrayBuffer));
  console.log(`[TTS] 保存: ${outputPath}`);
}

async function main() {
  const dateStr = process.argv[2] || new Date().toISOString().split('T')[0];
  const showDir = path.join(__dirname, '../public/shows', dateStr);
  const postsPath = path.join(showDir, 'posts.json');

  console.log(`📁 ディレクトリ: ${showDir}`);

  if (!fs.existsSync(postsPath)) {
    console.error('❌ posts.json が見つかりません');
    process.exit(1);
  }

  const allPosts = JSON.parse(fs.readFileSync(postsPath, 'utf-8'));
  console.log('📡 posts.json 読み込み完了');

  // 台本生成
  const script = await generateScript(allPosts);
  fs.writeFileSync(path.join(showDir, 'script.json'), JSON.stringify(script, null, 2));

  // TTS生成
  const sections = script.sections || [];
  console.log('\n🎙️ 音声生成中...');

  for (const section of sections) {
    const audioPath = path.join(showDir, `${section.id}.mp3`);
    await generateAudio(section.script, audioPath);
    await new Promise(r => setTimeout(r, 500));
  }

  // マニフェスト生成
  const manifest = {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    totalDuration: script.totalDuration,
    sections: sections.map((s: any) => ({
      id: s.id,
      type: s.type,
      genre: s.genre,
      title: s.title,
      audioFile: `${s.id}.mp3`,
      estimatedDuration: s.estimatedDuration,
    })),
  };
  fs.writeFileSync(path.join(showDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log('\n✅ 再生成完了！');
}

main().catch(console.error);
