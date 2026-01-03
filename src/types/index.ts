// バズPost
export interface BuzzPost {
  id: string;
  author: {
    id: string;
    name: string;
    username: string;
  };
  text: string;
  url: string;
  metrics: {
    likes: number;
    retweets: number;
    replies: number;
  };
  buzzReason?: string;
  genre: Genre;
  createdAt: string;
}

// ジャンル
export type Genre =
  | 'trending'      // 今バズってる
  | 'politics'      // 政治
  | 'economy'       // 経済
  | 'lifestyle'     // 暮らし
  | 'entertainment' // エンタメ
  | 'science'       // 科学・テック
  | 'international'; // 国際

export interface GenreConfig {
  id: Genre;
  name: string;
  icon: string;
  query: string;
}

// セグメント
export interface Segment {
  id: string;
  genre: Genre;
  name: string;
  icon: string;
  posts: BuzzPost[];
  status: SegmentStatus;
  audio?: ArrayBuffer;
  script?: string;
  startIndex: number;
  endIndex: number;
}

export type SegmentStatus =
  | 'pending'     // 待機中
  | 'collecting'  // Post収集中
  | 'scripting'   // スクリプト生成中
  | 'generating'  // 音声生成中
  | 'ready'       // 再生準備完了
  | 'playing'     // 再生中
  | 'done'        // 完了
  | 'error';      // エラー

// 番組
export interface ShowProgram {
  id: string;
  generatedAt: string;
  totalPosts: number;
  segments: Segment[];
  status: 'initializing' | 'ready' | 'playing' | 'paused' | 'ended';
}

// 再生状態
export interface PlaybackState {
  currentSegmentIndex: number;
  currentPostIndex: number;
  isPlaying: boolean;
  elapsedTime: number;
}

// API設定
export interface ApiConfig {
  grokApiKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
}

// TTSプロバイダー
export type TtsProvider = 'gemini' | 'openai';

// OpenAI TTS 音声オプション
export type OpenAIVoiceId = 'alloy' | 'ash' | 'coral' | 'echo' | 'fable' | 'onyx' | 'nova' | 'sage' | 'shimmer';

export interface OpenAIVoiceOption {
  id: OpenAIVoiceId;
  name: string;
  description: string;
}

export const OPENAI_VOICE_OPTIONS: OpenAIVoiceOption[] = [
  { id: 'nova', name: 'Nova', description: '女性・明るい（おすすめ）' },
  { id: 'alloy', name: 'Alloy', description: '中性・バランス良い' },
  { id: 'echo', name: 'Echo', description: '男性・低め' },
  { id: 'fable', name: 'Fable', description: '男性・イギリス風' },
  { id: 'onyx', name: 'Onyx', description: '男性・深い' },
  { id: 'shimmer', name: 'Shimmer', description: '女性・柔らかい' },
  { id: 'ash', name: 'Ash', description: '中性・落ち着いた' },
  { id: 'sage', name: 'Sage', description: '女性・温かい' },
  { id: 'coral', name: 'Coral', description: '女性・はっきり' },
];

// BGM設定（将来実装予定）
// API応答のタイムラグ中にAI生成BGMを薄く流すなどの機能を想定
export interface BgmConfig {
  enabled: boolean;
  volume: number; // 0-1
  source: 'none' | 'ai-generated' | 'custom-url';
  customUrl?: string;
}

// Gemini TTS 音声オプション
export type VoiceId =
  | 'Zephyr'   // 明るい
  | 'Puck'     // 明るい
  | 'Charon'   // 情報提供的
  | 'Kore'     // しっかりした
  | 'Fenrir'   // 興奮気味
  | 'Leda'     // 若々しい
  | 'Orus'     // しっかりした
  | 'Aoede'    // 明るい（デフォルト）
  | 'Callirrhoe' // 落ち着いた
  | 'Autonoe'  // 明るい
  | 'Enceladus' // 息づかい多め
  | 'Iapetus'  // 明確
  | 'Umbriel'  // 落ち着いた
  | 'Algieba'  // 落ち着いた
  | 'Despina'  // 滑らか
  | 'Erinome'  // 明確
  | 'Algenib'  // 砂利声
  | 'Rasalgethi' // 情報提供的
  | 'Laomedeia' // 明るい
  | 'Achernar' // ソフト
  | 'Alnilam'  // しっかりした
  | 'Schedar'  // 均整
  | 'Gacrux'   // 成熟
  | 'Pulcherrima' // 前向き
  | 'Achird'   // フレンドリー
  | 'Zubenelgenubi' // カジュアル
  | 'Vindemiatrix' // 穏やか
  | 'Sadachbia' // 活発
  | 'Sadaltager' // 知識豊富
  | 'Sulafat'; // 温かい

// 音声設定オプション
export interface VoiceOption {
  id: VoiceId;
  name: string;
  description: string;
}

export const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'Aoede', name: 'Aoede', description: '明るい（デフォルト）' },
  { id: 'Zephyr', name: 'Zephyr', description: '明るい' },
  { id: 'Puck', name: 'Puck', description: '明るい' },
  { id: 'Fenrir', name: 'Fenrir', description: '興奮気味' },
  { id: 'Kore', name: 'Kore', description: 'しっかりした' },
  { id: 'Charon', name: 'Charon', description: '情報提供的' },
  { id: 'Callirrhoe', name: 'Callirrhoe', description: '落ち着いた' },
  { id: 'Umbriel', name: 'Umbriel', description: '落ち着いた' },
  { id: 'Leda', name: 'Leda', description: '若々しい' },
  { id: 'Orus', name: 'Orus', description: 'しっかりした' },
  { id: 'Achird', name: 'Achird', description: 'フレンドリー' },
  { id: 'Sulafat', name: 'Sulafat', description: '温かい' },
];

// 再生速度オプション
export const SPEED_OPTIONS = [
  { value: 0.75, label: '0.75x（ゆっくり）' },
  { value: 1.0, label: '1.0x（標準）' },
  { value: 1.25, label: '1.25x（やや速い）' },
  { value: 1.5, label: '1.5x（速い）' },
  { value: 1.75, label: '1.75x（かなり速い）' },
  { value: 2.0, label: '2.0x（最速）' },
];

// オーディオ設定
export interface AudioConfig {
  voiceId: VoiceId; // TTS音声ID
  speed: number; // 再生速度 (0.75-2.0)
  bgm: BgmConfig;
}

// アプリ状態
export interface AppState {
  // 番組
  program: ShowProgram | null;
  playback: PlaybackState;

  // 設定
  apiConfig: ApiConfig;

  // エラー
  error: string | null;

  // アクション
  initializeProgram: () => Promise<void>;
  startPlayback: () => void;
  pausePlayback: () => void;
  skipToNext: () => void;
  setApiConfig: (config: Partial<ApiConfig>) => void;
  setError: (error: string | null) => void;
}

// ========================================
// AIスクリプトモード関連の型
// ========================================

// 番組モード
export type ProgramMode = 'simple' | 'ai-script';

// テーマ
export type Theme = 'light' | 'dark';

// スクリプトセクションタイプ
export type ScriptSectionType = 'opening' | 'corner' | 'transition' | 'closing';

// AIスクリプトセクション
export interface ScriptSection {
  id: string;
  type: ScriptSectionType;
  genre?: Genre;                    // cornerタイプの場合のジャンル
  title: string;                    // セクション/コーナー名
  chunks: string[];                 // TTS用に分割されたテキスト（各2000文字以内）
  estimatedDuration: number;        // 推定再生時間（秒）
}

// AIスクリプト番組
export interface AIScriptProgram {
  id: string;
  sections: ScriptSection[];
  totalDuration: number;            // 総再生時間（分）
  generatedAt: string;
  status: 'generating' | 'ready' | 'playing' | 'paused' | 'ended';
}

// 番組スタイル
export type ProgramStyle = 'comprehensive' | 'talkshow' | 'news';

// ========================================
// API レスポンス
// ========================================

// API レスポンス
export interface CollectBuzzPostsResponse {
  posts: BuzzPost[];
  genre: Genre;
}

export interface GenerateScriptResponse {
  script: string;
  segmentId: string;
}

export interface GenerateAudioResponse {
  audio: string; // base64
  segmentId: string;
}
