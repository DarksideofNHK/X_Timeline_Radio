const GEMINI_TTS_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent';

export async function generateAudio(
  script: string,
  apiKey: string,
  voiceId: string = 'Aoede'
): Promise<{ audio: string; mimeType: string }> {
  // スクリプトを適切な長さに分割（長すぎるとエラーになる）
  const maxLength = 4000;
  const truncatedScript = script.length > maxLength
    ? script.substring(0, maxLength)
    : script;

  console.log(`[TTS] Generating with voice: ${voiceId}`);

  const response = await fetch(`${GEMINI_TTS_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: truncatedScript }],
        },
      ],
      generationConfig: {
        response_modalities: ['AUDIO'],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: {
              voice_name: voiceId,
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini TTS API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();

  // 音声データを抽出
  const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;

  if (!audioData) {
    throw new Error('No audio data in response');
  }

  console.log(`[TTS] Generated audio: ${audioData.mimeType}, ${Math.round(audioData.data.length / 1024)}KB`);

  // PCMをWAVに変換（必要な場合）
  let audio = audioData.data;
  let mimeType = audioData.mimeType;

  if (mimeType === 'audio/L16' || mimeType.includes('L16')) {
    audio = convertPcmToWav(audioData.data);
    mimeType = 'audio/wav';
  }

  return { audio, mimeType };
}

function convertPcmToWav(base64Pcm: string): string {
  // Base64デコード
  const pcmData = Buffer.from(base64Pcm, 'base64');

  // WAVヘッダーを作成
  const sampleRate = 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);

  // fmt chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // chunk size
  header.writeUInt16LE(1, 20); // PCM format
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  // ヘッダーとPCMデータを結合
  const wavData = Buffer.concat([header, pcmData]);

  return wavData.toString('base64');
}
