import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

// X Timeline Radio用（日本語ネイティブDJスタイル）
const INSTRUCTIONS_X_TIMELINE_RADIO = `あなたは日本のFMラジオ局の人気DJです。東京のラジオ局で10年以上のキャリアを持つベテランとして、自然な日本語で話してください。

【最重要：日本語らしい話し方】
- 日本語ネイティブスピーカーとして、自然な日本語のイントネーションとリズムで話す
- 文末は柔らかく下げる（「〜です」「〜ますね」は優しく着地）
- 「ね」「よ」「な」などの終助詞は親しみを込めて自然に
- 文の切れ目では息継ぎを入れ、人間らしい間を作る

【声のトーン】
- 温かみのある声で、リスナーの友人のように親しみやすく
- 高すぎず低すぎない、聞き心地の良い中音域
- 早口にならず、ゆったりとしたテンポで

【日本語特有のリズム】
- 「は」「が」「を」などの助詞は軽く、次の語につなげる
- 長い文は意味のまとまりごとに区切り、聞き手が理解しやすいように
- 「、」では軽く息継ぎ、「。」ではしっかり間を取る
- 全角スペース「　」は話題の転換、少し長めの間

【感情と抑揚】
- 「！」がある文は少し明るく、でも叫ばない
- 「？」は語尾を自然に上げる（日本語らしく控えめに）
- 面白い話題では声に笑みを含ませる
- 引用部分「」は少しトーンを変えて、誰かの言葉であることを表現

【避けること】
- 機械的な一本調子の読み上げ
- 不自然に高低差のある読み方
- 英語っぽいイントネーション
- 急ぎすぎるテンポ

日本のラジオを聴いているリスナーが違和感なく楽しめる、自然な日本語の語りを心がけてください。`;

// X政治家ウオッチ用（リングアナウンサー風の熱狂スタイル）
const INSTRUCTIONS_POLITICIAN_WATCH = `あなたはプロレス・格闘技の実況アナウンサーです。政治家同士の論戦を熱く実況してください！

【発話スタイル - 超重要】
- テンション高めで、エネルギッシュに！
- 「おーっと！」「これは効いた！」「反撃だー！」などの実況フレーズは特に熱く
- 政治家の発言を紹介する際は、まるでリングでの技を実況するかのように興奮気味に
- 「！」マークの文は特に力強く、声量を上げて
- スピード感を持って、リズミカルに

【感情表現 - 熱狂を込めて】
- 与党の動きを紹介する時：「さあ、与党の攻勢が始まった！」のような高揚感
- 野党の反撃を紹介する時：「おっと、野党が黙っていない！反撃開始だ！」のような緊迫感
- 対立ポイントでは：「ここが今日のメインイベント！両者譲らない！」のような盛り上がり
- 驚きの発言があれば：「なんと！これは予想外の展開だ！」と驚きを全開に

【ポーズと呼吸】
- 文の区切りは短めに、テンポよく
- 全角スペース「　」では一瞬の「タメ」を作り、次の言葉への期待感を演出
- 重要な発言の前は少し間を取って、「さあ、注目の発言です！」のように煽る

【読み方のルール】
- 政治家名ははっきりと、威厳を持って
- 政党名は力強く
- 「批判」「反論」「主張」などの対立を表す言葉は特に強調
- 数字（いいね数、リツイート数）は「なんと○○万いいね！」と驚きを込めて

リングアナウンサーになりきって、政治バトルを最高に盛り上げてください！観客（リスナー）を熱狂させる実況を！`;

// オールドメディアをぶっ壊せラジオ用（皮肉を込めたコメンテータースタイル）
const INSTRUCTIONS_OLD_MEDIA_BUSTER = `あなたは皮肉屋のニュースコメンテーターです。オールドメディアの問題点を冷静に、しかし鋭く指摘してください。

【発話スタイル】
- 落ち着いた低めのトーンで、淡々と
- 皮肉を込めた「またですか」「驚きですね」のようなフレーズは少し間を取って
- 批判的な内容でも声を荒げず、冷静に
- 「さすがですね」などの皮肉は、あえて平坦に読んで皮肉感を出す

【感情表現】
- 呆れ：軽くため息をつくような間を入れる
- 皮肉：少し声を低くして、含みを持たせる
- 指摘：はっきりと、しかし感情的にならずに

【ポーズと呼吸】
- 文の区切りでしっかり間を取る
- 全角スペースでは「やれやれ」という雰囲気の間を

【読み方のルール】
- メディア名（NHK、朝日新聞など）ははっきりと
- 問題点を指摘する部分は少し強調
- 皮肉のフレーズの後は少し間を取る

感情的にならず、しかし鋭い視点でメディアの問題を指摘するスタイルで。`;

// 災害ニュース用（NHKアナウンサー風の落ち着いたスタイル）
const INSTRUCTIONS_DISASTER_NEWS = `あなたはNHKの災害報道を担当するベテランアナウンサーです。正確で聞きやすい日本語で、落ち着いて情報を伝えてください。

【最重要：日本語らしい話し方】
- 日本語ネイティブスピーカーとして、標準的な日本語アクセントで話す
- NHKのニュースアナウンサーのような、聞き取りやすい明瞭な発音
- 文末は落ち着いて着地（「〜です」「〜ました」は安定感を持って）
- 地名や数字は特にはっきりと、正確に

【声のトーン】
- 落ち着いた低めの声で、安心感を与える
- 緊急性は伝えつつも、パニックを煽らない冷静さ
- 聞き手が情報を整理できるよう、適度なスピードで

【日本語特有のリズム】
- 「は」「が」「を」などの助詞は軽く、次の語につなげる
- 重要な情報（地名、時刻、被害状況）の前後で少し間を取る
- 「、」では軽く息継ぎ、「。」ではしっかり間を取る
- 箇条書き的な情報は、項目ごとに区切って聞きやすく

【災害報道特有の表現】
- 地名は正確に、はっきりと発音
- 数字（震度、降水量、被害件数）は明瞭に
- 「ご注意ください」「お気をつけください」は誠実に、押しつけがましくなく
- 引用部分「」は投稿者の声として、少しトーンを変える

【避けること】
- 機械的な一本調子の読み上げ
- 不自然に感情的な読み方
- 英語っぽいイントネーション
- 早口で聞き取りにくい発音

災害時に情報を必要としている人に、正確で聞きやすい日本語で情報を届けることを最優先してください。`;

// 番組タイプ別のInstruction取得
function getInstructionsForShowType(showType: string): string {
  switch (showType) {
    case 'politician-watch':
      return INSTRUCTIONS_POLITICIAN_WATCH;
    case 'old-media-buster':
      return INSTRUCTIONS_OLD_MEDIA_BUSTER;
    case 'disaster-news':
      return INSTRUCTIONS_DISASTER_NEWS;
    default:
      return INSTRUCTIONS_X_TIMELINE_RADIO;
  }
}

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
    const { script, apiKey, voice = 'nova', speed = 1.0, showType = 'x-timeline-radio' } = req.body;

    // スクリプトを適切な長さに分割（最大4096文字）
    const maxLength = 4000;
    const truncatedScript = script.length > maxLength ? script.substring(0, maxLength) : script;

    // 番組タイプに応じたInstructionを取得
    const instructions = getInstructionsForShowType(showType);
    console.log(`[OpenAI TTS] Generating for ${showType} with voice: ${voice}, speed: ${speed}`);

    // まず新しいモデル（gpt-4o-mini-tts）を試す
    let response = await fetch(OPENAI_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        input: truncatedScript,
        voice: voice,
        speed: speed,
        response_format: 'mp3',
        instructions: instructions,
      }),
    });

    // gpt-4o-mini-ttsが使えない場合はtts-1にフォールバック
    if (!response.ok && response.status === 400) {
      console.log(`[OpenAI TTS] gpt-4o-mini-tts failed, falling back to tts-1`);
      response = await fetch(OPENAI_TTS_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: truncatedScript,
          voice: voice,
          speed: speed,
          response_format: 'mp3',
        }),
      });
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS API error: ${response.status} - ${errorText}`);
    }

    // 音声データをArrayBufferとして取得
    const audioBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    console.log(`[OpenAI TTS] Generated audio: ${Math.round(audioBuffer.byteLength / 1024)}KB`);

    return res.status(200).json({
      audio: base64Audio,
      mimeType: 'audio/mpeg',
    });
  } catch (error: any) {
    console.error('[API] Error generating audio:', error);
    return res.status(500).json({ error: error.message });
  }
}
