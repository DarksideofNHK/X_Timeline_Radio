import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ShowProgram, Segment, BuzzPost, ApiConfig, Genre, OpenAIVoiceId, ProgramMode, AIScriptProgram, ScriptSection } from '../types';
import { GENRES, PROGRAM_SEGMENTS, POSTS_PER_SEGMENT } from '../lib/genres';
import { bgmManager, type BgmSource } from '../lib/bgm';
import { audioCache } from '../lib/audioCache';
import { getSavedScripts, saveScript, deleteScript, type SavedScript } from '../lib/scriptStorage';

// 音声設定（OpenAI TTSのみ使用）
interface AudioSettings {
  openaiVoiceId: OpenAIVoiceId;
  speed: number; // 0.75 - 2.0
  programMode: ProgramMode; // 'simple' | 'ai-script'
}

// キャッシュ設定
const CACHE_KEY = 'x-timeline-radio-posts-cache';
const CACHE_DURATION = 30 * 60 * 1000; // 30分

interface PostsCache {
  posts: Record<Genre, BuzzPost[]>;
  timestamp: number;
}

function loadPostsCache(): PostsCache | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;

    const data: PostsCache = JSON.parse(cached);
    const now = Date.now();

    // 有効期限チェック
    if (now - data.timestamp > CACHE_DURATION) {
      console.log('[Cache] Expired, clearing...');
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    console.log('[Cache] Loaded posts from cache');
    return data;
  } catch (e) {
    console.error('[Cache] Failed to load:', e);
    return null;
  }
}

function savePostsCache(posts: Record<Genre, BuzzPost[]>): void {
  try {
    const data: PostsCache = {
      posts,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    console.log('[Cache] Saved posts to cache');
  } catch (e) {
    console.error('[Cache] Failed to save:', e);
  }
}

function clearPostsCache(): void {
  localStorage.removeItem(CACHE_KEY);
  console.log('[Cache] Cleared');
}

// URLを除去
function removeUrls(text: string): string {
  return text
    .replace(/https?:\/\/[^\s]+/g, '')  // URLs
    .replace(/\s+/g, ' ')               // 連続スペースを1つに
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
const REQUEST_INTERVAL = 500; // リクエスト間隔（ms）

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
}

// 音声を生成（再生せずにURLを返す）- キャッシュ対応・リトライ対応（OpenAIのみ）
async function generateAudioUrl(
  script: string,
  ttsConfig: TtsConfig
): Promise<string> {
  const { openaiApiKey, openaiVoiceId } = ttsConfig;
  const cacheKey = `openai:${openaiVoiceId}`;

  // キャッシュをチェック
  const cached = await audioCache.get(script, cacheKey);
  if (cached) {
    return cached;
  }

  console.log(`[TTS:OpenAI] Generating audio (voice: ${openaiVoiceId}): "${script.substring(0, 30)}..."`);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // リクエスト間隔を確保
      await throttleRequest();

      const response = await fetch('/api/generate-audio-openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ script, apiKey: openaiApiKey, voice: openaiVoiceId }),
      });

      if (response.ok) {
        const { audio, mimeType } = await response.json();
        const audioBlob = new Blob(
          [Uint8Array.from(atob(audio), (c) => c.charCodeAt(0))],
          { type: mimeType }
        );

        // キャッシュに保存
        return audioCache.set(script, cacheKey, audioBlob);
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
async function playAudioUrl(audioUrl: string, speed: number = 1.0): Promise<void> {
  // TTS再生前にBGMをダッキング
  if (bgmManager.getIsPlaying()) {
    await bgmManager.duck();
  }

  return new Promise((resolve, reject) => {
    try {
      const audioElement = new Audio(audioUrl);
      audioElement.playbackRate = speed; // 再生速度を設定

      audioElement.onended = async () => {
        URL.revokeObjectURL(audioUrl);
        // TTS終了後にBGMを戻す
        if (bgmManager.getIsPlaying()) {
          await bgmManager.unduck();
        }
        resolve();
      };

      audioElement.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        reject(new Error('Audio playback failed'));
      };

      audioElement.play().catch(reject);
    } catch (e) {
      reject(e);
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

  // 再生状態
  isPlaying: boolean;
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

      // 保存済みスクリプト
      savedScripts: getSavedScripts(),

      // 再生状態
      isPlaying: false,
      isInitializing: false,
      currentAudio: null,
      stopRequested: false,
      apiConfig: {
        grokApiKey: '',
        geminiApiKey: '',
        openaiApiKey: '',
      },
      audioSettings: {
        openaiVoiceId: 'nova',
        speed: 1.0,
        programMode: 'simple',  // デフォルトはシンプルモード
      },
      error: null,

      // 設定更新
      setApiConfig: (config) =>
        set((state) => ({
          apiConfig: { ...state.apiConfig, ...config },
        })),

      // 音声設定更新
      setAudioSettings: (settings) =>
        set((state) => ({
          audioSettings: { ...state.audioSettings, ...settings },
        })),

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

          // キャッシュをチェック
          const cache = loadPostsCache();
          let results: { index: number; posts: BuzzPost[] }[];

          if (cache) {
            console.log('[Program] Using cached posts...');
            results = PROGRAM_SEGMENTS.map((genre, index) => ({
              index,
              posts: cache.posts[genre] || [],
            }));
          } else {
            // 全ジャンルのPostを並行収集
            console.log('[Program] Collecting posts for all genres...');
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
                return { index, genre, posts: data.posts as BuzzPost[] };
              } catch (e) {
                console.error(`[Program] Error collecting ${genre}:`, e);
                return { index, genre, posts: [] };
              }
            });

            const fetchResults = await Promise.all(collectPromises);
            results = fetchResults;

            // キャッシュに保存
            const postsMap: Record<Genre, BuzzPost[]> = {} as Record<Genre, BuzzPost[]>;
            fetchResults.forEach((r) => {
              postsMap[PROGRAM_SEGMENTS[r.index]] = r.posts;
            });
            savePostsCache(postsMap);
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

          // 最初のセグメントの音声を生成
          await get().playSegment(0);
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

        const segment = program.segments[segmentIndex];
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
          const { openaiVoiceId, speed } = audioSettings;

          // TTS設定を作成
          const ttsConfig: TtsConfig = {
            openaiApiKey: apiConfig.openaiApiKey,
            openaiVoiceId,
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
          const { openaiVoiceId, speed } = audioSettings;

          // TTS設定を作成
          const ttsConfig: TtsConfig = {
            openaiApiKey: apiConfig.openaiApiKey,
            openaiVoiceId,
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
        // BGMも停止
        if (bgmManager.getIsPlaying()) {
          bgmManager.stop();
        }
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
        const { currentAudio } = get();
        if (currentAudio) {
          currentAudio.pause();
          currentAudio.src = '';
        }
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
          console.log('[AIProgram] Collecting posts for all genres...');

          // キャッシュをチェック
          const cache = loadPostsCache();
          let allPosts: Record<Genre, BuzzPost[]>;

          if (cache) {
            console.log('[AIProgram] Using cached posts...');
            allPosts = cache.posts;
          } else {
            // 全ジャンルのPostを並行収集
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

            // キャッシュに保存
            savePostsCache(allPosts);
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

          // 自動再生開始
          get().playAIScript();
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
        const { aiProgram, apiConfig, audioSettings, isPlaying, stopRequested } = get();
        if (!aiProgram || aiProgram.sections.length === 0) return;

        // 停止リクエストをクリア
        set({ stopRequested: false });

        // 既に再生中なら何もしない
        if (isPlaying) {
          console.log('[AIPlayback] Already playing, ignoring...');
          return;
        }

        set({ isPlaying: true });

        // BGMが設定されていれば再生開始
        if (!bgmManager.getIsPlaying()) {
          const bgmConfig = bgmManager.getConfig();
          if (bgmConfig.source !== 'none') {
            console.log('[AIPlayback] Starting BGM...');
            await bgmManager.start();
          }
        }

        // AIプログラムのステータスを更新
        set((state) => ({
          aiProgram: state.aiProgram ? { ...state.aiProgram, status: 'playing' } : null,
        }));

        const { openaiVoiceId, speed } = audioSettings;
        const ttsConfig: TtsConfig = {
          openaiApiKey: apiConfig.openaiApiKey,
          openaiVoiceId,
        };

        try {
          const { currentSectionIndex: startSection, currentChunkIndex: startChunk } = get();

          // セクションを順番に再生
          for (let secIdx = startSection; secIdx < aiProgram.sections.length; secIdx++) {
            const section = aiProgram.sections[secIdx];
            set({ currentSectionIndex: secIdx });

            console.log(`[AIPlayback] Playing section ${secIdx + 1}/${aiProgram.sections.length}: ${section.title}`);

            // チャンクを順番に再生
            const chunkStart = secIdx === startSection ? startChunk : 0;
            for (let chunkIdx = chunkStart; chunkIdx < section.chunks.length; chunkIdx++) {
              // 停止リクエストチェック
              if (get().stopRequested) {
                console.log('[AIPlayback] Stop requested, breaking...');
                set({ isPlaying: false, stopRequested: false });
                return;
              }

              set({ currentChunkIndex: chunkIdx });

              const chunk = section.chunks[chunkIdx];
              console.log(`[AIPlayback] Chunk ${chunkIdx + 1}/${section.chunks.length}: ${chunk.substring(0, 30)}...`);

              // 音声生成と再生
              const audioUrl = await generateAudioUrl(chunk, ttsConfig);
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
      playAISectionFromPosition: (sectionIndex: number, chunkIndex: number) => {
        const { isPlaying } = get();

        set({ currentSectionIndex: sectionIndex, currentChunkIndex: chunkIndex });

        if (isPlaying) {
          set({ stopRequested: true });
          setTimeout(() => {
            set({ isPlaying: false, stopRequested: false });
            get().playAIScript();
          }, 100);
        } else {
          get().playAIScript();
        }
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
        apiConfig: state.apiConfig,
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
      // 永続化されたstateと現在のstateをマージ
      merge: (persistedState: any, currentState) => ({
        ...currentState,
        ...persistedState,
        // 再生状態は常にfalseから開始（音声は再生されないため）
        isPlaying: false,
        isInitializing: false,
        isGeneratingScript: false,
        stopRequested: false,
      }),
    }
  )
);
