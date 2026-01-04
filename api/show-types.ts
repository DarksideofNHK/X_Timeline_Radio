/**
 * 番組タイプ定義 - アルファ版
 * 各番組の設定、プロンプト、TTS instructionを管理
 */

export interface ShowType {
  id: string;
  name: string;
  description: string;
  icon: string;
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  bgm: string;
  allowDownload: boolean; // 著作権リスクに基づく
  genres: Genre[];
  ttsInstructions: string;
  scriptPromptTemplate: string;
}

export interface Genre {
  id: string;
  name: string;
  icon: string;
  query: string;
  camp?: string; // 与党/野党/一般 など
}

// ========================================
// X政治家ウオッチ（公人 - ダウンロードOK）
// ========================================
export const POLITICIAN_WATCH: ShowType = {
  id: 'politician-watch',
  name: 'X政治家ウオッチ',
  description: '与野党政治家のX投稿をバトル実況風に紹介',
  icon: '🥊',
  voice: 'echo',
  bgm: 'Cybernetic_Dominion',
  allowDownload: true,
  genres: [
    { id: 'ruling-ldp', name: '自民党', icon: '🔴', query: '', camp: '与党' },
    { id: 'ruling-komeito', name: '公明党', icon: '🟡', query: '', camp: '与党' },
    { id: 'opposition-cdp', name: '立憲民主党', icon: '🔵', query: '', camp: '野党' },
    { id: 'opposition-ishin', name: '日本維新の会', icon: '🟢', query: '', camp: '野党' },
    { id: 'opposition-dpfp', name: '国民民主党', icon: '🟠', query: '', camp: '野党' },
    { id: 'opposition-others', name: 'その他野党', icon: '🟣', query: '', camp: '野党' },
    { id: 'public-reaction', name: '国民の声', icon: '👥', query: '', camp: '一般' },
  ],
  ttsInstructions: `あなたはスポーツ実況のような熱いラジオパーソナリティです。

話し方のポイント：
- エネルギッシュでテンション高め、でもうるさくならない
- 「おおっと！」「さあ！」「ここで！」など感嘆詞を自然に
- 政治家の名前ははっきり発音
- 重要なポイントで少し間を取る
- 盛り上がる場面で声に力を込める
- 全体的にスポーツニュースのキャスターのような明るさ

発音注意：
- 漢字の人名は正確に
- 英語はカタカナ読み
- 句読点で適切に区切る`,
  scriptPromptTemplate: 'politician-watch', // 別途定義
};

// ========================================
// ガバメントウオッチ（公的機関 - ダウンロードOK）
// ========================================
export const GOV_WATCH: ShowType = {
  id: 'gov-watch',
  name: 'ガバメントウオッチ',
  description: '政府機関・自治体の公式発信を解説付きで紹介',
  icon: '🏛️',
  voice: 'onyx',
  bgm: 'Digital_Newsfeed_Groove',
  allowDownload: true,
  genres: [
    { id: 'cabinet', name: '内閣・官邸', icon: '🏛️', query: '(首相官邸 OR 内閣官房 OR 内閣府)' },
    { id: 'ministries', name: '中央省庁', icon: '📋', query: '(厚労省 OR 経産省 OR 外務省 OR 財務省 OR 文科省 OR 国交省 OR 総務省 OR 防衛省 OR 環境省)' },
    { id: 'agencies', name: '独立機関', icon: '🔬', query: '(気象庁 OR 消費者庁 OR デジタル庁 OR こども家庭庁 OR 警察庁 OR 消防庁)' },
    { id: 'cities', name: '政令指定都市', icon: '🏙️', query: '(東京都 OR 大阪市 OR 横浜市 OR 名古屋市 OR 札幌市 OR 福岡市 OR 神戸市 OR 京都市 OR 川崎市 OR さいたま市)' },
  ],
  ttsInstructions: `あなたは落ち着いた声のニュースキャスターです。

話し方のポイント：
- 信頼感のある落ち着いたトーン
- 重要な情報は少しゆっくり、はっきりと
- 専門用語は分かりやすく
- 適度な間を取りながら

発音注意：
- 省庁名、機関名は正確に
- 数字は明瞭に
- 英語はカタカナ読み`,
  scriptPromptTemplate: 'gov-watch',
};

// ========================================
// オールドメディアをぶっ壊せラジオ（一般人含む - ダウンロード不可）
// ========================================
export const OLD_MEDIA_BUSTER: ShowType = {
  id: 'old-media-buster',
  name: 'オールドメディアをぶっ壊せラジオ',
  description: 'NHK・新聞・TV局への批判投稿を紹介',
  icon: '📺',
  voice: 'onyx',
  bgm: 'Victory_Lap',
  allowDownload: false, // 一般人の投稿含む
  genres: [
    { id: 'nhk', name: 'NHK批判', icon: '📺', query: '(NHK OR 日本放送協会) (偏向 OR 捏造 OR 問題 OR 批判 OR おかしい OR 受信料)' },
    { id: 'newspapers', name: '新聞批判', icon: '📰', query: '(朝日新聞 OR 毎日新聞 OR 読売新聞 OR 産経新聞 OR 東京新聞) (偏向 OR 捏造 OR 問題 OR 批判)' },
    { id: 'tv-stations', name: '民放批判', icon: '📡', query: '(フジテレビ OR 日テレ OR TBS OR テレ朝 OR テレビ東京) (偏向 OR やらせ OR 問題 OR 批判)' },
  ],
  ttsInstructions: `あなたは皮肉を込めたコメンテーターです。

話し方のポイント：
- 低めの落ち着いた声
- 皮肉や批評を込めたトーン
- 淡々と、しかし鋭く
- 「またですか」「驚きですね」のような皮肉

発音注意：
- メディア名ははっきりと
- 引用部分は区別して`,
  scriptPromptTemplate: 'old-media-buster',
};

// ========================================
// Xバズネタグランプリ（一般人 - ダウンロード不可）
// ========================================
export const BUZZ_RANKING: ShowType = {
  id: 'buzz-ranking',
  name: 'Xバズネタグランプリ',
  description: 'X上の笑える投稿をランキング形式で紹介',
  icon: '😂',
  voice: 'echo',
  bgm: '_Xylophones_Adventure',
  allowDownload: false, // 一般人の投稿
  genres: [
    { id: 'funny', name: '笑えるPost', icon: '😂', query: '面白い OR 笑った OR 草 OR www min_faves:1000' },
  ],
  ttsInstructions: `あなたは明るいバラエティ番組の司会者です。

話し方のポイント：
- 明るく楽しいトーン
- 笑いを誘うような間の取り方
- 「第○位は〜」とランキング形式
- オチで盛り上げる

発音注意：
- ネットスラングは自然に
- 「草」は「くさ」と読む`,
  scriptPromptTemplate: 'buzz-ranking',
};

// ========================================
// 事件速報ダイジェスト（一般人含む - ダウンロード不可）
// ========================================
export const INCIDENT_NEWS: ShowType = {
  id: 'incident-news',
  name: '事件速報ダイジェスト',
  description: '事件・事故の速報をXの投稿から紹介',
  icon: '🚨',
  voice: 'onyx',
  bgm: 'Decline_of_the_Old_Guard',
  allowDownload: false, // 一般人の目撃情報含む
  genres: [
    { id: 'crime-news', name: '事件ニュース', icon: '🚔', query: '(事件 OR 逮捕 OR 容疑者 OR 警察) (速報 OR 発生 OR 確認)' },
    { id: 'accident-news', name: '事故ニュース', icon: '🚑', query: '(事故 OR 火災 OR 救急 OR 通行止め) (速報 OR 発生 OR 現場)' },
    { id: 'other-news', name: 'その他速報', icon: '⚡', query: '(災害 OR 地震 OR 台風 OR 避難) 速報' },
  ],
  ttsInstructions: `あなたは冷静なニュースキャスターです。

話し方のポイント：
- 落ち着いた報道調
- 事実を淡々と伝える
- 緊急性のある情報は少し強調
- 感情を抑えめに

発音注意：
- 地名、人名は正確に
- 数字は明瞭に`,
  scriptPromptTemplate: 'incident-news',
};

// ========================================
// X Timeline Radio（既存 - ダウンロード不可）
// ========================================
export const X_TIMELINE_RADIO: ShowType = {
  id: 'x-timeline-radio',
  name: 'X Timeline Radio',
  description: 'Xのトレンドを5分でお届け',
  icon: '📻',
  voice: 'nova',
  bgm: 'Digital_Newsfeed_Groove',
  allowDownload: false,
  genres: [
    { id: 'trending', name: 'トレンド', icon: '🔥', query: 'トレンド OR 話題 min_faves:500' },
    { id: 'news', name: 'ニュース', icon: '📰', query: 'ニュース OR 速報 min_faves:500' },
    { id: 'entertainment', name: 'エンタメ', icon: '🎬', query: 'エンタメ OR 芸能 min_faves:500' },
  ],
  ttsInstructions: `あなたは明るいラジオDJです。

話し方のポイント：
- フレンドリーで親しみやすい
- テンポよく進行
- 話題の切り替えはスムーズに

発音注意：
- 英語はカタカナ読み
- ネット用語は自然に`,
  scriptPromptTemplate: 'x-timeline-radio',
};

// 全番組タイプのマップ
export const SHOW_TYPES: Record<string, ShowType> = {
  'politician-watch': POLITICIAN_WATCH,
  'gov-watch': GOV_WATCH,
  'old-media-buster': OLD_MEDIA_BUSTER,
  'buzz-ranking': BUZZ_RANKING,
  'incident-news': INCIDENT_NEWS,
  'x-timeline-radio': X_TIMELINE_RADIO,
};

// ダウンロード可能な番組のみ
export const DOWNLOADABLE_SHOWS = Object.values(SHOW_TYPES).filter(s => s.allowDownload);

// 全番組リスト（UI表示用）
export const ALL_SHOWS = Object.values(SHOW_TYPES);
