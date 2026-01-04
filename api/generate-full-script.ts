import type { VercelRequest, VercelResponse } from '@vercel/node';

// Gemini API
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

// 番組タイプ設定（インライン定義）
const INLINE_SHOW_CONFIGS: Record<string, { name: string; voice: string; bgm: string; allowDownload: boolean }> = {
  'politician-watch': {
    name: 'X政治家ウオッチ',
    voice: 'echo',
    bgm: 'Cybernetic_Dominion',
    allowDownload: true,
  },
  'old-media-buster': {
    name: 'オールドメディアをぶっ壊せラジオ',
    voice: 'onyx',
    bgm: 'Victory_Lap',
    allowDownload: false,
  },
  'x-timeline-radio': {
    name: 'X Timeline Radio',
    voice: 'nova',
    bgm: 'Digital_Newsfeed_Groove',
    allowDownload: false,
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
    const { allPosts, apiKey, showType } = req.body;

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
    } else {
      // X Timeline Radio
      prompt = generateXTimelineRadioPrompt(allPosts, month, day, weekday, todayString);
    }

    console.log(`[FullScript] Generating script for showType: ${showType || 'x-timeline-radio'}`);

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

2. **7つのコーナー**（各コーナー10件の投稿を全て紹介）
   - 🔥 今バズってる話題
   - 🏛️ 政治ニュース
   - 💹 経済・マネー
   - 🏠 暮らし・生活
   - 🎬 エンタメ
   - 🔬 科学・テクノロジー
   - 🌍 国際ニュース

   **【超重要】提供された投稿は10件全て紹介してください。1件も省略しないこと！**

   **各コーナーの構成：**

   A. **コーナー冒頭のトレンド概要**（3-4文）
      - 今日のこのジャンルの傾向を分析して語る
      - なぜ今日この話題が盛り上がっているのか背景を解説
      - 例：「今バズってる話題のコーナーです。今日はお正月明けということもあり、仕事始めに関する投稿や、年末年始の振り返りが目立ちますね。特に新年の抱負を語る投稿が多くの共感を集めているようです。では早速見ていきましょう。」

   B. **投稿の紹介**（全10件を洞察付きで紹介）

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
      "estimatedDuration": 180
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

【重要：TTSの読み方】
**基本方針：一般的な漢字はそのまま使う。難読漢字のみひらがな。**

**漢字のまま使う語（これらはひらがなにしない）：**
- 政党名：自民党、公明党、立憲民主党、維新の会、国民民主党、共産党
- 政治用語：与党、野党、政権、政策、国会、選挙、法案、予算、閣僚、大臣
- 一般的な漢字：新年、政界、熱い、激しい、戦い、反撃、批判、主張、意見

**ひらがなにする語（難読・誤読しやすい）：**
- 舌戦→ぜっせん、論戦→ろんせん
- 反駁→はんばく、糾弾→きゅうだん、弾劾→だんがい
- 詭弁→きべん、忖度→そんたく
- その他、中学生が読めない漢字のみ

**政治家名の読み方：**
- 漢字＋ふりがなの重複禁止（どちらか一方）
- 読み間違いが起きやすい名前のみひらがな（例：麻生太郎→あそうたろう）
- 一般的な名前は漢字でOK（例：岸田文雄はそのまま）

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
- 今日の日付: ${todayString}

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
