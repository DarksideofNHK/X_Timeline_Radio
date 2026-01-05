import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

// X Timeline Radio用（落ち着いたDJスタイル）
const INSTRUCTIONS_X_TIMELINE_RADIO = `日本のラジオ情報番組のDJとして、リスナーに語りかけるように話してください。

【発話スタイル】
明るく親しみやすいトーンで、適度な抑揚をつけて単調にならないように。句読点では自然なポーズを取り、聞きやすいテンポを保つ。重要な情報や数字は少し強調する。

【表現のニュアンス】
「！」の文は少し元気よく。「？」の文は語尾を軽く上げる。「…」や「、、」は少し長めの間を取る。新しいトピックに移る際はわずかにトーンを変えて場面転換を表現する。

【ポーズと呼吸】
文の区切りでは自然な息継ぎを入れる。長い文は意味のまとまりで区切って読む。全角スペース「　」がある箇所では、話題の転換として少し長めの間を取る。

【読み方のルール】
- 英語・アルファベットはカタカナ読み（例: Twitter → ツイッター、X → エックス、AI → エーアイ）
- 人名・固有名詞は丁寧に、はっきりと発音
- ユーザー名（@で始まるもの）は「アットマーク」を省略して読む（例: @taro123 → 「タロー123さん」）
- 難読漢字はひらがなで表記されたものをそのまま読む
- 数字は文脈に応じて自然に読む（例: 10万 → 「じゅうまん」、100件 → 「ひゃっけん」）
- 「w」や「笑」は軽く笑いを含めたトーンで表現

【感情表現】
- 驚きを表す内容では少し声を高くする
- 批判的な内容では落ち着いたトーンで
- 面白い内容では少し楽しそうに
- 引用部分は少しトーンを変えて区別する

ロボット的な単調読み上げは避け、実際のラジオ番組のような生き生きとした発話を心がけてください。`;

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

// 番組タイプ別のInstruction取得
function getInstructionsForShowType(showType: string): string {
  switch (showType) {
    case 'politician-watch':
      return INSTRUCTIONS_POLITICIAN_WATCH;
    case 'old-media-buster':
      return INSTRUCTIONS_OLD_MEDIA_BUSTER;
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
