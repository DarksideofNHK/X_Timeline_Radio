import { useState } from 'react';
import { useStore } from './store/useStore';
import { Settings } from './components/Settings';
import { Player } from './components/Player';
import { SegmentList } from './components/SegmentList';
import { PostList, Playlist } from './components/Playlist';
import { SectionIndicator } from './components/SectionIndicator';
import { formatScriptDate } from './lib/scriptStorage';
import type { ProgramMode } from './types';

export default function App() {
  // シンプルモード用
  const program = useStore((state) => state.program);
  const initializeProgram = useStore((state) => state.initializeProgram);

  // AIスクリプトモード用
  const aiProgram = useStore((state) => state.aiProgram);
  const isGeneratingScript = useStore((state) => state.isGeneratingScript);
  const currentSectionIndex = useStore((state) => state.currentSectionIndex);
  const initializeAIProgram = useStore((state) => state.initializeAIProgram);

  // 保存済みスクリプト
  const savedScripts = useStore((state) => state.savedScripts);
  const loadScript = useStore((state) => state.loadScript);
  const deleteSavedScript = useStore((state) => state.deleteSavedScript);

  // 共通
  const isInitializing = useStore((state) => state.isInitializing);
  const error = useStore((state) => state.error);
  const apiConfig = useStore((state) => state.apiConfig);
  const audioSettings = useStore((state) => state.audioSettings);
  const setAudioSettings = useStore((state) => state.setAudioSettings);
  const stopPlayback = useStore((state) => state.stopPlayback);
  const reset = useStore((state) => state.reset);

  const [showPlaylist, setShowPlaylist] = useState(false);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const isAIMode = audioSettings.programMode === 'ai-script';

  // セクションアイコン取得
  const getSectionIconFromApp = (type: string, genre?: string): string => {
    if (type === 'opening') return '📻';
    if (type === 'closing') return '👋';
    if (type === 'transition') return '🎵';
    const genreIcons: Record<string, string> = {
      trending: '🔥',
      politics: '🏛️',
      economy: '💹',
      lifestyle: '🏠',
      entertainment: '🎬',
      science: '🔬',
      international: '🌍',
    };
    return genre ? genreIcons[genre] || '📰' : '📰';
  };

  // 必要なAPIキーが揃っているか
  const hasApiKeys = isAIMode
    ? !!apiConfig.grokApiKey && !!apiConfig.geminiApiKey && !!apiConfig.openaiApiKey
    : !!apiConfig.grokApiKey && !!apiConfig.openaiApiKey;

  // 番組が存在するかどうか
  const hasProgramContent = isAIMode
    ? aiProgram && aiProgram.sections && aiProgram.sections.length > 0
    : program && program.segments && program.segments.length > 0;

  // 番組開始ハンドラー
  const handleStartProgram = () => {
    if (isAIMode) {
      initializeAIProgram();
    } else {
      initializeProgram();
    }
  };

  // モード変更ハンドラー
  const handleModeChange = (mode: ProgramMode) => {
    setAudioSettings({ programMode: mode });
  };

  return (
    <div className="min-h-screen bg-bg-main text-text-primary">
      {/* 固定ヘッダー（タイトル + プレイヤー） */}
      <header className="bg-bg-card border-b border-border-light sticky top-0 z-20 shadow-sm">
        {/* タイトル行 */}
        <div className="p-4 border-b border-border-light">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">🎙️</span>
              X Timeline Radio
              <span className="text-sm font-normal text-text-secondary">v2</span>
            </h1>
            <div className="flex items-center gap-2">
              {/* モード切り替え（番組がある時に表示） */}
              {hasProgramContent && (
                <div className="flex rounded-lg overflow-hidden border border-border-light">
                  <button
                    onClick={() => {
                      if (isAIMode) {
                        stopPlayback();
                        setAudioSettings({ programMode: 'simple' });
                      }
                    }}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      !isAIMode
                        ? 'bg-accent text-white'
                        : 'bg-bg-menu text-text-secondary hover:bg-hover-bg'
                    }`}
                  >
                    📻 シンプル
                  </button>
                  <button
                    onClick={() => {
                      if (!isAIMode) {
                        stopPlayback();
                        setAudioSettings({ programMode: 'ai-script' });
                      }
                    }}
                    className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                      isAIMode
                        ? 'bg-purple-600 text-white'
                        : 'bg-bg-menu text-text-secondary hover:bg-hover-bg'
                    }`}
                  >
                    🎙️ AI番組
                  </button>
                </div>
              )}
              {hasProgramContent && !isAIMode && (
                <button
                  onClick={() => setShowPlaylist(!showPlaylist)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    showPlaylist
                      ? 'bg-accent text-white'
                      : 'bg-bg-menu text-text-secondary hover:bg-hover-bg border border-border-light'
                  }`}
                >
                  📋 プレイリスト
                </button>
              )}
              {hasProgramContent && (
                <button
                  onClick={() => {
                    setShowPlaylist(false);
                    reset();
                  }}
                  className="px-3 py-1.5 bg-bg-menu hover:bg-hover-bg rounded-lg text-sm font-medium text-text-secondary border border-border-light transition-colors"
                >
                  リセット
                </button>
              )}
            </div>
          </div>
        </div>

        {/* プレイヤー（番組がある時のみ） */}
        {hasProgramContent && (
          <div className="max-w-4xl mx-auto">
            <Player />
          </div>
        )}
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* エラー表示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <p className="text-red-700 font-bold mb-2">⚠️ エラーが発生しました</p>
            <p className="text-red-600 text-sm">{error}</p>
            {error.includes('レート制限') && (
              <p className="text-yellow-700 text-xs mt-2">
                💡 ヒント: Gemini APIの無料枠には1日あたりのリクエスト制限があります。しばらく待つか、有料プランへの切り替えをご検討ください。
              </p>
            )}
            <button
              onClick={() => useStore.getState().setError(null)}
              className="mt-3 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
            >
              閉じる
            </button>
          </div>
        )}

        {/* ========================================
            状態1: セットアップ画面
            表示条件: 番組なし && 初期化中でない
        ======================================== */}
        {!hasProgramContent && !isInitializing && !isGeneratingScript && (
          <div className="space-y-6">
            {/* ヒーローセクション */}
            <div className="bg-bg-card rounded-xl p-8 text-center border border-border-light shadow-sm">
              <div className="text-5xl mb-3">🎙️</div>
              <h2 className="text-2xl font-bold mb-2 text-text-primary">X Timeline Radio</h2>
              <p className="text-text-secondary mb-8">
                Xのバズ投稿を、ラジオ風に読み上げます
              </p>

              {/* モード選択カード */}
              <div className="flex gap-4 justify-center mb-8 max-w-md mx-auto">
                {/* シンプルモード */}
                <button
                  onClick={() => handleModeChange('simple')}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                    !isAIMode
                      ? 'border-accent bg-accent/10'
                      : 'border-border-light bg-bg-menu hover:border-accent/50'
                  }`}
                >
                  <div className="text-3xl mb-2">📻</div>
                  <div className={`font-bold ${!isAIMode ? 'text-accent' : 'text-text-primary'}`}>
                    シンプル
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    投稿を順番に読み上げ
                  </div>
                </button>

                {/* AI番組モード */}
                <button
                  onClick={() => handleModeChange('ai-script')}
                  className={`flex-1 p-4 rounded-xl border-2 transition-all ${
                    isAIMode
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-border-light bg-bg-menu hover:border-purple-500/50'
                  }`}
                >
                  <div className="text-3xl mb-2">🎙️</div>
                  <div className={`font-bold ${isAIMode ? 'text-purple-600' : 'text-text-primary'}`}>
                    AI番組
                  </div>
                  <div className="text-xs text-text-secondary mt-1">
                    30分番組を自動生成
                  </div>
                </button>
              </div>

              {/* スタートボタン */}
              <button
                onClick={handleStartProgram}
                disabled={!hasApiKeys}
                className={`px-10 py-4 rounded-xl font-bold text-xl text-white shadow-lg transition-all hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed ${
                  isAIMode
                    ? 'bg-purple-600 hover:bg-purple-500'
                    : 'bg-accent hover:bg-accent-hover'
                }`}
              >
                ▶ 番組をスタート
              </button>

              {/* APIキー不足時の案内 */}
              {!hasApiKeys && (
                <p className="text-yellow-600 text-sm mt-4">
                  ⚠️ 下の設定でAPIキーを入力してください
                </p>
              )}

              {/* APIキー状況 */}
              {hasApiKeys && (
                <p className="text-green-600 text-sm mt-4">
                  ✅ 準備完了 - 約30分・7ジャンル・70投稿
                </p>
              )}
            </div>

            {/* 保存済み番組（AIモード時のみ） */}
            {isAIMode && savedScripts.length > 0 && (
              <div className="bg-bg-card rounded-xl p-4 border border-border-light shadow-sm">
                <h3 className="font-bold mb-4 flex items-center gap-2 text-text-primary">
                  <span>📚</span>
                  保存済み番組（{savedScripts.length}件）
                </h3>
                <div className="space-y-2">
                  {savedScripts.map((saved) => (
                    <div
                      key={saved.id}
                      className="flex items-center justify-between bg-bg-menu rounded-lg px-4 py-3 border border-border-light"
                    >
                      <div className="flex-1">
                        <div className="font-medium text-text-primary">{saved.title}</div>
                        <div className="text-sm text-text-secondary">
                          {saved.program.sections?.length || 0}セクション・
                          約{saved.program.totalDuration}分
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => loadScript(saved.id)}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          ▶ 再生
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('この番組を削除しますか？')) {
                              deleteSavedScript(saved.id);
                            }
                          }}
                          className="px-2 py-1.5 bg-bg-menu hover:bg-red-100 hover:text-red-600 rounded-lg text-sm border border-border-light transition-colors"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-text-disabled text-xs mt-3">
                  最大10件まで保存されます。古い番組は自動的に削除されます。
                </p>
              </div>
            )}

            {/* 設定（折りたたみ - APIキー未設定時は開く） */}
            <details open={!hasApiKeys} className="bg-bg-card rounded-xl border border-border-light shadow-sm">
              <summary className="p-4 cursor-pointer hover:bg-bg-menu rounded-xl font-medium text-text-primary transition-colors">
                ⚙️ 設定
              </summary>
              <div className="p-4 pt-0">
                <Settings />
              </div>
            </details>
          </div>
        )}

        {/* ========================================
            状態2: ローディング
            表示条件: 初期化中 or スクリプト生成中
        ======================================== */}
        {(isInitializing || isGeneratingScript) && (
          <div className="bg-bg-card rounded-xl p-8 border border-border-light shadow-sm">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4 animate-pulse">
                {isGeneratingScript ? '🎙️' : '📡'}
              </div>
              <h2 className="text-xl font-bold mb-2 text-text-primary">
                {isGeneratingScript ? 'AI番組を生成中...' : '番組を準備中...'}
              </h2>
              <p className="text-text-secondary">
                {isGeneratingScript
                  ? 'Gemini AIが30分番組のスクリプトを作成しています'
                  : '各ジャンルのバズ投稿を収集しています'}
              </p>
            </div>
            {program && program.segments && (
              <div className="space-y-2">
                {program.segments.map((seg) => (
                  <div key={seg.id} className="flex items-center gap-2 text-sm">
                    <span>{seg.icon}</span>
                    <span className="flex-1 text-text-primary">{seg.name}</span>
                    <span className={seg.posts.length > 0 ? 'text-green-600' : 'text-text-disabled'}>
                      {seg.posts.length > 0 ? `✅ ${seg.posts.length}件` : '⏳ 収集中...'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {isGeneratingScript && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-bg-menu rounded-lg border border-purple-400">
                  <div className="w-3 h-3 bg-purple-400 rounded-full animate-pulse"></div>
                  <span className="text-purple-500 text-sm">
                    オープニング・7つのコーナー・エンディングを構成中...
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================
            状態3: 番組再生中
            表示条件: 番組コンテンツあり
        ======================================== */}
        {hasProgramContent && (
          <>
            {/* AIモード: セクションインジケーター */}
            {isAIMode && aiProgram && <SectionIndicator />}

            {/* シンプルモード: プレイリスト */}
            {!isAIMode && showPlaylist && (
              <Playlist onClose={() => setShowPlaylist(false)} />
            )}

            {/* シンプルモード: 現在の投稿リスト */}
            {!isAIMode && <PostList />}

            {/* シンプルモード: セグメントリスト */}
            {!isAIMode && <SegmentList />}

            {/* AIモード: セクション一覧（スクリプト内容表示） */}
            {isAIMode && aiProgram && aiProgram.sections && (
              <div className="bg-bg-card rounded-xl p-4 border border-border-light shadow-sm">
                <h3 className="font-bold mb-4 flex items-center gap-2 text-text-primary">
                  <span>📝</span>
                  番組構成（クリックでスクリプト表示）
                </h3>
                <div className="space-y-2">
                  {aiProgram.sections.map((section, index) => (
                    <div key={section.id} className="rounded-lg overflow-hidden border border-border-light">
                      <div
                        className={`w-full text-left px-4 py-3 cursor-pointer transition-all ${
                          index === currentSectionIndex
                            ? 'bg-purple-600 text-white'
                            : index < currentSectionIndex
                              ? 'bg-bg-menu text-text-disabled'
                              : 'bg-bg-card hover:bg-bg-menu text-text-primary'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div
                            className="flex items-center gap-2 flex-1"
                            onClick={() => setExpandedSection(
                              expandedSection === section.id ? null : section.id
                            )}
                          >
                            <span className="text-xl">
                              {getSectionIconFromApp(section.type, section.genre)}
                            </span>
                            <span className="font-medium">{section.title}</span>
                            <span className="text-xs opacity-60">
                              {expandedSection === section.id ? '▼' : '▶'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-sm">
                            <button
                              onClick={() => {
                                const store = useStore.getState();
                                store.playAISectionFromPosition(index, 0);
                              }}
                              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                                index === currentSectionIndex
                                  ? 'bg-purple-500 hover:bg-purple-400 text-white'
                                  : 'bg-bg-menu hover:bg-hover-bg text-text-secondary border border-border-light'
                              }`}
                            >
                              ▶ 再生
                            </button>
                            <span className={index === currentSectionIndex ? 'text-purple-200' : 'text-text-disabled'}>
                              {section.chunks?.length || 0}パート
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* スクリプト内容 */}
                      {expandedSection === section.id && (
                        <div className="bg-bg-menu p-4 border-t border-border-light">
                          <div className="text-sm text-text-secondary whitespace-pre-wrap max-h-96 overflow-y-auto">
                            {section.chunks?.map((chunk, i) => (
                              <div key={i} className="mb-4">
                                <div className="text-xs text-purple-600 mb-1 font-medium">
                                  パート {i + 1}/{section.chunks?.length}
                                </div>
                                <div className="pl-3 border-l-2 border-purple-400 text-text-primary">
                                  {chunk}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 設定（折りたたみ） */}
            <details className="bg-bg-card rounded-xl border border-border-light shadow-sm">
              <summary className="p-4 cursor-pointer hover:bg-bg-menu rounded-xl font-medium text-text-primary transition-colors">
                ⚙️ 設定
              </summary>
              <div className="p-4 pt-0">
                <Settings />
              </div>
            </details>
          </>
        )}
      </main>

      {/* フッター */}
      <footer className="text-center text-text-disabled text-sm py-8">
        X Timeline Radio v2 - Powered by Grok & Gemini
      </footer>
    </div>
  );
}
