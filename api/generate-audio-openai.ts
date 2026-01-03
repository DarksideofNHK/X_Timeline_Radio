import type { VercelRequest, VercelResponse } from '@vercel/node';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

const JAPANESE_INSTRUCTIONS = `日本語で自然に話してください。ラジオDJのように明るく親しみやすいトーンで読み上げてください。
漢字の読み方は一般的な読み方を使用し、アルファベットや英単語はカタカナ読みで発音してください。`;

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
    const { script, apiKey, voice = 'nova', speed = 1.0 } = req.body;

    // スクリプトを適切な長さに分割（最大4096文字）
    const maxLength = 4000;
    const truncatedScript = script.length > maxLength ? script.substring(0, maxLength) : script;

    console.log(`[OpenAI TTS] Generating with voice: ${voice}, speed: ${speed}`);

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
        instructions: JAPANESE_INSTRUCTIONS,
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
