import type { VercelRequest, VercelResponse } from '@vercel/node';

// Gemini APIモデル一覧（2025年最新）
// https://ai.google.dev/gemini-api/docs/models
const GEMINI_MODELS = {
  'gemini-2.0-flash': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',  // 高速・安定
  'gemini-2.5-flash-lite': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent',  // 最速・低コスト
  'gemini-2.5-flash': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',  // バランス型（推奨）
  'gemini-2.5-pro': 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent',  // 最高品質
} as const;

type GeminiModel = keyof typeof GEMINI_MODELS;

// 番組タイプ設定（インライン定義）
interface ShowConfig {
  name: string;
  voice: string;
  bgm: string;
  allowDownload: boolean;
  geminiModel: GeminiModel;  // 使用するGeminiモデル
}

const INLINE_SHOW_CONFIGS: Record<string, ShowConfig> = {
  'politician-watch': {
    name: 'X政治家ウオッチ',
    voice: 'echo',
    bgm: 'Cybernetic_Dominion',
    allowDownload: true,
    geminiModel: 'gemini-2.5-flash',  // バランス型（政治分析向け）
  },
  'old-media-buster': {
    name: 'オールドメディアをぶっ壊せラジオ',
    voice: 'onyx',
    bgm: 'Victory_Lap',
    allowDownload: false,
    geminiModel: 'gemini-2.5-flash',  // バランス型（皮肉の表現力）
  },
  'x-timeline-radio': {
    name: 'X Timeline Radio',
    voice: 'nova',
    bgm: 'Digital_Newsfeed_Groove',
    allowDownload: false,
    geminiModel: 'gemini-2.0-flash',  // 高速モデル（7コーナー大量生成向け）
  },
  'disaster-news': {
    name: 'X災害ニュース',
    voice: 'shimmer',
    bgm: 'Digital_Newsfeed_Groove_2026-01-03T112506',
    allowDownload: true,
    geminiModel: 'gemini-2.0-flash',  // 高速モデル（速報性重視）
  },
};

// X Timeline Radio用ジャンル情報
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
    const { allPosts, apiKey: requestApiKey, showType } = req.body;

    // APIキーがリクエストにない場合は環境変数から取得（ゲストモード対応）
    const apiKey = requestApiKey || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'Gemini API key required' });
    }

    // 日付情報を生成
    const now = new Date();
    const japanTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const year = japanTime.getFullYear();
    const month = japanTime.getMonth() + 1;
    const day = japanTime.getDate();
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const weekday = weekdays[japanTime.getDay()];
    const todayString = `${year}年${month}月${day}日（${weekday}）`;

    let prompt: string;
    const showConfig = INLINE_SHOW_CONFIGS[showType] || INLINE_SHOW_CONFIGS['x-timeline-radio'];

    // 番組タイプに応じたプロンプト生成
    if (showType === 'politician-watch') {
      prompt = generatePoliticianWatchPrompt(allPosts, month, day, weekday, todayString);
    } else if (showType === 'old-media-buster') {
      prompt = generateOldMediaBusterPrompt(allPosts, month, day, weekday, todayString);
    } else if (showType === 'disaster-news') {
      prompt = generateDisasterNewsPrompt(allPosts, month, day, weekday, todayString);
    } else {
      // X Timeline Radio
      prompt = generateXTimelineRadioPrompt(allPosts, month, day, weekday, todayString);
    }

    // 番組タイプに応じたGeminiモデルURLを取得
    const geminiModel = showConfig.geminiModel;
    const geminiApiUrl = GEMINI_MODELS[geminiModel];
    console.log(`[FullScript] Generating script for showType: ${showType || 'x-timeline-radio'} using model: ${geminiModel}`);

    // リクエストボディを構築
    const requestBody: any = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 50000,  // タイムアウト対策で削減（65536→50000）
        responseMimeType: 'application/json',
      },
    };

    const response = await fetch(`${geminiApiUrl}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
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

    // オープニングと最初のコーナーを結合（オープニングが短いため一括生成）
    let processedSections = parsed.sections;
    if (processedSections.length >= 2 && processedSections[0].type === 'opening') {
      const opening = processedSections[0];
      const firstCorner = processedSections[1];

      // オープニングのスクリプトを最初のコーナーの先頭に結合
      const mergedScript = `${opening.script || ''}\n\n${firstCorner.script || ''}`;
      const mergedDuration = (opening.estimatedDuration || 60) + (firstCorner.estimatedDuration || 180);

      // 結合したセクションを作成（オープニングは削除）
      processedSections = [
        {
          ...firstCorner,
          script: mergedScript,
          estimatedDuration: mergedDuration,
          title: `${opening.title || 'オープニング'} → ${firstCorner.title || ''}`,
        },
        ...processedSections.slice(2),
      ];

      console.log('[FullScript] Merged opening with first corner for seamless audio');
    }

    // セクションをチャンク分割
    const sections = processedSections.map((section: any, index: number) => {
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

    console.log(`[FullScript] Total duration: ${totalSeconds}s = ${totalDuration}min`);

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
      } : null,
    });
  } catch (error: any) {
    console.error('[API] Error generating full script:', error);
    return res.status(500).json({ error: error.message });
  }
}

// ========================================
// X Timeline Radio用プロンプト（オリジナルの詳細版）
// ========================================
function generateXTimelineRadioPrompt(allPosts: any, month: number, day: number, weekday: string, todayString: string): string {
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

  return `あなたはラジオ番組のパーソナリティです。Xで話題の投稿を紹介する番組の台本を作成してください。

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

【超重要：@マークは絶対に読まない】
**「@」「アット」「アットマーク」は台本に含めない！削除すること！**

正しい例：
- ❌「@tanaka さんの投稿です」→ ✅「タナカさんの投稿です」
- ❌「アットマーク tanaka さん」→ ✅「タナカさん」
- ❌「アット tanaka」→ ✅「タナカさん」

**ユーザー名はカタカナまたはひらがなで読みやすく変換：**
- 例：「DEATHDOL_NOTE」→「デスドルノートさん」
- 例：「narumi」→「ナルミさん」
- 例：「usadapekora」→「ウサダペコラさん」
- 例：「tanaka_taro123」→「タナカタロウさん」

※完璧な変換が難しい場合は、読みやすさを優先して適宜判断してください。

【重要：固有名詞の読み方】
音声合成（TTS）で正しく読み上げられるよう、すべての固有名詞をひらがなまたはカタカナで出力してください。

**基本ルール：**
- 人名（芸能人、政治家、VTuber、YouTuber等）→ ひらがなで出力
- 外国人名・企業名・英語表記 → カタカナで出力
- 漢字表記とふりがなの重複は絶対禁止（どちらか一方のみ）

**数字・日付：**
- 年月日は「2026年1月3日」のようにアラビア数字で書く（TTSが正しく読む）

**暦・季節の用語：**
- 「二十四節気」→「にじゅうしせっき」
- 「七十二候」→「しちじゅうにこう」
- 「雑節」→「ざっせつ」
- 「立春」→「りっしゅん」
- 「雨水」→「うすい」
- 「啓蟄」→「けいちつ」
- 「春分」→「しゅんぶん」
- 「清明」→「せいめい」
- 「穀雨」→「こくう」
- 「立夏」→「りっか」
- 「小満」→「しょうまん」
- 「芒種」→「ぼうしゅ」
- 「夏至」→「げし」
- 「小暑」→「しょうしょ」
- 「大暑」→「たいしょ」
- 「立秋」→「りっしゅう」
- 「処暑」→「しょしょ」
- 「白露」→「はくろ」
- 「秋分」→「しゅうぶん」
- 「寒露」→「かんろ」
- 「霜降」→「そうこう」
- 「立冬」→「りっとう」
- 「小雪」→「しょうせつ」
- 「大雪」→「たいせつ」
- 「冬至」→「とうじ」
- 「小寒」→「しょうかん」
- 「大寒」→「だいかん」
- 「節分」→「せつぶん」
- 「彼岸」→「ひがん」
- 「土用」→「どよう」
- 「八十八夜」→「はちじゅうはちや」
- 「入梅」→「にゅうばい」
- 「半夏生」→「はんげしょう」
- 「二百十日」→「にひゃくとおか」

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
      - 「エックスタイムラインラジオ、${month}月${day}日${weekday}曜日です。」

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

2. **7つのコーナー**（各コーナー最大8件を厳選して紹介）
   - 🔥 今バズってる話題
   - 🏛️ 政治ニュース
   - 💹 経済・マネー
   - 🏠 暮らし・生活
   - 🎬 エンタメ
   - 🔬 科学・テクノロジー
   - 🌍 国際ニュース

   **【重要】各コーナー最大8件を厳選。特に注目度の高い投稿を優先的に紹介してください。**

   **各コーナーの構成：**

   A. **コーナー冒頭のトレンド概要**（3-4文）
      - 今日のこのジャンルの傾向を分析して語る
      - なぜ今日この話題が盛り上がっているのか背景を解説
      - 例：「今バズってる話題のコーナーです。今日はお正月明けということもあり、仕事始めに関する投稿や、年末年始の振り返りが目立ちますね。特に新年の抱負を語る投稿が多くの共感を集めているようです。では早速見ていきましょう。」

   B. **投稿の紹介**（最大8件を洞察付きで紹介）

      **各投稿には必ず以下の要素を含めること：**
      1. 投稿者の紹介
      2. 投稿内容（原文を読む、URLは省略）
      3. **【重要】なぜこの投稿が注目されているのかの洞察**
         - いいね数・アールティー数が多い場合：「なんと1万いいねを超えています！多くの人の共感を呼んでいるようですね」
         - バズ理由がある場合：「この投稿がバズっている理由は〇〇とのこと。確かに〇〇ですよね」
         - 話題性がある場合：「これは〇〇に関連した投稿ですね。今まさに注目されているテーマです」
         - 共感を呼ぶ内容：「多くの人が同じ思いを抱えているのかもしれませんね」
         - ユニークな視点：「なるほど、こういう見方もあるんですね」

      **紹介の流れ：**
      - 関連する投稿はグルーピングして紹介
      - 投稿間は繋ぎ言葉でスムーズに移行
      - 例：「続いても同じテーマで...」「話題を変えまして...」「次は少し違う角度から...」

   C. **コーナー締め**（今日のこのジャンルの総括）
      - 「以上、今バズってる話題のコーナーでした。今日は〇〇な投稿が多かったですね」
      - 一言で今日のトレンドをまとめる

3. **エンディング**（今日の番組全体の振り返り）
   - 今日特に印象に残った話題を1-2個ピックアップ
   - 「今日は〇〇の話題が特に盛り上がっていましたね」
   - 「以上、エックスタイムラインラジオでした。また次回お会いしましょう」

【スタイルガイド】
- **洞察を加えながらテンポよく進行**
- 投稿内容は原文を読む（URLは省略）
- 数字（いいね数、アールティー数）はインパクトを持って紹介
- 政治的な投稿は中立的に、でも注目されている理由は解説
- 関連する投稿をグルーピングして、話の流れを作る
- 「では」「さて」「続いて」「同じく」などの繋ぎ言葉でテンポを出す
- **各投稿に対して「なぜ注目されているか」の一言洞察を必ず加える**

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
      "script": "エックスタイムラインラジオ、1月3日金曜日です。今日1月3日は『ひとみの日』だそうです。1と3で『ひとみ』の語呂合わせなんですね。目の健康、大事にしたいですね。皆さんにとって素敵な一日になりますように。それでは始めていきましょう。",
      "estimatedDuration": 30
    },
    {
      "id": "corner-entertainment",
      "type": "corner",
      "genre": "entertainment",
      "title": "🎬 エンタメ",
      "script": "エンタメコーナーです。今日は新年ということもあり、ブイチューバーや声優さんからの新年挨拶や、プレゼントキャンペーンの投稿が目立ちますね。では早速見ていきましょう。まずはプレゼントキャンペーンから。ニタミューズメントさんの投稿です。「新春プレゼントキャンペーン第三弾...」実機プレゼントは夢がありますね。同じくキャンペーン系で、アールシーリジェクトさんの投稿です。「いつもリジェクトを応援してくださるファンの皆様...」豪華なプレゼントですね。続いて新年挨拶に移りましょう。ウサダペコラさんの投稿です。「新春三期生24時間配信、完走...」完走お疲れ様でした。以上、エンタメコーナーでした。",
      "estimatedDuration": 140
    }
  ],
  "totalDuration": 20
}
\`\`\`

scriptには演出指示やカッコ書きを含めず、純粋な読み上げテキストのみを出力してください。@マークは絶対に含めないこと。`;
}

// ========================================
// X政治家ウオッチ用プロンプト
// ========================================
function generatePoliticianWatchPrompt(allPosts: any, month: number, day: number, weekday: string, todayString: string): string {
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

【重要：平易な言葉への置き換え】
内容は大人向けのまま、難しい熟語や四字熟語は**平易な言葉に置き換える**こと：
- 難読熟語は避け、一般的な表現に言い換える
- 四字熟語より、分かりやすい日本語表現を優先
- ラジオで聞いて一発で意味が伝わる言葉を選ぶ

【重要：TTSの読み方 - 人名・固有名詞は全てひらがな】

**★最重要★ 人名＋役職も全てひらがなで書く：**
- 高市早苗→たかいちさなえ
- 高市総理→たかいちそうり
- 岸田文雄→きしだふみお
- 岸田総理→きしだそうり
- 石破茂→いしばしげる
- 石破総理→いしばそうり
- 茂木敏充→もてぎとしみつ
- 茂木幹事長→もてぎかんじちょう
- 野田佳彦→のだよしひこ
- 玉木雄一郎→たまきゆういちろう
- 玉木代表→たまきだいひょう
- 馬場伸幸→ばばのぶゆき
- 松井一郎→まついいちろう
- その他の政治家名＋役職も全てひらがなで
- 「○○総理」「○○大臣」「○○幹事長」も全てひらがな化すること

**★固有名詞もひらがなで：**
- 箱根駅伝→はこねえきでん
- 青山学院大学→あおやまがくいんだいがく
- ベネズエラ→そのまま（カタカナ語はOK）

**漢字のまま使う語：**
- 政党名：自民党、公明党、立憲民主党、維新の会、国民民主党、共産党
- 政治用語：与党、野党、政権、政策、国会、選挙、法案、予算、閣僚、大臣、内閣総理大臣
- 一般的な漢字：新年、政界、熱い、激しい、戦い、反撃、批判、主張、意見、発表、優勝

**ひらがなにする語（難読漢字）：**
- 舌戦→ぜっせん、論戦→ろんせん
- 反駁→はんばく、糾弾→きゅうだん、弾劾→だんがい
- 詭弁→きべん、忖度→そんたく
- 邦人→ほうじん、覚悟→かくご、盤石→ばんじゃく

**英語はカタカナで：**
- X→エックス、SNS→エスエヌエス

【番組概要】
- 番組名: X政治家ウオッチ
- 今日の日付: ${todayString}

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
    { "id": "ruling-party", "type": "corner", "genre": "ruling-ldp", "title": "与党陣営", "script": "読み上げテキスト", "estimatedDuration": 180 },
    { "id": "opposition", "type": "corner", "genre": "opposition-cdp", "title": "野党陣営", "script": "読み上げテキスト", "estimatedDuration": 180 },
    { "id": "clash", "type": "corner", "genre": "opposition-ishin", "title": "対立ポイント", "script": "読み上げテキスト", "estimatedDuration": 150 },
    { "id": "public-voice", "type": "corner", "genre": "public-reaction", "title": "国民の声", "script": "読み上げテキスト", "estimatedDuration": 120 },
    { "id": "ending", "type": "closing", "title": "エンディング", "script": "読み上げテキスト", "estimatedDuration": 60 }
  ]
}
\`\`\`

台本をJSON形式で出力してください。`;
}

// ========================================
// オールドメディアをぶっ壊せラジオ用プロンプト
// ========================================
function generateOldMediaBusterPrompt(allPosts: any, month: number, day: number, weekday: string, todayString: string): string {
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
      const targetMedia = p.target_media ? `【批判対象: ${p.target_media}】` : '';
      const mediaAction = p.media_action ? `【メディアの行動: ${p.media_action}】` : '';
      const criticismPoint = p.criticism_point ? `【批判ポイント: ${p.criticism_point}】` : '';
      return `${i + 1}. @${p.author?.username || 'user'}（${p.author?.name || 'ユーザー'}）${targetMedia}${mediaAction}${criticismPoint}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 400)}」`;
    }).join('\n\n');

    allPostsText += `\n### ${info.icon} ${info.name}（${posts.length}件）\n${postsText}\n`;
  }

  return `あなたは「オールドメディアをぶっ壊せラジオ」の台本作家です。皮肉を込めたコメンテーター風の番組を作ります。

【番組コンセプト】
NHK、新聞、民放テレビなどのオールドメディアに対する批判的な投稿を**具体的に引用**し、皮肉を込めてコメントする。
実際のXユーザーの声を紹介しながら、オールドメディアの問題点を浮き彫りにする番組。

【★最重要★ 投稿の具体的な引用】
各コーナーでは、収集した投稿を**必ず具体的に引用**してください：
- 「○○さんはこう投稿しています。『（投稿内容の引用）』」
- 「これに対して△△さんは『（投稿内容）』と指摘しています」
- 各コーナーで最低3-5件の投稿を引用すること
- ユーザー名（ひらがな読み）と投稿内容をセットで紹介
- 引用後に皮肉を込めたコメントを添える

【パーソナリティキャラクター】
- 皮肉を込めたコメンテーター
- 低めの落ち着いた声
- 「またですか」「驚きですね」「さすがですね」のような皮肉
- 淡々と、しかし鋭く
- 過激な表現は避けつつ、問題点は明確に指摘
- 投稿を紹介した後に「なるほど」「確かに」などの相槌

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
- ❌ 演出指示やカッコ書き
- ✅ パーソナリティが話す言葉のみ

【重要：平易な言葉への置き換え】
内容は大人向けのまま、難しい熟語や四字熟語は**平易な言葉に置き換える**こと：
- 難読熟語は避け、一般的な表現に言い換える
- 例：「厚顔無恥」→「恥知らず」「図々しい」
- 例：「媚中反日」→「中国寄りで日本に批判的」
- 例：「大盤振る舞い」→「気前よくばらまく」
- 四字熟語より、分かりやすい日本語表現を優先
- ラジオで聞いて一発で意味が伝わる言葉を選ぶ

【重要：TTSの読み方 - スクリプト内でひらがなに変換すること】
- **@マークは絶対に読まない！台本に含めない！**（「アット」「アットマーク」も禁止）
- メディア名ははっきりと（NHK→エヌエイチケー、TBS→ティービーエス）
- ユーザー名は読みやすい形で（英数字混じりはカタカナ読み、@なしで「○○さん」）
- 以下の漢字は**スクリプト内でひらがなに変換して出力**すること：
  - 「血税」→「けつぜい」
  - 「捏造」→「ねつぞう」
  - 「忖度」→「そんたく」
  - 「揶揄」→「やゆ」
  - 「糾弾」→「きゅうだん」
  - 「誹謗」→「ひぼう」
  - 「偏向」→「へんこう」
  - 「大盤振る舞い」→「おおばんぶるまい」
  - 「憤る/憤って」→「いきどおる/いきどおって」
  - 「媚中反日」→「びちゅうはんにち」
  - 「火の玉」→「ひのたま」
  - 「厚顔無恥」→「こうがんむち」
  - その他、読み間違えやすい熟語もひらがなで
- 英語はカタカナで

【番組概要】
- 番組名: オールドメディアをぶっ壊せラジオ
- 今日の日付: ${todayString}

【収集した投稿 - これを具体的に引用すること！】
${allPostsText || '（該当なし）'}

【番組構成 - 各コーナー3-5件の投稿を具体的に引用すること】

1. **オープニング**（60秒）
   - 「オールドメディアをぶっ壊せラジオ、${month}月${day}日${weekday}曜日です」
   - 「今日もXに寄せられたオールドメディアへの声を紹介していきます」
   - 今日のハイライト（特に問題のあったメディアの行動を予告）

2. **NHK批判コーナー**（4-5分）
   - 「まずはエヌエイチケーへの声から」
   - 以下のパターンで3-5件紹介：
     1. 「○○さんがこう投稿しています」
     2. 「エヌエイチケーが△△について□□した」（メディアの具体的行動）
     3. 「それに対して『（投稿内容の引用）』と批判しています」
     4. パーソナリティのコメント（「受信料を払ってこれですか」など）
   - 各投稿について、何が問題だったかを明確に

3. **新聞批判コーナー**（4-5分）
   - 「続いて新聞各社への声です」
   - 同様に3-5件、「どの新聞が」「何をしたか」「それへの批判」をセットで
   - 「これぞ新聞クオリティ」のような皮肉

4. **民放批判コーナー**（4-5分）
   - 「さて、民放テレビへの声も見ていきましょう」
   - 同様に3-5件、「どの番組で」「何をしたか」「それへの批判」をセットで
   - 「スポンサーの顔色うかがいですかね」のような皮肉

5. **エンディング**（60秒）
   - 「今日紹介したのはほんの一部です」
   - 「メディアリテラシー、大事ですね」
   - 「オールドメディアをぶっ壊せラジオ、また次回お会いしましょう」

【出力形式】
\`\`\`json
{
  "sections": [
    { "id": "opening", "type": "opening", "title": "オープニング", "script": "読み上げテキスト", "estimatedDuration": 60 },
    { "id": "nhk", "type": "corner", "genre": "nhk", "title": "NHK批判", "script": "読み上げテキスト", "estimatedDuration": 180 },
    { "id": "newspapers", "type": "corner", "genre": "newspapers", "title": "新聞批判", "script": "読み上げテキスト", "estimatedDuration": 180 },
    { "id": "tv-stations", "type": "corner", "genre": "tv-stations", "title": "民放批判", "script": "読み上げテキスト", "estimatedDuration": 180 },
    { "id": "ending", "type": "closing", "title": "エンディング", "script": "読み上げテキスト", "estimatedDuration": 60 }
  ]
}
\`\`\`

台本をJSON形式で出力してください。`;
}

// ========================================
// X災害ニュース用プロンプト（速報性・ライブ感重視版）
// ========================================
function generateDisasterNewsPrompt(allPosts: any, month: number, day: number, weekday: string, todayString: string): string {
  // 新しいジャンル構成（被害情報を充実）
  const genreInfo: Record<string, { name: string; icon: string }> = {
    'damage': { name: '被害情報', icon: '🔥' },
    'breaking': { name: '速報', icon: '🚨' },
    'local-voices': { name: 'Xの災害レポート', icon: '📢' },
    'warnings': { name: '警報・注意報', icon: '⚠️' },
    'infrastructure': { name: '交通・ライフライン', icon: '🚃' },
    'preparedness': { name: '防災情報', icon: '🛡️' },
  };

  let allPostsText = '';
  let hasAnyPosts = false;

  // 速報を最優先、防災情報は最後
  const genreOrder = ['breaking', 'damage', 'local-voices', 'warnings', 'infrastructure', 'preparedness'];

  for (const genreId of genreOrder) {
    const posts = allPosts[genreId];
    if (!Array.isArray(posts) || posts.length === 0) continue;
    const info = genreInfo[genreId];
    if (!info) continue;

    hasAnyPosts = true;
    const postsText = posts.map((p: any, i: number) => {
      const location = p.location ? `【場所: ${p.location}】` : '';
      const sourceType = p.source_type ? `【情報源: ${p.source_type}】` : '';
      const postedTime = p.posted_time ? `【${p.posted_time}】` : '';
      return `${i + 1}. @${p.author?.username || p.author_username || 'user'}（${p.author?.name || p.author_name || 'ユーザー'}）${location}${sourceType}${postedTime}\n   「${p.text?.replace(/\n/g, ' ').slice(0, 400)}」`;
    }).join('\n\n');

    allPostsText += `\n### ${info.icon} ${info.name}（${posts.length}件）\n${postsText}\n`;
  }

  // 現在時刻を取得
  const now = new Date();
  const japanNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
  const hours = japanNow.getHours();
  const minutes = japanNow.getMinutes();
  const currentTime = `${hours}時${minutes}分`;

  return `あなたは「X災害ニュース」のライブ台本作家です。**今まさに起きていること**を伝える速報番組を作ります。

【★Google Mapsグラウンディング活用★】
この台本ではGoogle Mapsの地理情報データを活用できます。以下に注意してください：
- 投稿に含まれる地名が正確かどうか、Google Mapsで確認してください
- 「○○市は△△県の北部に位置し」のような地理的コンテキストを適宜追加
- 災害発生地域の周辺情報（近くの主要都市、河川名など）も補足可能
- 避難所や公共施設の正確な場所情報があれば活用

【★最重要：ライブニュース感★】
この番組は「録音」ではなく「生放送」のつもりで書いてください：
- 「たった今入った情報です」「○時○分現在の状況です」
- 「先ほど△△から報告がありました」
- 「現在も状況は続いています」「引き続き警戒が必要です」
- 時刻や「現在」「今」という言葉を多用して臨場感を出す
- 情報の鮮度を常に意識した語り口

【番組コンセプト】
Xに投稿されたリアルタイムの災害情報を**速報形式**で伝える。
気象庁発表と現地からの生の声を織り交ぜ、**今何が起きているか**を明確に伝える。
Google Mapsの地理情報を活用し、より正確で分かりやすい位置情報を提供する。

【パーソナリティキャラクター】
- ニュースキャスター風の落ち着いた、しかし緊迫感のある語り口
- 「速報です」「現在の状況をお伝えします」
- 危険性は明確に、しかしパニックを煽らない
- 公式情報と現地情報を明確に区別（「気象庁によると」「現地の方の投稿では」）

【重要：読み上げ専用テキスト】
scriptには「そのまま声に出して読める文章」のみを書いてください。
- ❌ 演出指示やカッコ書き
- ❌ ふりがな・読み仮名の括弧書き（例：「災害（さいがい）」は禁止）
- ✅ パーソナリティが話す言葉のみ

【重要：地名は積極的にひらがな化＋正確な読み方確認】
地名は読み間違いが多いため、**市区町村名はひらがなで書く**こと：
- ✅「いしかわ県わじま市」「にいがた県じょうえつ市」「みやざき県にちなん市」
- ✅「ほっかいどう」「あおもり県」「いわて県」「あきた県」
- ❌ 括弧書きのふりがなは禁止（「輪島市（わじまし）」はダメ）
- 東京、大阪、京都、名古屋など超有名都市のみ漢字OK

**地名の読み方は正確に！よくある誤読例：**
- 「羽沢」→「はざわ」（❌はなざわ）※横浜市神奈川区
- 「日暮里」→「にっぽり」（❌ひぐれさと）
- 「舎人」→「とねり」（❌しゃじん）
- 「等々力」→「とどろき」
- 「喜連瓜破」→「きれうりわり」
- 「放出」→「はなてん」（❌ほうしゅつ）
- 「十三」→「じゅうそう」（❌じゅうさん）
- 「御徒町」→「おかちまち」
- 「馬喰町」→「ばくろちょう」
- 「神楽坂」→「かぐらざか」
- 「麻布十番」→「あざぶじゅうばん」
- 「祖師ヶ谷大蔵」→「そしがやおおくら」
- 「百舌鳥」→「もず」
- 「枚方」→「ひらかた」（❌まいかた）
- 「交野」→「かたの」（❌こうの）
- 「河内長野」→「かわちながの」
- 「四條畷」→「しじょうなわて」
- 「柏原」→「かしわら」（大阪）/「かしはら」（奈良）※地域で異なる
- 「各務原」→「かかみがはら」
- 「安曇野」→「あづみの」

**駅名・施設名も注意：**
- 「羽沢横浜国大」→「はざわよこはまこくだい」
- 「溜池山王」→「ためいけさんのう」
- 「永田町」→「ながたちょう」
- 「霞ケ関」→「かすみがせき」
- 「虎ノ門」→「とらのもん」

**地名の読みに自信がない場合は、ひらがなで出力すること。**

【重要：数値と単位】
- 震度は「震度○」とはっきり読む
- 雨量は「○ミリ」、風速は「秒速○メートル」

【重要：誤読されやすい語句はひらがなで】
TTSが誤読しやすい語句は、ひらがなで書いてください：
- 「今日」→「きょう」（「こんにち」と誤読される）
- 「今朝」→「けさ」
- 「今夜」→「こんや」
- 「明日」→「あした」または「あす」
- 「昨日」→「きのう」
- 「一昨日」→「おととい」
- 「今」→「いま」
- 「何時」→「なんじ」
- 「日本海側」→「にほんかいがわ」（「にち ほんかいがわ」と誤読される）
- 「太平洋側」→「たいへいようがわ」
- 「東日本」→「ひがしにほん」
- 「西日本」→「にしにほん」
- 「北日本」→「きたにほん」
- 「○棟」→「○むね」（建物の数え方。「とう」は誤り）
- 「○軒」→「○けん」（家の数え方）
- 「○戸」→「○こ」（住戸の数え方）
- 「事案」→「じあん」（「こと あん」は誤り）
- 「事象」→「じしょう」
- 「事態」→「じたい」

【災害関連用語の読み方】
- 「高潮」→「たかしお」（「こうちょう」は誤り）
- 「津波」→「つなみ」
- 「土砂崩れ」→「どしゃくずれ」
- 「土石流」→「どせきりゅう」
- 「氾濫」→「はんらん」
- 「決壊」→「けっかい」
- 「冠水」→「かんすい」
- 「浸水」→「しんすい」
- 「床上浸水」→「ゆかうえしんすい」
- 「床下浸水」→「ゆかしたしんすい」
- 「河川」→「かせん」
- 「堤防」→「ていぼう」
- 「避難」→「ひなん」
- 「避難所」→「ひなんじょ」
- 「倒壊」→「とうかい」
- 「全壊」→「ぜんかい」
- 「半壊」→「はんかい」
- 「一部損壊」→「いちぶそんかい」
- 「罹災」→「りさい」
- 「被災」→「ひさい」
- 「復旧」→「ふっきゅう」
- 「応急」→「おうきゅう」
- 「救援」→「きゅうえん」
- 「救助」→「きゅうじょ」
- 「行方不明」→「ゆくえふめい」
- 「安否」→「あんぴ」
- 「孤立」→「こりつ」
- 「断水」→「だんすい」
- 「停電」→「ていでん」
- 「通行止め」→「つうこうどめ」
- 「運休」→「うんきゅう」
- 「欠航」→「けっこう」

【番組概要】
- 番組名: X災害ニュース
- 今日の日付: ${todayString}
- 現在時刻: ${currentTime}

【収集した投稿】
${allPostsText || '（現在、大きな災害情報は入っていません）'}

【★超重要：投稿の引用★】
**収集した投稿は全て台本に組み込んでください。1件も省略しないこと！**
これはXの投稿を紹介する番組です。投稿を引用しないと番組の意味がありません。

**@マークは絶対に読まない！台本に含めない！**
- ❌「@tanaka さん」→ ✅「タナカさん」
- ❌「アットマーク tanaka」→ ✅「タナカさん」

**★重要：同じ内容の投稿は必ずまとめる★**
同じ災害・事象について複数の投稿がある場合、個別に読み上げず以下のようにまとめてください：

1. **権威性の順番で紹介**（公式機関 > 報道機関 > 専門家 > 一般ユーザー）
2. **代表的な内容を1回だけ読み上げ**、他は名前のみ列挙
3. **「○○さん、△△さん、□□さんも同様に伝えています」**の形式

**まとめ方の例：**
- ✅「にいがた県での地震について、気象庁、NHKニュース、さらにタナカさん、サトウさん、ヤマダさんなど多くの方が伝えています。気象庁の発表によると『午後2時15分ごろ、震度4を観測しました』とのことです。現地の方々からは『かなり揺れた』『棚から物が落ちた』といった声が届いています。」
- ❌「タナカさんの投稿です。『揺れた』続いてサトウさん。『揺れた』ヤマダさんも『揺れた』...」（同じ内容の繰り返しは禁止）

**単独の投稿の紹介形式：**
1. 投稿者の紹介（「○○さんの投稿です」※@なし、カタカナorひらがな）
2. 投稿内容を原文で読み上げ（「」で囲む、URLは省略）
3. 一言コメント（「現地の緊迫感が伝わってきますね」など）

**引用例：**
- 「にいがた市にお住まいのタナカさんの投稿です。『今すごい揺れた！棚から物が落ちてきた。みんな大丈夫？』　現地の緊迫感が伝わってきますね。」
- 「気象庁の公式アカウントからです。『○○地方に大雨警報を発表しました』　該当地域の方はご注意ください。」
- 「続いてサトウさんの投稿。『うちの前の道路が冠水してる。車は無理。写真あげます』　現地の状況がよく分かりますね。」

【番組構成】★速報を最優先★

1. **オープニング**（20-30秒）
   - 「X災害ニュース、${currentTime}現在の情報をお伝えします」
   - 緊急度の高い情報があれば「まず速報です」で始める
${hasAnyPosts ? `
2. **速報コーナー**（2-3分）★オープニング直後に配置★
   - 「まず、緊急性の高い速報からお伝えします」
   - **収集した速報ジャンルの投稿を全て紹介**
   - 地震、津波警報、特別警報など最新の速報
   - 「たった今入った情報です」「○時○分現在の状況です」

3. **被害情報コーナー**（3-4分）
   - 「続いて、現在発生している被害の状況です」
   - **収集した被害情報ジャンルの投稿を全て紹介**
   - 火災、建物被害、人的被害などを具体的に
   - 「△△さんの投稿です。『現場から煙が見える』」

4. **Xの災害レポート**（2-3分）
   - 「Xに届いている災害レポートをご紹介します」
   - **収集したXの災害レポートジャンルの投稿を全て紹介**
   - 一般ユーザーの生の声を臨場感を持って伝える
   - 「○○にお住まいの△△さんの投稿です。『投稿内容』」の形式で

5. **警報・注意報コーナー**（2分）
   - 「ここで公式の警報・注意報情報です」
   - **収集した警報ジャンルの投稿を全て紹介**
   - 気象庁など公式アカウントの投稿を優先的に読み上げ

6. **交通・ライフラインコーナー**（2分）
   - 「生活に影響する情報をまとめてお伝えします」
   - **収集した交通・ライフラインジャンルの投稿を全て紹介**
   - 運休、通行止め、停電などの投稿を具体的に紹介

7. **防災情報コーナー**（1-2分）★エンディング前に配置★
   - 「最後に、防災に関する情報です」
   - **収集した防災情報ジャンルの投稿を全て紹介**
   - 避難所開設、避難指示、備えの呼びかけなど

8. **エンディング**（20-30秒）
   - 「以上、${currentTime}現在のX災害ニュースでした」
   - 「最新情報は気象庁やお住まいの自治体でご確認ください」
   - 「どうか安全にお過ごしください」
` : `
2. **本日の状況**（1分）
   - 「現在、緊急性の高い災害情報は入っていません」
   - 「引き続き、気象情報にご注意ください」

3. **エンディング**（20秒）
   - 「X災害ニュースでした」
`}

【出力形式】
\`\`\`json
{
  "sections": [
    {
      "id": "opening",
      "type": "opening",
      "title": "オープニング",
      "script": "X災害ニュース、14時30分現在の情報をお伝えします。きょうは各地で大雨や地震の速報が入っています。",
      "estimatedDuration": 30
    },
    {
      "id": "breaking",
      "type": "corner",
      "genre": "breaking",
      "title": "速報",
      "script": "まず、緊急性の高い速報からお伝えします。たった今入った情報です。気象庁の公式アカウントからです。『いしかわ県のとおり地方に大雨警報を発表しました。土砂災害に警戒してください』　該当地域の方は十分ご注意ください。続いて地震情報です。午後2時15分ごろ、にいがた県で震度3を観測しました。",
      "estimatedDuration": 150
    },
    {
      "id": "damage",
      "type": "corner",
      "genre": "damage",
      "title": "被害情報",
      "script": "続いて、現在発生している被害の状況です。さいたま市で住宅火災が発生しています。消防によると、午前10時ごろ出火し、いま現在も消火活動が続いているとのことです。現地のスズキさんの投稿です。『近所で火事。消防車が5台くらい来てる。煙がすごい』　現場の緊迫した状況が伝わってきます。",
      "estimatedDuration": 180
    },
    {
      "id": "local-voices",
      "type": "corner",
      "genre": "local-voices",
      "title": "Xの災害レポート",
      "script": "Xに届いている災害レポートをご紹介します。のと町にお住まいのタナカさんの投稿です。『うちの前の道路が冠水してる。車は無理』　写真も投稿されていて、現地の状況がよく分かります。続いてサトウさん。『停電した。懐中電灯探してる』　ライフラインにも影響が出ているようです。",
      "estimatedDuration": 150
    },
    {
      "id": "preparedness",
      "type": "corner",
      "genre": "preparedness",
      "title": "防災情報",
      "script": "最後に、防災に関する情報です。かなざわ市の公式アカウントからです。『○○公民館を避難所として開設しました』　お近くの方はご利用ください。",
      "estimatedDuration": 90
    }
  ]
}
\`\`\`

${hasAnyPosts ? '**重要：収集した投稿は必ず全て台本に含めること。投稿がないジャンルのみ省略可。**' : '災害がないため、短い番組構成で。'}
台本をJSON形式で出力してください。`;
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
      // 文の切れ目（。！？）で分割、読点（、）も候補に
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

  // 2番目以降のチャンクの先頭に全角スペースを追加（TTSの頭切れ防止）
  return chunks.map((chunk, index) => {
    if (index === 0) return chunk;
    // 先頭に全角スペースを追加してTTSに小休止を与える
    return '　' + chunk;
  });
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
