/**
 * カスタム辞書 - TTS読み上げ改善用
 *
 * 難読漢字、固有名詞、専門用語などの読み方を定義
 * Geminiプロンプトに注入して、台本生成時にひらがな変換を指示
 */

// 難読漢字・熟語
export const DIFFICULT_KANJI: Record<string, string> = {
  // 政治・メディア批判用語
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
  '汚職': 'おしょく',
  '癒着': 'ゆちゃく',
  '利権': 'りけん',
  '斡旋': 'あっせん',
  '逼迫': 'ひっぱく',
  '凋落': 'ちょうらく',
  '払拭': 'ふっしょく',
  '毀損': 'きそん',
  '懐柔': 'かいじゅう',
  '煽動': 'せんどう',
  '扇動': 'せんどう',
  '論駁': 'ろんばく',
  '詭弁': 'きべん',
  '矛盾': 'むじゅん',
  '欺瞞': 'ぎまん',
  '虚偽': 'きょぎ',
  '粉飾': 'ふんしょく',
};

// 政治家名（現役・著名）
export const POLITICIAN_NAMES: Record<string, string> = {
  // 自民党
  '石破茂': 'いしばしげる',
  '岸田文雄': 'きしだふみお',
  '菅義偉': 'すがよしひで',
  '安倍晋三': 'あべしんぞう',
  '麻生太郎': 'あそうたろう',
  '河野太郎': 'こうのたろう',
  '高市早苗': 'たかいちさなえ',
  '小泉進次郎': 'こいずみしんじろう',
  '茂木敏充': 'もてぎとしみつ',
  '林芳正': 'はやしよしまさ',
  '上川陽子': 'かみかわようこ',
  '加藤勝信': 'かとうかつのぶ',
  '西村康稔': 'にしむらやすとし',
  '萩生田光一': 'はぎうだこういち',
  '世耕弘成': 'せこうひろしげ',
  '松野博一': 'まつのひろかず',
  '鈴木俊一': 'すずきしゅんいち',

  // 立憲民主党
  '野田佳彦': 'のだよしひこ',
  '枝野幸男': 'えだのゆきお',
  '蓮舫': 'れんほう',
  '辻元清美': 'つじもときよみ',
  '泉健太': 'いずみけんた',
  '長妻昭': 'ながつまあきら',

  // 日本維新の会
  '馬場伸幸': 'ばばのぶゆき',
  '吉村洋文': 'よしむらひろふみ',
  '松井一郎': 'まついいちろう',
  '橋下徹': 'はしもととおる',
  '足立康史': 'あだちやすし',

  // 国民民主党
  '玉木雄一郎': 'たまきゆういちろう',
  '前原誠司': 'まえはらせいじ',

  // 公明党
  '山口那津男': 'やまぐちなつお',
  '石井啓一': 'いしいけいいち',

  // 共産党
  '志位和夫': 'しいかずお',
  '田村智子': 'たむらともこ',

  // れいわ新選組
  '山本太郎': 'やまもとたろう',
  '大石晃子': 'おおいしあきこ',

  // 参政党
  '神谷宗幣': 'かみやそうへい',

  // 社民党
  '福島瑞穂': 'ふくしまみずほ',
};

// メディア・組織名
export const MEDIA_NAMES: Record<string, string> = {
  'NHK': 'エヌエイチケー',
  'TBS': 'ティービーエス',
  'BBC': 'ビービーシー',
  'CNN': 'シーエヌエヌ',
  'ABC': 'エービーシー',
  'CBS': 'シービーエス',
  'AFP': 'エーエフピー',
  'AP': 'エーピー',
  'WHO': 'ダブリューエイチオー',
  'GDP': 'ジーディーピー',
  'SNS': 'エスエヌエス',
  'AI': 'エーアイ',
  'IT': 'アイティー',
  'CEO': 'シーイーオー',
  'CTO': 'シーティーオー',
  'CFO': 'シーエフオー',
};

// 地名（難読）
export const PLACE_NAMES: Record<string, string> = {
  '能登': 'のと',
  '珠洲': 'すず',
  '輪島': 'わじま',
  '羽咋': 'はくい',
  '七尾': 'ななお',
  '穴水': 'あなみず',
  '志賀': 'しか',
  '内灘': 'うちなだ',
  '津幡': 'つばた',
  '加賀': 'かが',
  '小松': 'こまつ',
  '白山': 'はくさん',
  '金沢': 'かなざわ',
};

// 災害・専門用語
export const DISASTER_TERMS: Record<string, string> = {
  '震度': 'しんど',
  '津波': 'つなみ',
  '余震': 'よしん',
  '本震': 'ほんしん',
  '液状化': 'えきじょうか',
  '避難所': 'ひなんじょ',
  '罹災': 'りさい',
  '被災': 'ひさい',
  '倒壊': 'とうかい',
  '全壊': 'ぜんかい',
  '半壊': 'はんかい',
  '一部損壊': 'いちぶそんかい',
  '断水': 'だんすい',
  '停電': 'ていでん',
  '復旧': 'ふっきゅう',
  '復興': 'ふっこう',
  '義援金': 'ぎえんきん',
  '支援物資': 'しえんぶっし',
};

// 全辞書を統合
export const CUSTOM_DICTIONARY: Record<string, string> = {
  ...DIFFICULT_KANJI,
  ...POLITICIAN_NAMES,
  ...MEDIA_NAMES,
  ...PLACE_NAMES,
  ...DISASTER_TERMS,
};

/**
 * テキストに辞書を適用（台本後処理用）
 * Geminiが変換し忘れた場合のフォールバック
 */
export function applyDictionary(text: string): string {
  let result = text;
  for (const [kanji, reading] of Object.entries(CUSTOM_DICTIONARY)) {
    result = result.replace(new RegExp(kanji, 'g'), reading);
  }
  return result;
}

/**
 * Geminiプロンプト用の辞書文字列を生成
 */
export function generateDictionaryPrompt(): string {
  const entries = Object.entries(CUSTOM_DICTIONARY)
    .map(([kanji, reading]) => `  - 「${kanji}」→「${reading}」`)
    .join('\n');

  return `【カスタム辞書：以下の漢字・用語はひらがなに変換して出力】\n${entries}`;
}

/**
 * 特定カテゴリの辞書のみを取得
 */
export function getDictionaryByCategory(category: 'kanji' | 'politician' | 'media' | 'place' | 'disaster'): Record<string, string> {
  switch (category) {
    case 'kanji':
      return DIFFICULT_KANJI;
    case 'politician':
      return POLITICIAN_NAMES;
    case 'media':
      return MEDIA_NAMES;
    case 'place':
      return PLACE_NAMES;
    case 'disaster':
      return DISASTER_TERMS;
    default:
      return {};
  }
}
