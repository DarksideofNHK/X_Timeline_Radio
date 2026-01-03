// OpenAI TTS API
// https://platform.openai.com/docs/guides/text-to-speech

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

// OpenAI TTS voices
export type OpenAIVoice = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer';

// 日本語用の指示（自然な発音のため）
const JAPANESE_INSTRUCTIONS = `日本語で自然に話してください。ラジオDJのように明るく親しみやすいトーンで読み上げてください。
漢字の読み方は一般的な読み方を使用し、アルファベットや英単語はカタカナ読みで発音してください。`;

export async function generateAudioOpenAI(
  script: string,
  apiKey: string,
  voice: OpenAIVoice = 'nova',
  speed: number = 1.0
): Promise<{ audio: string; mimeType: string }> {
  // スクリプトを適切な長さに分割（最大4096文字）
  const maxLength = 4000;
  const truncatedScript = script.length > maxLength
    ? script.substring(0, maxLength)
    : script;

  console.log(`[OpenAI TTS] Generating with voice: ${voice}, speed: ${speed}, model: gpt-4o-mini-tts`);

  // まず新しいモデル（gpt-4o-mini-tts）を試す
  let response = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',  // 新しいモデル（日本語対応改善）
      input: truncatedScript,
      voice: voice,
      speed: speed,
      response_format: 'mp3',
      instructions: JAPANESE_INSTRUCTIONS,  // 日本語指示
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

  console.log(`[OpenAI TTS] Generated audio: audio/mpeg, ${Math.round(audioBuffer.byteLength / 1024)}KB`);

  return {
    audio: base64Audio,
    mimeType: 'audio/mpeg',
  };
}
