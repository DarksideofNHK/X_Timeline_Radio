import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

// 日本語ネイティブDJスタイルの指示
const DEFAULT_INSTRUCTIONS = `あなたは日本生まれ日本育ちのFMラジオDJです。完璧な日本語ネイティブとして話してください。

【絶対守ること：日本語の自然なアクセント】
日本語は英語と違い、強弱アクセントではなく高低アクセントです。
- 単語ごとに正しい高低パターンで発音する
- 文全体は緩やかに下降していく（ダウンステップ）
- 文末は自然に下げて着地する
- 助詞「は」「が」「を」「に」は低く軽く発音

【日本語らしいリズムとテンポ】
- モーラ（拍）を均等に：「と・う・きょ・う」は4拍
- 長音・促音・撥音も1拍としてしっかり発音
- 早口にならない、聞き取りやすいテンポ
- 「、」で0.3秒、「。」で0.5秒の間

【声質とトーン】
- 中音域で温かみのある声
- 親しみやすいが馴れ馴れしくない
- 笑顔で話しているような明るさ

日本人リスナーが「自然な日本語だ」と感じる話し方をしてください。`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
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
    const { text, voice = 'nova', apiKey: requestApiKey, instructions } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' });
    }

    // APIキーがリクエストにない場合は環境変数から取得（フリーミアムモード対応）
    const apiKey = requestApiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return res.status(401).json({ error: 'OpenAI API key required' });
    }

    // テキストをクリーンアップ
    const cleanText = text
      .replace(/@/g, '')  // @マークを除去
      .replace(/\s+/g, ' ')  // 連続スペースを1つに
      .trim();

    if (!cleanText) {
      return res.status(400).json({ error: 'Text cannot be empty after cleanup' });
    }

    console.log(`[TTS] Generating audio for ${cleanText.length} characters, voice: ${voice}`);

    // OpenAI TTS API呼び出し
    const response = await fetch(OPENAI_TTS_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-tts',
        voice,
        input: cleanText,
        instructions: instructions || DEFAULT_INSTRUCTIONS,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS] OpenAI API error:', response.status, errorText);
      return res.status(500).json({
        error: 'TTS generation failed',
        details: errorText.slice(0, 200)
      });
    }

    // 音声データをストリーミングで返す
    const audioBuffer = await response.arrayBuffer();

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.byteLength);

    return res.send(Buffer.from(audioBuffer));

  } catch (error: any) {
    console.error('[TTS] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
