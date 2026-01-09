/**
 * 辞書処理モジュール（API側）
 *
 * TTS送信前に台本テキストを処理
 */

// 難読漢字・熟語
const DIFFICULT_KANJI: Record<string, string> = {
  '血税': 'けつぜい',
  '捏造': 'ねつぞう',
  '忖度': 'そんたく',
  '揶揄': 'やゆ',
  '糾弾': 'きゅうだん',
  '誹謗': 'ひぼう',
  '偏向': 'へんこう',
  '恣意的': 'しいてき',
  '齟齬': 'そご',
  '瑕疵': 'かし',
  '杜撰': 'ずさん',
  '頓挫': 'とんざ',
  '跋扈': 'ばっこ',
  '蔓延': 'まんえん',
  '隠蔽': 'いんぺい',
  '改竄': 'かいざん',
  '癒着': 'ゆちゃく',
  '斡旋': 'あっせん',
  '逼迫': 'ひっぱく',
  '払拭': 'ふっしょく',
  '毀損': 'きそん',
  '懐柔': 'かいじゅう',
  '煽動': 'せんどう',
  '扇動': 'せんどう',
  '詭弁': 'きべん',
  '欺瞞': 'ぎまん',
  '粉飾': 'ふんしょく',
};

// メディア・略語
const ABBREVIATIONS: Record<string, string> = {
  'NHK': 'エヌエイチケー',
  'TBS': 'ティービーエス',
  'BBC': 'ビービーシー',
  'CNN': 'シーエヌエヌ',
  'SNS': 'エスエヌエス',
  'AI': 'エーアイ',
  'IT': 'アイティー',
};

// 全辞書を統合
const DICTIONARY: Record<string, string> = {
  ...DIFFICULT_KANJI,
  ...ABBREVIATIONS,
};

/**
 * TTS送信前にテキストを処理
 * Geminiが変換し忘れた漢字をひらがなに変換
 */
export function processDictionary(text: string): string {
  let result = text;
  for (const [original, reading] of Object.entries(DICTIONARY)) {
    result = result.replace(new RegExp(original, 'g'), reading);
  }
  return result;
}

/**
 * ElevenLabs Audio Tags を処理
 * OpenAI TTS使用時はタグを除去
 */
export function stripAudioTags(text: string): string {
  // [excited], [whispers], [sighs], [laughs] などのタグを除去
  return text.replace(/\[(excited|whispers|sighs|laughs|\/excited|\/whispers|\/sighs|\/laughs)\]/g, '');
}

/**
 * TTS用にテキストを最適化
 */
export function optimizeForTTS(text: string, provider: 'openai' | 'elevenlabs' = 'openai'): string {
  let result = processDictionary(text);

  if (provider === 'openai') {
    // OpenAI TTSの場合はAudio Tagsを除去
    result = stripAudioTags(result);
  }

  // 共通の最適化
  // @マークを除去（SNSユーザー名対策）
  result = result.replace(/@/g, '');

  // 連続するスペースを1つに
  result = result.replace(/\s+/g, ' ');

  return result.trim();
}
