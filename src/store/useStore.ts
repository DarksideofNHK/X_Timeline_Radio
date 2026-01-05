import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ShowProgram, Segment, BuzzPost, ApiConfig, Genre, OpenAIVoiceId, ProgramMode, AIScriptProgram, ScriptSection, Theme, RelatedPost, ShowTypeId } from '../types';
import { GENRES, PROGRAM_SEGMENTS, POSTS_PER_SEGMENT } from '../lib/genres';
import { bgmManager, type BgmSource } from '../lib/bgm';
import { audioCache } from '../lib/audioCache';
import { getSavedScripts, saveScript, deleteScript, type SavedScript } from '../lib/scriptStorage';
import { getApiKeys, saveApiKeys } from '../lib/apiKeyStorage';
import { mediaSessionManager } from '../lib/mediaSession';

// 音声設定（OpenAI TTSのみ使用）
interface AudioSettings {
  openaiVoiceId: OpenAIVoiceId;
  speed: number; // 0.75 - 2.0
  programMode: ProgramMode; // 'simple' | 'ai-script'
  theme: Theme; // 'light' | 'dark'
  showType: ShowTypeId; // AI番組モード用の番組タイプ
  bgmVolume: number; // BGM音量 0-100（パーセント）
}

// キャッシュ設定（showType別にキャッシュ）
const CACHE_KEY_PREFIX = 'x-timeline-radio-posts-cache';
const CACHE_DURATION = 30 * 60 * 1000; // 30分

interface PostsCache {
  posts: Record<Genre, BuzzPost[]>;
  annotations?: RelatedPost[];  // Grokが参照した関連投稿URL
  timestamp: number;
  showType?: string;  // キャッシュがどのshowType用か
}

function getCacheKey(showType: string): string {
  return `${CACHE_KEY_PREFIX}-${showType}`;
}

function loadPostsCache(showType: string): PostsCache | null {
  try {
    const cacheKey = getCacheKey(showType);
    const cached = localStorage.getItem(cacheKey);
    if (!cached) return null;

    const data: PostsCache = JSON.parse(cached);
    const now = Date.now();

    // 有効期限チェック
    if (now - data.timestamp > CACHE_DURATION) {
      console.log(`[Cache] Expired for ${showType}, clearing...`);
      localStorage.removeItem(cacheKey);
      return null;
    }

    console.log(`[Cache] Loaded posts from cache for ${showType}`);
    return data;
  } catch (e) {
    console.error('[Cache] Failed to load:', e);
    return null;
  }
}

function savePostsCache(posts: Record<Genre, BuzzPost[]>, annotations?: RelatedPost[], showType: string = 'x-timeline-radio'): void {
  try {
    const cacheKey = getCacheKey(showType);
    const data: PostsCache = {
      posts,
      annotations,
      timestamp: Date.now(),
      showType,
    };
    localStorage.setItem(cacheKey, JSON.stringify(data));
    console.log(`[Cache] Saved posts for ${showType} (${annotations?.length || 0} annotations)`);
  } catch (e) {
    console.error('[Cache] Failed to save:', e);
  }
}

function clearPostsCache(showType?: string): void {
  if (showType) {
    localStorage.removeItem(getCacheKey(showType));
    console.log(`[Cache] Cleared for ${showType}`);
  } else {
    // 全showTypeのキャッシュをクリア
    ['x-timeline-radio', 'politician-watch', 'old-media-buster'].forEach(st => {
      localStorage.removeItem(getCacheKey(st));
    });
    console.log('[Cache] Cleared all');
  }
}

// URLを除去
function removeUrls(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]+/g, '')  // URLs
    .replace(/\s+/g, ' ')               // 連続スペースを1つに
    .trim();
}

// TTSに渡す前にテキストを整形（自然な読み上げのための最適化）
function cleanTextForTTS(text: string): string {
  return text
    // 敬称前のスペース除去
    .replace(/\s+さん/g, 'さん')
    .replace(/\s+さま/g, 'さま')
    .replace(/\s+氏/g, '氏')

    // 三点リーダーの正規化（ポーズとして機能させる）
    .replace(/\.{3,}/g, '…')
    .replace(/。{2,}/g, '。')
    .replace(/、{2,}/g, '、、')  // 「、、」は長めのポーズとして残す

    // 連続する感嘆符・疑問符の簡略化
    .replace(/！{2,}/g, '！')
    .replace(/？{2,}/g, '？')
    .replace(/!{2,}/g, '！')
    .replace(/\?{2,}/g, '？')

    // 波線の正規化
    .replace(/[〜～]{2,}/g, '〜')

    // 句読点前の半角スペース除去
    .replace(/\s+([。、！？])/g, '$1')
    // 句読点後の半角スペースを除去（全角スペースは保持=話題転換の間）
    .replace(/([。、！？]) +/g, '$1')

    // 連続する半角スペースを1つに（全角スペースは話題転換用に保持）
    .replace(/ {2,}/g, ' ')
    .trim();
}

// 投稿からスクリプトを生成
function generatePostScript(post: BuzzPost, index: number, total: number): string {
  const cleanText = removeUrls(post.text);

  // いいね・リツイートは0件の場合は読まない
  const metricsParts: string[] = [];
  if (post.metrics.likes > 0) {
    metricsParts.push(`いいね${post.metrics.likes.toLocaleString()}件`);
  }
  if (post.metrics.retweets > 0) {
    metricsParts.push(`リツイート${post.metrics.retweets.toLocaleString()}件`);
  }
  const metricsText = metricsParts.length > 0
    ? `${metricsParts.join('、')}を獲得しています。`
    : '';

  const buzzReasonText = post.buzzReason
    ? `バズの理由は「${post.buzzReason}」とのこと。`
    : '';

  return `${index}番目の投稿です。${post.author.name}さんからの投稿。「${cleanText}」${metricsText}${buzzReasonText}`;
}

// リトライ設定
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 2000; // 2秒
const REQUEST_INTERVAL = 100; // リクエスト間隔（ms）- プリフェッチ効率化のため短縮

let lastRequestTime = 0;

// リクエスト間隔を確保
async function throttleRequest(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, REQUEST_INTERVAL - elapsed));
  }
  lastRequestTime = Date.now();
}

// TTS設定を受け取るインターフェース（OpenAIのみ）
interface TtsConfig {
  openaiApiKey: string;
  openaiVoiceId: OpenAIVoiceId;
  showType?: string; // 番組タイプ（TTS Instruction切り替え用）
}

// 音声を生成（再生せずにURLを返す）- キャッシュ対応・リトライ対応（OpenAIのみ）
async function generateAudioUrl(
  script: string,
  ttsConfig: TtsConfig
): Promise<string> {
  const { openaiApiKey, openaiVoiceId, showType = 'x-timeline-radio' } = ttsConfig;

  // TTSに渡す前にテキストを整形（不要なスペースを除去）
  const cleanedScript = cleanTextForTTS(script);

  const cacheKey = `openai:${openaiVoiceId}`;

  // キャッシュをチェック（整形後のテキストでチェック）
  const cached = await audioCache.get(cleanedScript, cacheKey);
  if (cached) {
    return cached;
  }

  console.log(`[TTS:OpenAI] Generating audio (voice: ${openaiVoiceId}): "${cleanedScript.substring(0, 30)}..."`);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // リクエスト間隔を確保
      await throttleRequest();

      const response = await fetch('/api/generate-audio-openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script: cleanedScript, apiKey: openaiApiKey, voice: openaiVoiceId, showType }),
      });

      if (response.ok) {
        const { audio, mimeType } = await response.json();
        const audioBlob = new Blob(
          [Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))],
          { type: mimeType }
        );

        // キャッシュに保存（整形後のテキストで保存）
        return audioCache.set(cleanedScript, cacheKey, audioBlob);
      }

      // エラーレスポンスの処理
      const errorText = await response.text();

      if (response.status === 429) {
        // レート制限 - リトライ
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        console.warn(`[TTS:OpenAI] Rate limited (429), retrying in ${delay}ms... (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        lastError = new Error('OpenAI APIレート制限に達しました。しばらくお待ちください。');
        continue;
      }

      if (response.status >= 500) {
        // サーバーエラー - リトライ
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        console.warn(`[TTS:OpenAI] Server error (${response.status}), retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        lastError = new Error('サーバーエラーが発生しました。');
        continue;
      }

      // その他のエラーはリトライしない
      throw new Error(`音声生成に失敗しました (${response.status}): ${errorText.substring(0, 100)}`);
    } catch (error: any) {
      if (error.message?.includes('fetch')) {
        // ネットワークエラー - リトライ
        const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
        console.warn(`[TTS:OpenAI] Network error, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  // 全リトライ失敗
  throw lastError || new Error('音声生成に失敗しました');
}

// 音声URLを再生（完了を待つ）- BGMダッキング対応・再生速度対応
// 現在再生中の音声要素（即座に停止するために保持）
let currentAudioElement: HTMLAudioElement | null = null;
// TTS用の再利用可能な音声要素（バックグラウンド再生対応）
let reusableTtsAudio: HTMLAudioElement | null = null;
// ユーザーによる停止かどうかを追跡
let isStoppingByUser = false;
// オーディオ権限が有効化されたか
let audioUnlocked = false;

// TTS用のHTMLAudioElementを取得または作成
function getTtsAudioElement(): HTMLAudioElement {
  if (!reusableTtsAudio) {
    reusableTtsAudio = new Audio();
    reusableTtsAudio.preload = 'auto';
    console.log('[Audio] Created reusable TTS audio element');
  }
  return reusableTtsAudio;
}

// 初期化
if (typeof window !== 'undefined') {
  // TTS用のAudio要素を事前に作成
  getTtsAudioElement();
}

// モバイルブラウザ用: ユーザータップ時にオーディオ権限を取得
// HTMLAudioElementを無音再生してアンロック
// 重要: この関数はユーザージェスチャ（タップ/クリック）のコンテキスト内で呼び出す必要がある
export function unlockAudio(): Promise<void> {
  return new Promise((resolve) => {
    if (audioUnlocked) {
      console.log('[Audio] Already unlocked');
      resolve();
      return;
    }

    console.log('[Audio] Attempting to unlock audio...');

    try {
      const ttsAudio = getTtsAudioElement();

      // 無音のデータURIを設定して再生（最小限の無音MP3）
      // これによりHTMLAudioElementがアンロックされる
      const silentDataUri = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYNAAAAAAAAAAAAAAAAAAAA';

      ttsAudio.src = silentDataUri;
      ttsAudio.volume = 0.01;

      const playPromise = ttsAudio.play();
      if (playPromise) {
        playPromise
          .then(() => {
            audioUnlocked = true;
            console.log('[Audio] Audio unlocked successfully');
            // すぐに停止して次の再生に備える
            ttsAudio.pause();
            ttsAudio.currentTime = 0;
            ttsAudio.volume = 1;
            resolve();
          })
          .catch((e) => {
            console.error('[Audio] Failed to unlock audio:', e);
            resolve();
          });
      } else {
        audioUnlocked = true;
        resolve();
      }
    } catch (e) {
      console.error('[Audio] Error in unlock:', e);
      resolve();
    }
  });
}

// 音声を即座に停止する関数
function stopCurrentAudio() {
  isStoppingByUser = true;  // ユーザー停止フラグを立てる

  // TTS用のAudio要素を停止
  if (reusableTtsAudio) {
    try {
      reusableTtsAudio.pause();
      reusableTtsAudio.currentTime = 0;
    } catch (e) {
      console.error('[Audio] Error stopping TTS audio:', e);
    }
  }

  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.src = '';
    } catch (e) {
      console.error('[Audio] Error stopping current audio:', e);
    }
    currentAudioElement = null;
  }

  console.log('[Audio] All audio stopped');
}

// HTMLAudioElementを使った再生（バックグラウンド対応・Bluetooth切断対応）
async function playAudioUrl(audioUrl: string, speed: number = 1.0): Promise<void> {
  // ユーザー停止フラグをリセット
  isStoppingByUser = false;

  // TTS再生前にBGMをダッキング
  if (bgmManager.getIsPlaying()) {
    await bgmManager.duck();
  }

  return new Promise((resolve, reject) => {
    try {
      const audio = getTtsAudioElement();

      console.log('[Audio] Playing via HTMLAudioElement (background compatible)...');

      // 前の再生をクリーンアップ
      audio.pause();
      audio.currentTime = 0;

      // クリーンアップ用の関数
      const cleanup = () => {
        audio.removeEventListener('ended', onEnded);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('pause', onPause);
        if (timeoutId) clearTimeout(timeoutId);
      };

      // イベントハンドラーを設定
      const onEnded = async () => {
        cleanup();

        if (audioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(audioUrl);
        }

        // ユーザー停止でなければBGMを戻す
        if (!isStoppingByUser && bgmManager.getIsPlaying()) {
          await bgmManager.unduck();
        }
        resolve();
      };

      const onError = (e: Event) => {
        cleanup();

        console.error('[Audio] Playback error:', e);

        if (audioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(audioUrl);
        }

        if (isStoppingByUser) {
          isStoppingByUser = false;
          resolve();
        } else {
          reject(new Error('Audio playback failed'));
        }
      };

      // Bluetooth切断などでpauseされた場合の自動再開
      const onPause = () => {
        if (isStoppingByUser) {
          console.log('[Audio] Paused by user stop request');
          return;
        }

        // 再生が終了していない場合（Bluetooth切断など）
        if (audio.currentTime < audio.duration - 0.1) {
          console.log('[Audio] Paused unexpectedly (possibly Bluetooth disconnection), attempting to resume...');

          // 少し待ってから再生を試みる
          setTimeout(() => {
            if (!isStoppingByUser && audio.paused && audio.currentTime < audio.duration - 0.1) {
              console.log('[Audio] Attempting to resume playback...');
              audio.play().catch((e) => {
                console.error('[Audio] Resume failed:', e);
                // 再開に失敗した場合は次のチャンクに進む
                cleanup();
                if (audioUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(audioUrl);
                }
                resolve();
              });
            }
          }, 500);
        }
      };

      // タイムアウト設定（音声の長さ + 余裕を持たせる）
      // 音声の長さが不明な場合は60秒をデフォルトに
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      const setPlaybackTimeout = () => {
        const duration = audio.duration || 60;
        const timeoutMs = (duration / speed + 10) * 1000; // 再生時間 + 10秒の余裕
        timeoutId = setTimeout(() => {
          if (!audio.paused && audio.currentTime < audio.duration - 0.5) {
            console.log('[Audio] Playback timeout, moving to next chunk');
            cleanup();
            if (audioUrl.startsWith('blob:')) {
              URL.revokeObjectURL(audioUrl);
            }
            resolve();
          }
        }, timeoutMs);
      };

      audio.addEventListener('ended', onEnded);
      audio.addEventListener('error', onError);
      audio.addEventListener('pause', onPause);
      audio.addEventListener('loadedmetadata', setPlaybackTimeout, { once: true });

      // 新しい音声を設定
      audio.src = audioUrl;
      audio.playbackRate = speed;
      audio.volume = 1;  // 音量を最大に設定（unlockで0.01になっている可能性があるため）

      // 再生開始
      const playPromise = audio.play();
      if (playPromise) {
        playPromise
          .then(() => {
            console.log('[Audio] HTMLAudioElement playback started');
          })
          .catch((e) => {
            cleanup();

            console.error('[Audio] Play failed:', e);

            if (audioUrl.startsWith('blob:')) {
              URL.revokeObjectURL(audioUrl);
            }

            if (isStoppingByUser) {
              isStoppingByUser = false;
              resolve();
            } else {
              reject(e);
            }
          });
      }

    } catch (e) {
      console.error('[Audio] Playback setup failed:', e);
      if (audioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(audioUrl);
      }

      if (isStoppingByUser) {
        isStoppingByUser = false;
        resolve();
      } else {
        reject(e);
      }
    }
  });
}

// 音声チャンクを再生（Promiseで完了を待つ）- 後方互換性
async function playAudioChunk(script: string, ttsConfig: TtsConfig, speed: number = 1.0): Promise<void> {
  const audioUrl = await generateAudioUrl(script, ttsConfig);
  return playAudioUrl(audioUrl, speed);
}

interface AppState {
  // 番組（シンプルモード）
  program: ShowProgram | null;
  currentSegmentIndex: number;
  currentPostIndex: number;

  // AIスクリプトモード
  aiProgram: AIScriptProgram | null;
  currentSectionIndex: number;
  currentChunkIndex: number;
  isGeneratingScript: boolean;
  collectedPosts: Record<Genre, BuzzPost[]> | null;  // 収集した投稿（両モードで共有）
  collectedAnnotations: RelatedPost[] | null;  // Grokが参照した関連投稿URL

  // 再生状態
  isPlaying: boolean;
  isPreloading: boolean;  // 音声プリロード中
  isInitializing: boolean;
  currentAudio: HTMLAudioElement | null;
  stopRequested: boolean;

  // 設定
  apiConfig: ApiConfig;
  audioSettings: AudioSettings;

  // エラー
  error: string | null;

  // アクション（共通）
  setApiConfig: (config: Partial<ApiConfig>) => void;
  setAudioSettings: (settings: Partial<AudioSettings>) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  clearCache: () => void;
  refreshProgram: () => Promise<void>;  // キャッシュクリア後に番組を再生成

  // アクション（シンプルモード）
  initializeProgram: () => Promise<void>;
  startPlayback: () => void;
  pausePlayback: () => void;
  playSegment: (segmentIndex: number, startPostIndex?: number) => Promise<void>;
  playSegmentWithPrefetch: (segmentIndex: number, prefetchedData: { introUrl: string; firstPostUrl: string | null }) => Promise<void>;
  playFromPosition: (segmentIndex: number, postIndex: number) => void;
  stopPlayback: () => void;
  nextSegment: () => void;

  // アクション（AIスクリプトモード）
  initializeAIProgram: () => Promise<void>;
  playAIScript: () => Promise<void>;
  playAISectionFromPosition: (sectionIndex: number, chunkIndex: number) => void;

  // 保存済みスクリプト
  savedScripts: SavedScript[];
  loadSavedScripts: () => void;
  saveCurrentScript: (title?: string) => void;
  loadScript: (id: string) => void;
  deleteSavedScript: (id: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 初期状態（シンプルモード）
      program: null,
      currentSegmentIndex: 0,
      currentPostIndex: 0,

      // AIスクリプトモード
      aiProgram: null,
      currentSectionIndex: 0,
      currentChunkIndex: 0,
      isGeneratingScript: false,
      collectedPosts: null,
      collectedAnnotations: null,

      // 保存済みスクリプト
      savedScripts: getSavedScripts(),

      // 再生状態
      isPlaying: false,
      isPreloading: false,
      isInitializing: false,
      currentAudio: null,
      stopRequested: false,
      // APIキーは専用ストレージから読み込み（キャッシュクリアで消えない）
      apiConfig: getApiKeys(),
      audioSettings: {
        openaiVoiceId: 'nova',
        speed: 1.0,
        programMode: 'simple',  // デフォルトはシンプルモード
        theme: 'light',  // デフォルトはライトテーマ
        showType: 'x-timeline-radio',  // デフォルトはX Timeline Radio
        bgmVolume: 5,  // デフォルトはかなり小さめ（5%）
      },
      error: null,

      // 設定更新
      setApiConfig: (config) => {
        // 専用ストレージにも保存
        saveApiKeys(config);
        set((state) => ({
          apiConfig: { ...state.apiConfig, ...config },
        }));
      },

      // 音声設定更新
      setAudioSettings: (settings) => {
        // テーマが変更された場合、DOMに反映
        if (settings.theme) {
          document.documentElement.setAttribute('data-theme', settings.theme);
        }
        set((state) => ({
          audioSettings: { ...state.audioSettings, ...settings },
        }));
      },

      // 番組初期化
      initializeProgram: async () => {
        const { apiConfig, isInitializing, program } = get();

        // 多重初期化を防止
        if (isInitializing) {
          console.log('[Program] Already initializing, ignoring...');
          return;
        }

        // 既に番組がある場合は初期化しない
        if (program) {
          console.log('[Program] Program already exists, ignoring...');
          return;
        }

        if (!apiConfig.grokApiKey || !apiConfig.openaiApiKey) {
          set({ error: 'APIキーが設定されていません（Grok APIとOpenAI APIが必要です）' });
          return;
        }

        set({ isInitializing: true, error: null });

        try {
          console.log('[Program] Initializing...');

          // セグメントを作成
          const segments: Segment[] = PROGRAM_SEGMENTS.map((genre, index) => {
            const genreConfig = GENRES.find((g) => g.id === genre)!;
            return {
              id: `segment-${index}`,
              genre: genre,
              name: genreConfig.name,
              icon: genreConfig.icon,
              posts: [],
              status: 'pending',
              startIndex: index * POSTS_PER_SEGMENT,
              endIndex: (index + 1) * POSTS_PER_SEGMENT - 1,
            };
          });

          const program: ShowProgram = {
            id: `show-${Date.now()}`,
            generatedAt: new Date().toISOString(),
            totalPosts: PROGRAM_SEGMENTS.length * POSTS_PER_SEGMENT,
            segments,
            status: 'initializing',
          };

          set({ program });

          // キャッシュをチェック（シンプルモードはx-timeline-radio固定）
          const cache = loadPostsCache('x-timeline-radio');
          let results: { index: number; posts: BuzzPost[] }[];

          if (cache) {
            console.log('[Program] Using cached posts...');
            results = PROGRAM_SEGMENTS.map((genre, index) => ({
              index,
              posts: cache.posts[genre] || [],
            }));
            // キャッシュからannotationsも復元
            if (cache.annotations && cache.annotations.length > 0) {
              console.log(`[Program] Restored ${cache.annotations.length} annotations from cache`);
              set({ collectedAnnotations: cache.annotations });
            }
          } else {
            // 全ジャンルのPostを並行収集
            console.log('[Program] Collecting posts for all genres...');
            const allAnnotations: RelatedPost[] = [];

            const collectPromises = PROGRAM_SEGMENTS.map(async (genre, index) => {
              try {
                const response = await fetch('/api/collect-posts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    genre,
                    apiKey: apiConfig.grokApiKey,
                  }),
                });

                if (!response.ok) {
                  throw new Error(`Failed to collect posts for ${genre}`);
                }

                const data = await response.json();
                // annotationsを収集
                if (data.annotations && Array.isArray(data.annotations)) {
                  for (const ann of data.annotations) {
                    if (!allAnnotations.some(a => a.statusId === ann.statusId)) {
                      allAnnotations.push(ann);
                    }
                  }
                }
                return { index, genre, posts: data.posts as BuzzPost[] };
              } catch (e) {
                console.error(`[Program] Error collecting ${genre}:`, e);
                return { index, genre, posts: [] };
              }
            });

            const fetchResults = await Promise.all(collectPromises);
            results = fetchResults;

            // キャッシュに保存（annotationsも含む、シンプルモードはx-timeline-radio固定）
            const postsMap: Record<Genre, BuzzPost[]> = {} as Record<Genre, BuzzPost[]>;
            fetchResults.forEach((r) => {
              postsMap[PROGRAM_SEGMENTS[r.index]] = r.posts;
            });
            savePostsCache(postsMap, allAnnotations, 'x-timeline-radio');

            // annotationsを状態に保存
            console.log(`[Program] Collected ${allAnnotations.length} unique annotations`);
            set({ collectedAnnotations: allAnnotations });
          }

          // デバッグ: 収集結果をログ
          console.log('[Program] Collection results:');
          results.forEach((r, i) => {
            const genre = PROGRAM_SEGMENTS[i];
            console.log(`  ${genre}: ${r.posts.length} posts`);
            if (r.posts.length > 0) {
              console.log(`    Sample: @${r.posts[0].author.username}: "${r.posts[0].text.substring(0, 50)}..."`);
            }
          });

          // セグメントにPostを設定
          set((state) => {
            if (!state.program) return state;

            const updatedSegments = [...state.program.segments];
            for (const result of results) {
              updatedSegments[result.index] = {
                ...updatedSegments[result.index],
                posts: result.posts,
                status: result.posts.length > 0 ? 'pending' : 'error',
              };
            }

            const totalPosts = updatedSegments.reduce(
              (sum, seg) => sum + seg.posts.length,
              0
            );

            console.log(`[Program] Collected ${totalPosts} posts total`);

            return {
              program: {
                ...state.program,
                segments: updatedSegments,
                totalPosts,
                status: 'ready',
              },
              isInitializing: false,
            };
          });

          // 注意: モバイルブラウザでは自動再生がブロックされるため、
          // ユーザーが明示的に再生ボタンを押すまで待つ
          console.log('[Program] Ready to play - user must press play button');
        } catch (error: any) {
          console.error('[Program] Initialization error:', error);
          set({
            isInitializing: false,
            error: error.message || 'プログラムの初期化に失敗しました',
          });
        }
      },

      // セグメント再生（投稿単位でチャンク化、開始位置指定可能）
      playSegment: async (segmentIndex: number, startPostIndex: number = 0) => {
        const { program, apiConfig, audioSettings, currentAudio, isPlaying, stopRequested } = get();
        if (!program || segmentIndex >= program.segments.length) return;

        // 停止リクエストをクリア
        set({ stopRequested: false });

        // 既に再生中なら何もしない（二重再生防止）
        if (isPlaying) {
          console.log(`[Playback] Already playing, ignoring request for segment ${segmentIndex}`);
          return;
        }

        // 再生中フラグをセット
        set({ isPlaying: true });

        // Media Sessionを更新
        const segment = program.segments[segmentIndex];
        mediaSessionManager.updateMetadata({
          title: `${segment.icon} ${segment.name}`,
          artist: 'X Timeline Radio',
          album: 'シンプルモード',
        });
        mediaSessionManager.setPlaybackState('playing');

        // BGMが設定されていれば先行再生開始
        if (!bgmManager.getIsPlaying()) {
          const bgmConfig = bgmManager.getConfig();
          if (bgmConfig.source !== 'none') {
            console.log('[Playback] Starting BGM...');
            await bgmManager.start();
          }
        }

        // 現在の音声を停止
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.src = '';
        }

        if (segment.posts.length === 0) {
          console.log(`[Playback] Segment ${segmentIndex} has no posts, skipping`);
          set({ isPlaying: false });
          get().nextSegment();
          return;
        }

        // ステータス更新
        set((state) => {
          if (!state.program) return state;
          const updatedSegments = [...state.program.segments];
          updatedSegments[segmentIndex] = {
            ...updatedSegments[segmentIndex],
            status: 'playing',
          };
          return {
            program: { ...state.program, segments: updatedSegments },
            currentSegmentIndex: segmentIndex,
            currentPostIndex: startPostIndex,
          };
        });

        try {
          const { openaiVoiceId, speed, showType } = audioSettings;

          // TTS設定を作成（番組タイプも含める）
          const ttsConfig: TtsConfig = {
            openaiApiKey: apiConfig.openaiApiKey,
            openaiVoiceId,
            showType,
          };

          // 最初から開始する場合: イントロ + 最初の投稿を並行生成
          let currentAudioUrl: string | null = null;

          if (startPostIndex === 0) {
            const introScript = `さて、続いては${segment.name}のコーナーです！今X上で話題になっている${segment.posts.length}件の投稿を紹介していきます。`;
            const firstPostScript = generatePostScript(segment.posts[0], 1, segment.posts.length);

            console.log(`[Playback] Generating intro + first post in parallel...`);
            const [introUrl, firstPostUrl] = await Promise.all([
              generateAudioUrl(introScript, ttsConfig),
              generateAudioUrl(firstPostScript, ttsConfig),
            ]);

            // イントロ再生
            await playAudioUrl(introUrl, speed);
            currentAudioUrl = firstPostUrl;
          } else {
            // 途中から開始: 最初の投稿を生成
            const firstPost = segment.posts[startPostIndex];
            const firstPostScript = generatePostScript(firstPost, startPostIndex + 1, segment.posts.length);
            currentAudioUrl = await generateAudioUrl(firstPostScript, ttsConfig);
          }

          // 各投稿をプリフェッチしながら再生
          let nextAudioPromise: Promise<string> | null = null;
          let nextSegmentPrefetch: Promise<{ introUrl: string; firstPostUrl: string | null }> | null = null;

          // 次のセグメントの情報を取得
          const nextSegmentIndex = segmentIndex + 1;
          const nextSegment = program.segments[nextSegmentIndex];

          for (let i = startPostIndex; i < segment.posts.length; i++) {
            // 停止リクエストチェック
            if (get().stopRequested) {
              console.log('[Playback] Stop requested, breaking loop');
              set({ isPlaying: false, stopRequested: false });
              return;
            }

            set({ currentPostIndex: i });

            // 次の音声を先読み開始（現在の再生中に並行して実行）
            if (i < segment.posts.length - 1) {
              const nextPost = segment.posts[i + 1];
              const nextScript = generatePostScript(nextPost, i + 2, segment.posts.length);
              nextAudioPromise = generateAudioUrl(nextScript, ttsConfig);
              console.log(`[Prefetch] Started post ${i + 2}...`);
            } else {
              // 最後の投稿時はアウトロ + 次セグメントを先読み
              const outroScript = `以上、${segment.name}のコーナーでした！`;
              nextAudioPromise = generateAudioUrl(outroScript, ttsConfig);
              console.log(`[Prefetch] Started outro...`);

              // 次のセグメントがあれば、イントロ + 最初の投稿も先読み開始
              if (nextSegment && nextSegment.posts.length > 0) {
                console.log(`[Prefetch] Starting next segment (${nextSegment.name})...`);
                const nextIntroScript = `さて、続いては${nextSegment.name}のコーナーです！今X上で話題になっている${nextSegment.posts.length}件の投稿を紹介していきます。`;
                const nextFirstPostScript = generatePostScript(nextSegment.posts[0], 1, nextSegment.posts.length);

                nextSegmentPrefetch = Promise.all([
                  generateAudioUrl(nextIntroScript, ttsConfig),
                  generateAudioUrl(nextFirstPostScript, ttsConfig),
                ]).then(([introUrl, firstPostUrl]) => ({ introUrl, firstPostUrl }));
              }
            }

            // 現在の投稿を再生（先読みと並行）
            console.log(`[Playback] Playing post ${i + 1}/${segment.posts.length}...`);
            if (currentAudioUrl) {
              await playAudioUrl(currentAudioUrl, speed);
            }

            // 次の音声URLを取得（既に生成開始しているので待ち時間は短い）
            if (nextAudioPromise) {
              currentAudioUrl = await nextAudioPromise;
              nextAudioPromise = null;
            }
          }

          // アウトロ再生（既にプリフェッチ済み）+ 次セグメントのプリフェッチ完了を待つ
          if (currentAudioUrl) {
            await playAudioUrl(currentAudioUrl, speed);
          }

          // 次のセグメントへ（プリフェッチデータを渡す）
          // ステータス更新はplaySegmentWithPrefetch内で行う
          const hasNextSegment = nextSegmentPrefetch && nextSegment;
          if (hasNextSegment) {
            const prefetchedData = await nextSegmentPrefetch;
            console.log(`[Prefetch] Next segment ready, starting playback...`);
            get().playSegmentWithPrefetch(nextSegmentIndex, prefetchedData);
          } else {
            // 最後のセグメントの場合はここでステータス更新
            set((state) => {
              if (!state.program) return state;
              const updatedSegments = [...state.program.segments];
              updatedSegments[segmentIndex] = {
                ...updatedSegments[segmentIndex],
                status: 'done',
              };
              return {
                program: { ...state.program, segments: updatedSegments },
                isPlaying: false,
              };
            });
            get().nextSegment();
          }
        } catch (error: any) {
          console.error(`[Playback] Error in segment ${segmentIndex}:`, error);
          set((state) => {
            if (!state.program) return state;
            const updatedSegments = [...state.program.segments];
            updatedSegments[segmentIndex] = {
              ...updatedSegments[segmentIndex],
              status: 'error',
            };
            return {
              program: { ...state.program, segments: updatedSegments },
              error: error.message,
              isPlaying: false,
            };
          });
        }
      },

      // プリフェッチ済みデータを使ってセグメント再生（セグメント間の遅延を解消）
      playSegmentWithPrefetch: async (segmentIndex: number, prefetchedData: { introUrl: string; firstPostUrl: string | null }) => {
        const { program, apiConfig, audioSettings, currentSegmentIndex: prevSegmentIndex } = get();
        if (!program || segmentIndex >= program.segments.length) return;

        // 停止リクエストチェック
        if (get().stopRequested) {
          console.log('[Playback] Stop requested, not starting prefetched segment');
          set({ isPlaying: false, stopRequested: false });
          return;
        }

        const segment = program.segments[segmentIndex];
        if (segment.posts.length === 0) {
          console.log(`[Playback] Segment ${segmentIndex} has no posts, skipping`);
          set({ isPlaying: false });
          get().nextSegment();
          return;
        }

        // ステータス更新（前のセグメントを'done'に、現在のセグメントを'playing'に - 同時に更新）
        set((state) => {
          if (!state.program) return state;
          const updatedSegments = [...state.program.segments];

          // 前のセグメントを完了に
          if (prevSegmentIndex >= 0 && prevSegmentIndex < updatedSegments.length) {
            updatedSegments[prevSegmentIndex] = {
              ...updatedSegments[prevSegmentIndex],
              status: 'done',
            };
          }

          // 現在のセグメントを再生中に
          updatedSegments[segmentIndex] = {
            ...updatedSegments[segmentIndex],
            status: 'playing',
          };

          return {
            program: { ...state.program, segments: updatedSegments },
            currentSegmentIndex: segmentIndex,
            currentPostIndex: 0,
            isPlaying: true,
          };
        });

        try {
          const { openaiVoiceId, speed, showType } = audioSettings;

          // TTS設定を作成（番組タイプも含める）
          const ttsConfig: TtsConfig = {
            openaiApiKey: apiConfig.openaiApiKey,
            openaiVoiceId,
            showType,
          };

          console.log(`[Playback] Playing prefetched segment ${segmentIndex} (${segment.name})...`);

          // プリフェッチ済みイントロを再生
          await playAudioUrl(prefetchedData.introUrl, speed);

          // 次の音声を先読み開始するための変数
          let currentAudioUrl: string | null = prefetchedData.firstPostUrl;
          let nextAudioPromise: Promise<string> | null = null;
          let nextSegmentPrefetch: Promise<{ introUrl: string; firstPostUrl: string | null }> | null = null;

          // 次のセグメントの情報を取得
          const nextSegmentIndex = segmentIndex + 1;
          const nextSegment = program.segments[nextSegmentIndex];

          for (let i = 0; i < segment.posts.length; i++) {
            // 停止リクエストチェック
            if (get().stopRequested) {
              console.log('[Playback] Stop requested, breaking loop');
              set({ isPlaying: false, stopRequested: false });
              return;
            }

            set({ currentPostIndex: i });

            // 次の音声を先読み開始
            if (i < segment.posts.length - 1) {
              const nextPost = segment.posts[i + 1];
              const nextScript = generatePostScript(nextPost, i + 2, segment.posts.length);
              nextAudioPromise = generateAudioUrl(nextScript, ttsConfig);
              console.log(`[Prefetch] Started post ${i + 2}...`);
            } else {
              // 最後の投稿時はアウトロ + 次セグメントを先読み
              const outroScript = `以上、${segment.name}のコーナーでした！`;
              nextAudioPromise = generateAudioUrl(outroScript, ttsConfig);
              console.log(`[Prefetch] Started outro...`);

              // 次のセグメントがあれば先読み開始
              if (nextSegment && nextSegment.posts.length > 0) {
                console.log(`[Prefetch] Starting next segment (${nextSegment.name})...`);
                const nextIntroScript = `さて、続いては${nextSegment.name}のコーナーです！今X上で話題になっている${nextSegment.posts.length}件の投稿を紹介していきます。`;
                const nextFirstPostScript = generatePostScript(nextSegment.posts[0], 1, nextSegment.posts.length);

                nextSegmentPrefetch = Promise.all([
                  generateAudioUrl(nextIntroScript, ttsConfig),
                  generateAudioUrl(nextFirstPostScript, ttsConfig),
                ]).then(([introUrl, firstPostUrl]) => ({ introUrl, firstPostUrl }));
              }
            }

            // 現在の投稿を再生
            console.log(`[Playback] Playing post ${i + 1}/${segment.posts.length}...`);
            if (currentAudioUrl) {
              await playAudioUrl(currentAudioUrl, speed);
            }

            // 次の音声URLを取得
            if (nextAudioPromise) {
              currentAudioUrl = await nextAudioPromise;
              nextAudioPromise = null;
            }
          }

          // アウトロ再生
          if (currentAudioUrl) {
            await playAudioUrl(currentAudioUrl, speed);
          }

          // 次のセグメントへ
          // ステータス更新はplaySegmentWithPrefetch内で行う
          const hasNextSegment = nextSegmentPrefetch && nextSegment;
          if (hasNextSegment) {
            const prefetchedNextData = await nextSegmentPrefetch;
            console.log(`[Prefetch] Next segment ready, starting playback...`);
            get().playSegmentWithPrefetch(nextSegmentIndex, prefetchedNextData);
          } else {
            // 最後のセグメントの場合はここでステータス更新
            set((state) => {
              if (!state.program) return state;
              const updatedSegments = [...state.program.segments];
              updatedSegments[segmentIndex] = {
                ...updatedSegments[segmentIndex],
                status: 'done',
              };
              return {
                program: { ...state.program, segments: updatedSegments },
                isPlaying: false,
              };
            });
            get().nextSegment();
          }
        } catch (error: any) {
          console.error(`[Playback] Error in prefetched segment ${segmentIndex}:`, error);
          set((state) => {
            if (!state.program) return state;
            const updatedSegments = [...state.program.segments];
            updatedSegments[segmentIndex] = {
              ...updatedSegments[segmentIndex],
              status: 'error',
            };
            return {
              program: { ...state.program, segments: updatedSegments },
              error: error.message,
              isPlaying: false,
            };
          });
        }
      },

      // 指定位置から再生
      playFromPosition: (segmentIndex: number, postIndex: number) => {
        const { isPlaying } = get();

        // 現在再生中なら停止リクエスト
        if (isPlaying) {
          set({ stopRequested: true });
          // 少し待ってから新しい再生を開始
          setTimeout(() => {
            set({ isPlaying: false, stopRequested: false });
            get().playSegment(segmentIndex, postIndex);
          }, 100);
        } else {
          get().playSegment(segmentIndex, postIndex);
        }
      },

      // 再生開始
      startPlayback: () => {
        const { program, isPlaying } = get();
        if (isPlaying) return; // 既に再生中
        if (program) {
          get().playSegment(get().currentSegmentIndex, get().currentPostIndex);
        }
      },

      // 一時停止（実際には停止と同じ - TTS再生中は途中停止できないため）
      pausePlayback: () => {
        get().stopPlayback();
      },

      // 停止
      stopPlayback: () => {
        console.log('[Playback] Stop requested by user');

        // 現在再生中の音声を即座に停止
        stopCurrentAudio();

        // BGMも停止
        if (bgmManager.getIsPlaying()) {
          bgmManager.stop();
        }

        // Media Sessionを更新
        mediaSessionManager.setPlaybackState('paused');

        set({ stopRequested: true, isPlaying: false });
      },

      // 次のセグメントへ
      nextSegment: () => {
        const { program, currentSegmentIndex } = get();
        if (!program) return;

        const nextIndex = currentSegmentIndex + 1;
        if (nextIndex < program.segments.length) {
          get().playSegment(nextIndex);
        } else {
          console.log('[Playback] Program ended');
          // BGMも停止
          if (bgmManager.getIsPlaying()) {
            bgmManager.stop();
          }
          set({
            isPlaying: false,
            program: { ...program, status: 'ended' },
          });
        }
      },

      // エラー設定
      setError: (error) => set({ error }),

      // リセット
      reset: () => {
        // 現在再生中の音声を即座に停止
        stopCurrentAudio();

        // BGMも停止
        if (bgmManager.getIsPlaying()) {
          bgmManager.stop();
        }
        set({
          // シンプルモード
          program: null,
          currentSegmentIndex: 0,
          currentPostIndex: 0,
          // AIスクリプトモード
          aiProgram: null,
          currentSectionIndex: 0,
          currentChunkIndex: 0,
          isGeneratingScript: false,
          collectedPosts: null,
          collectedAnnotations: null,
          // 共通
          isPlaying: false,
          isInitializing: false,
          currentAudio: null,
          error: null,
        });
      },

      // キャッシュクリア
      clearCache: () => {
        clearPostsCache();
      },

      // 番組を再取得（キャッシュクリア後に再生成）
      refreshProgram: async () => {
        const { audioSettings, stopPlayback } = get();

        // 再生を停止
        stopPlayback();

        // キャッシュをクリア
        clearPostsCache();

        // 状態をリセット（番組のみ、設定は保持）
        set({
          program: null,
          aiProgram: null,
          collectedPosts: null,
          currentSegmentIndex: 0,
          currentPostIndex: 0,
          currentSectionIndex: 0,
          currentChunkIndex: 0,
          isGeneratingScript: false,
          currentAudio: null,
          error: null,
        });

        // モードに応じて再初期化
        if (audioSettings.programMode === 'ai-script') {
          await get().initializeAIProgram();
        } else {
          await get().initializeProgram();
        }
      },

      // ========================================
      // AIスクリプトモードのアクション
      // ========================================

      // AIスクリプトモード初期化
      initializeAIProgram: async () => {
        const { apiConfig, isInitializing, aiProgram, audioSettings } = get();

        // モードチェック
        if (audioSettings.programMode !== 'ai-script') {
          console.log('[AIProgram] Not in AI script mode, ignoring...');
          return;
        }

        // 多重初期化を防止
        if (isInitializing) {
          console.log('[AIProgram] Already initializing, ignoring...');
          return;
        }

        // 既に番組がある場合は初期化しない
        if (aiProgram) {
          console.log('[AIProgram] Program already exists, ignoring...');
          return;
        }

        if (!apiConfig.grokApiKey || !apiConfig.geminiApiKey || !apiConfig.openaiApiKey) {
          set({ error: 'APIキーが設定されていません（Grok API、Gemini API、OpenAI APIが必要です）' });
          return;
        }

        set({ isInitializing: true, error: null, isGeneratingScript: false });

        try {
          const { showType } = audioSettings;
          console.log(`[AIProgram] Collecting posts for showType: ${showType}...`);

          // キャッシュをチェック（showType別）
          const cache = loadPostsCache(showType);
          let allPosts: Record<Genre, BuzzPost[]>;

          if (cache) {
            console.log(`[AIProgram] Using cached posts for ${showType}...`);
            allPosts = cache.posts;
            // キャッシュからannotationsも復元
            if (cache.annotations && cache.annotations.length > 0) {
              console.log(`[AIProgram] Restored ${cache.annotations.length} annotations from cache`);
              set({ collectedAnnotations: cache.annotations });
            }
          } else {
            const allAnnotations: RelatedPost[] = [];

            // showTypeが設定されていて、レガシーでない場合は1回のAPI呼び出しで全ジャンル取得
            if (showType && showType !== 'x-timeline-radio') {
              console.log(`[AIProgram] Collecting posts for showType: ${showType}`);
              try {
                const response = await fetch('/api/collect-posts', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    apiKey: apiConfig.grokApiKey,
                    showType,
                  }),
                });

                if (!response.ok) {
                  const errorText = await response.text();
                  throw new Error(`Failed to collect posts: ${errorText.slice(0, 100)}`);
                }

                const data = await response.json();
                // postsはRecord<genreId, BuzzPost[]>形式で返ってくる
                allPosts = (data.posts || {}) as Record<Genre, BuzzPost[]>;

                // annotationsを収集
                if (data.annotations && Array.isArray(data.annotations)) {
                  for (const ann of data.annotations) {
                    if (!allAnnotations.some(a => a.statusId === ann.statusId)) {
                      allAnnotations.push(ann);
                    }
                  }
                }

                console.log(`[AIProgram] Collected posts for ${Object.keys(allPosts).length} genres`);
              } catch (e: any) {
                console.error('[AIProgram] Error collecting posts:', e);
                throw new Error(`投稿の収集に失敗しました: ${e.message}`);
              }
            } else {
              // レガシー: 各ジャンルを並行収集
              const collectPromises = PROGRAM_SEGMENTS.map(async (genre) => {
                try {
                  const response = await fetch('/api/collect-posts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      genre,
                      apiKey: apiConfig.grokApiKey,
                    }),
                  });

                  if (!response.ok) {
                    throw new Error(`Failed to collect posts for ${genre}`);
                  }

                  const data = await response.json();
                  // annotationsを収集
                  if (data.annotations && Array.isArray(data.annotations)) {
                    for (const ann of data.annotations) {
                      if (!allAnnotations.some(a => a.statusId === ann.statusId)) {
                        allAnnotations.push(ann);
                      }
                    }
                  }
                  return { genre, posts: data.posts as BuzzPost[] };
                } catch (e) {
                  console.error(`[AIProgram] Error collecting ${genre}:`, e);
                  return { genre, posts: [] };
                }
              });

              const results = await Promise.all(collectPromises);
              allPosts = {} as Record<Genre, BuzzPost[]>;
              results.forEach((r) => {
                allPosts[r.genre] = r.posts;
              });
            }

            // キャッシュに保存（annotationsも含む、showType別）
            savePostsCache(allPosts, allAnnotations, showType);

            // annotationsを状態に保存
            console.log(`[AIProgram] Collected ${allAnnotations.length} unique annotations`);
            set({ collectedAnnotations: allAnnotations });
          }

          // 投稿数を確認
          const totalPosts = Object.values(allPosts).reduce((sum, posts) => sum + posts.length, 0);
          console.log(`[AIProgram] Collected ${totalPosts} posts total`);

          set({ collectedPosts: allPosts });

          // スクリプト生成開始
          console.log('[AIProgram] Generating AI script...');
          set({ isGeneratingScript: true });

          const response = await fetch('/api/generate-full-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              allPosts,
              apiKey: apiConfig.geminiApiKey,
              style: 'comprehensive',
              showType: audioSettings.showType, // 番組タイプを渡す
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`スクリプト生成に失敗しました: ${errorText.slice(0, 100)}`);
          }

          const { sections, totalDuration } = await response.json();

          console.log(`[AIProgram] Generated ${sections.length} sections, ${totalDuration} minutes`);

          const aiProgram: AIScriptProgram = {
            id: `ai-show-${Date.now()}`,
            sections,
            totalDuration,
            generatedAt: new Date().toISOString(),
            status: 'ready',
          };

          set({
            aiProgram,
            isInitializing: false,
            isGeneratingScript: false,
            currentSectionIndex: 0,
            currentChunkIndex: 0,
          });

          // スクリプトを自動保存
          saveScript(aiProgram);
          set({ savedScripts: getSavedScripts() });
          console.log('[AIProgram] Script saved automatically');

          // 注意: モバイルブラウザでは自動再生がブロックされるため、
          // ユーザーが明示的に再生ボタンを押すまで待つ
          console.log('[AIProgram] Ready to play - user must press play button');
        } catch (error: any) {
          console.error('[AIProgram] Initialization error:', error);
          set({
            isInitializing: false,
            isGeneratingScript: false,
            error: error.message || 'AIプログラムの初期化に失敗しました',
          });
        }
      },

      // AIスクリプト再生
      playAIScript: async () => {
        const { aiProgram, apiConfig, audioSettings, isPlaying, isPreloading, stopRequested } = get();
        if (!aiProgram || aiProgram.sections.length === 0) return;

        // 停止リクエストをクリア
        set({ stopRequested: false });

        // 既に再生中またはプリロード中なら何もしない
        if (isPlaying || isPreloading) {
          console.log('[AIPlayback] Already playing or preloading, ignoring...');
          return;
        }

        // プリロード開始 & BGM即座開始（ユーザー体験向上）
        set({ isPreloading: true });
        console.log('[AIPlayback] Starting playback sequence...');

        // Media Sessionを更新
        mediaSessionManager.updateMetadata({
          title: 'X Timeline Radio',
          artist: 'AI番組モード',
          album: `${aiProgram.totalDuration}分の番組`,
        });

        const { openaiVoiceId, speed, showType } = audioSettings;
        const ttsConfig: TtsConfig = {
          openaiApiKey: apiConfig.openaiApiKey,
          openaiVoiceId,
          showType,
        };

        try {
          // 【重要】BGMを最初に開始（ユーザーがすぐに音が出ることを確認できる）
          const bgmVolumePercent = audioSettings.bgmVolume ?? 5;
          const bgmVolumeDecimal = bgmVolumePercent === 0 ? 0 : (bgmVolumePercent / 100) * 0.05;
          console.log(`[AIPlayback] Starting BGM immediately for ${showType} at volume ${bgmVolumePercent}% (${bgmVolumeDecimal.toFixed(4)})`);

          // 既存のBGMを停止してから新しく開始（isPlayingフラグをリセット）
          bgmManager.stop();
          bgmManager.setConfig({ showType, source: 'default', volume: bgmVolumeDecimal });

          // BGMを非同期で開始（エラーがあってもTTS再生は続ける）
          bgmManager.start().then(() => {
            console.log('[AIPlayback] BGM started successfully');
          }).catch((e) => {
            console.error('[AIPlayback] BGM start failed:', e);
          });

          const { currentSectionIndex: startSection, currentChunkIndex: startChunk } = get();

          // 全チャンクをフラット化してインデックス管理
          type ChunkInfo = { secIdx: number; chunkIdx: number; text: string };
          const allChunks: ChunkInfo[] = [];
          for (let secIdx = 0; secIdx < aiProgram.sections.length; secIdx++) {
            const section = aiProgram.sections[secIdx];
            for (let chunkIdx = 0; chunkIdx < section.chunks.length; chunkIdx++) {
              allChunks.push({ secIdx, chunkIdx, text: section.chunks[chunkIdx] });
            }
          }

          // 開始位置を計算
          let startIdx = 0;
          for (let i = 0; i < allChunks.length; i++) {
            if (allChunks[i].secIdx === startSection && allChunks[i].chunkIdx === startChunk) {
              startIdx = i;
              break;
            }
          }

          console.log(`[AIPlayback] Starting from chunk ${startIdx + 1}/${allChunks.length}`);

          // プリフェッチキュー（3つ先まで - セクション間移行対応）
          const PREFETCH_AHEAD = 3;
          const prefetchPromises: Map<number, Promise<string>> = new Map();

          // セクション境界のインデックスを事前計算（セクション間プリフェッチ用）
          const sectionBoundaries: number[] = [];
          let boundaryIdx = 0;
          for (let secIdx = 0; secIdx < aiProgram.sections.length; secIdx++) {
            boundaryIdx += aiProgram.sections[secIdx].chunks.length;
            sectionBoundaries.push(boundaryIdx); // 各セクションの終了インデックス+1
          }
          console.log(`[AIPlayback] Section boundaries: ${sectionBoundaries.join(', ')}`);

          // 最初のチャンクをプリロード開始
          console.log('[AIPlayback] Preloading first chunk...');
          const firstChunkPromise = generateAudioUrl(allChunks[startIdx].text, ttsConfig);
          prefetchPromises.set(startIdx, firstChunkPromise);

          // 残りのチャンクも並行でプリフェッチ開始（待たずに開始）
          for (let i = startIdx + 1; i < Math.min(startIdx + PREFETCH_AHEAD + 1, allChunks.length); i++) {
            console.log(`[AIPlayback] Background prefetch chunk ${i + 1}...`);
            prefetchPromises.set(i, generateAudioUrl(allChunks[i].text, ttsConfig));
          }

          // 最初のチャンクの読み込み完了を待つ
          const firstAudioUrl = await firstChunkPromise;
          console.log('[AIPlayback] First chunk preloaded successfully');

          // 停止リクエストチェック（プリロード中に停止された場合）
          if (get().stopRequested) {
            console.log('[AIPlayback] Stop requested during preload');
            set({ isPreloading: false, stopRequested: false });
            bgmManager.stop();
            return;
          }

          // プリロード完了 → TTS再生開始
          console.log('[AIPlayback] Preload complete, starting TTS playback...');
          set({ isPreloading: false, isPlaying: true });
          mediaSessionManager.setPlaybackState('playing');

          // AIプログラムのステータスを更新
          set((state) => ({
            aiProgram: state.aiProgram ? { ...state.aiProgram, status: 'playing' } : null,
          }));

          // チャンクを順番に再生
          for (let i = startIdx; i < allChunks.length; i++) {
            // 停止リクエストチェック
            if (get().stopRequested) {
              console.log('[AIPlayback] Stop requested, breaking...');
              set({ isPlaying: false, stopRequested: false });
              return;
            }

            const chunkInfo = allChunks[i];
            set({ currentSectionIndex: chunkInfo.secIdx, currentChunkIndex: chunkInfo.chunkIdx });

            // セクション変更時にログ + Media Session更新
            if (i === startIdx || allChunks[i - 1].secIdx !== chunkInfo.secIdx) {
              const section = aiProgram.sections[chunkInfo.secIdx];
              console.log(`[AIPlayback] Section ${chunkInfo.secIdx + 1}/${aiProgram.sections.length}: ${section.title}`);

              // Media Sessionメタデータを更新
              mediaSessionManager.updateMetadata({
                title: section.title,
                artist: 'X Timeline Radio',
                album: `AI番組 (${chunkInfo.secIdx + 1}/${aiProgram.sections.length})`,
              });
            }

            console.log(`[AIPlayback] Chunk ${i + 1}/${allChunks.length}: ${chunkInfo.text.substring(0, 30)}...`);

            // 次のチャンクをプリフェッチ開始
            const nextPrefetchIdx = i + PREFETCH_AHEAD + 1;
            if (nextPrefetchIdx < allChunks.length && !prefetchPromises.has(nextPrefetchIdx)) {
              console.log(`[AIPlayback] Prefetch chunk ${nextPrefetchIdx + 1}...`);
              prefetchPromises.set(nextPrefetchIdx, generateAudioUrl(allChunks[nextPrefetchIdx].text, ttsConfig));
            }

            // セクション間プリフェッチ：セクションの後半（残り2チャンク以下）に入ったら
            // 次のセクションの最初の数チャンクを積極的にプリフェッチ
            const currentSection = aiProgram.sections[chunkInfo.secIdx];
            const remainingInSection = currentSection.chunks.length - chunkInfo.chunkIdx - 1;
            if (remainingInSection <= 2 && chunkInfo.secIdx < aiProgram.sections.length - 1) {
              // 次のセクションの開始インデックスを計算
              const nextSectionStartIdx = sectionBoundaries[chunkInfo.secIdx];
              const nextSection = aiProgram.sections[chunkInfo.secIdx + 1];
              const chunksToPrefetch = Math.min(4, nextSection.chunks.length); // 最大4チャンク先読み

              for (let j = 0; j < chunksToPrefetch; j++) {
                const prefetchIdx = nextSectionStartIdx + j;
                if (prefetchIdx < allChunks.length && !prefetchPromises.has(prefetchIdx)) {
                  console.log(`[AIPlayback] Cross-section prefetch: chunk ${prefetchIdx + 1} (${nextSection.title})`);
                  prefetchPromises.set(prefetchIdx, generateAudioUrl(allChunks[prefetchIdx].text, ttsConfig));
                }
              }
            }

            // プリフェッチ済みの音声を取得して再生
            const audioPromise = prefetchPromises.get(i);
            if (audioPromise) {
              const audioUrl = await audioPromise;
              prefetchPromises.delete(i); // メモリ解放
              await playAudioUrl(audioUrl, speed);
            }
          }

          // 再生完了
          console.log('[AIPlayback] Program ended');
          if (bgmManager.getIsPlaying()) {
            bgmManager.stop();
          }
          set((state) => ({
            isPlaying: false,
            aiProgram: state.aiProgram ? { ...state.aiProgram, status: 'ended' } : null,
          }));
        } catch (error: any) {
          console.error('[AIPlayback] Error:', error);
          set({
            isPlaying: false,
            error: error.message,
          });
        }
      },

      // AIスクリプト 指定位置から再生
      playAISectionFromPosition: async (sectionIndex: number, chunkIndex: number) => {
        const { isPlaying } = get();

        // 再生中なら先に停止（音声を即座に停止）
        if (isPlaying) {
          console.log('[AIPlayback] Stopping current playback before switching section');
          stopCurrentAudio();
          if (bgmManager.getIsPlaying()) {
            bgmManager.stop();
          }
          set({ stopRequested: true, isPlaying: false });
          // 停止処理が完了するまで少し待つ
          await new Promise(resolve => setTimeout(resolve, 150));
        }

        set({ currentSectionIndex: sectionIndex, currentChunkIndex: chunkIndex, stopRequested: false });
        get().playAIScript();
      },

      // ========================================
      // 保存済みスクリプト管理
      // ========================================

      // 保存済みスクリプト一覧を再読み込み
      loadSavedScripts: () => {
        set({ savedScripts: getSavedScripts() });
      },

      // 現在のスクリプトを保存
      saveCurrentScript: (title?: string) => {
        const { aiProgram } = get();
        if (!aiProgram) {
          console.log('[SaveScript] No AI program to save');
          return;
        }

        const saved = saveScript(aiProgram, title);
        console.log(`[SaveScript] Saved: ${saved.title}`);
        set({ savedScripts: getSavedScripts() });
      },

      // 保存済みスクリプトを読み込み
      loadScript: (id: string) => {
        const scripts = getSavedScripts();
        const saved = scripts.find(s => s.id === id);
        if (!saved) {
          console.log(`[LoadScript] Script not found: ${id}`);
          return;
        }

        console.log(`[LoadScript] Loading: ${saved.title}`);

        // 現在の再生を停止
        const { isPlaying } = get();
        if (isPlaying) {
          get().stopPlayback();
        }

        set({
          aiProgram: saved.program,
          currentSectionIndex: 0,
          currentChunkIndex: 0,
          isPlaying: false,
        });
      },

      // 保存済みスクリプトを削除
      deleteSavedScript: (id: string) => {
        deleteScript(id);
        console.log(`[DeleteScript] Deleted: ${id}`);
        set({ savedScripts: getSavedScripts() });
      },
    }),
    {
      name: 'x-timeline-radio-v2',
      partialize: (state) => ({
        // apiConfigは専用ストレージで管理するため除外
        audioSettings: state.audioSettings,
        // シンプルモード番組状態
        program: state.program,
        currentSegmentIndex: state.currentSegmentIndex,
        currentPostIndex: state.currentPostIndex,
        // AIスクリプトモード番組状態
        aiProgram: state.aiProgram,
        currentSectionIndex: state.currentSectionIndex,
        currentChunkIndex: state.currentChunkIndex,
        collectedPosts: state.collectedPosts,
      }),
      // バージョン管理（状態構造が変わった時にマイグレーション）
      version: 2,
      // 永続化されたstateと現在のstateをマージ
      merge: (persistedState: any, currentState) => {
        // persistedStateがnullや不正な場合は現在の状態を使用
        if (!persistedState || typeof persistedState !== 'object') {
          console.log('[Store] Invalid persisted state, using defaults');
          return currentState;
        }
        return {
          ...currentState,
          ...persistedState,
          // APIキーは常に専用ストレージから読み込む
          apiConfig: getApiKeys(),
          // 再生状態は常にfalseから開始（音声は再生されないため）
          isPlaying: false,
          isInitializing: false,
          isGeneratingScript: false,
          stopRequested: false,
        };
      },
      // リハイドレーション時のエラーハンドリング
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[Store] Rehydration error:', error);
          // エラー時はlocalStorageをクリア
          try {
            localStorage.removeItem('x-timeline-radio-v2');
          } catch (e) {
            console.error('[Store] Failed to clear localStorage:', e);
          }
        } else {
          console.log('[Store] Rehydration complete');
          // 保存されたテーマを適用
          if (state?.audioSettings?.theme) {
            document.documentElement.setAttribute('data-theme', state.audioSettings.theme);
          }
          // キャッシュからannotationsを復元（現在のshowTypeのキャッシュを使用）
          const currentShowType = state?.audioSettings?.showType || 'x-timeline-radio';
          const cache = loadPostsCache(currentShowType);
          if (cache?.annotations && cache.annotations.length > 0) {
            console.log(`[Store] Restoring ${cache.annotations.length} annotations from cache for ${currentShowType}`);
            useStore.setState({ collectedAnnotations: cache.annotations });
          }

          // Media Sessionを初期化（バックグラウンド再生対応）
          mediaSessionManager.initialize();
          mediaSessionManager.setActionHandlers({
            play: () => {
              const store = useStore.getState();
              if (store.audioSettings.programMode === 'ai-script') {
                store.playAIScript();
              } else {
                store.startPlayback();
              }
            },
            pause: () => {
              useStore.getState().stopPlayback();
            },
            stop: () => {
              useStore.getState().stopPlayback();
            },
            nexttrack: () => {
              const store = useStore.getState();
              if (store.audioSettings.programMode === 'ai-script' && store.aiProgram) {
                const nextSection = store.currentSectionIndex + 1;
                if (nextSection < store.aiProgram.sections.length) {
                  store.playAISectionFromPosition(nextSection, 0);
                }
              } else {
                store.nextSegment();
              }
            },
          });
        }
      },
    }
  )
);
