import { useState } from 'react';
import { useStore } from './store/useStore';
import { Settings } from './components/Settings';
import { Player } from './components/Player';
import { SegmentList } from './components/SegmentList';
import { PostList, Playlist } from './components/Playlist';
import { SectionIndicator } from './components/SectionIndicator';
import { formatScriptDate } from './lib/scriptStorage';

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
  const [settingsConfirmed, setSettingsConfirmed] = useState(false);

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

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* 固定ヘッダー（タイトル + プレイヤー） */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-20">
        {/* タイトル行 */}
        <div className="p-4 border-b border-slate-700/50">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <span className="text-3xl">🎙️</span>
              X Timeline Radio
              <span className="text-sm font-normal text-slate-400">v2</span>
            </h1>
            <div className="flex items-center gap-2">
              {/* モード切り替え（番組がある時に表示） */}
              {hasProgramContent && (
                <div className="flex rounded overflow-hidden">
                  <button
                    onClick={() => {
                      if (isAIMode) {
                        stopPlayback();
                        setAudioSettings({ programMode: 'simple' });
                      }
                    }}
                    className={`px-3 py-1 text-sm ${
                      !isAIMode
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
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
                    className={`px-3 py-1 text-sm ${
                      isAIMode
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    🎙️ AI番組
                  </button>
                </div>
              )}
              {hasProgramContent && !isAIMode && (
                <button
                  onClick={() => setShowPlaylist(!showPlaylist)}
                  className={`px-3 py-1 rounded text-sm ${
                    showPlaylist
                      ? 'bg-blue-600 hover:bg-blue-500'
                      : 'bg-slate-700 hover:bg-slate-600'
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
                  className="px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded text-sm"
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
          <div className="bg-red-900/50 border border-red-700 rounded-lg p-4">
            <p className="text-red-300 font-bold mb-2">⚠️ エラーが発生しました</p>
            <p className="text-red-200 text-sm">{error}</p>
            {error.includes('レート制限') && (
              <p className="text-yellow-300 text-xs mt-2">
                💡 ヒント: Gemini APIの無料枠には1日あたりのリクエスト制限があります。しばらく待つか、有料プランへの切り替えをご検討ください。
              </p>
            )}
            <button
              onClick={() => useStore.getState().setError(null)}
              className="mt-3 px-3 py-1 bg-red-700 hover:bg-red-600 rounded text-sm"
            >
              閉じる
            </button>
          </div>
        )}

        {/* 初期設定 (番組生成開始ボタンが押されるまで表示) */}
        {!settingsConfirmed && (
          <div className="space-y-4">
            {/* 番組生成開始ボタン（APIキーが揃っている時に上部に表示） */}
            {hasApiKeys && (
              <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 border border-purple-500/50 rounded-lg p-6 text-center">
                <div className="text-4xl mb-3">🎙️</div>
                <h2 className="text-xl font-bold mb-2">準備完了！</h2>
                <p className="text-slate-300 mb-4">
                  Xのバズ投稿を集めて、{isAIMode ? 'AIが番組スクリプトを生成' : 'ラジオ風に読み上げ'}ます
                </p>
                <button
                  onClick={() => {
                    setSettingsConfirmed(true);
                    handleStartProgram();
                  }}
                  className={`px-8 py-4 rounded-lg font-bold text-xl ${
                    isAIMode
                      ? 'bg-purple-600 hover:bg-purple-500'
                      : 'bg-blue-600 hover:bg-blue-500'
                  }`}
                >
                  {isAIMode ? '🎙️ AI番組を生成開始' : '📻 番組を生成開始'}
                </button>
              </div>
            )}

            {/* APIキー未設定の案内 */}
            {!hasApiKeys && (
              <div className="bg-slate-800 rounded-lg p-4 text-center">
                <p className="text-slate-400">
                  {isAIMode
                    ? '3つのAPIキー（Grok, Gemini, OpenAI）を入力してください'
                    : '2つのAPIキー（Grok, OpenAI）を入力してください'}
                </p>
              </div>
            )}

            {/* 設定パネル */}
            <Settings />
          </div>
        )}

        {/* 番組未開始 - 設定完了済み、APIキーあり、番組なし、初期化中でもない */}
        {settingsConfirmed && hasApiKeys && !hasProgramContent && !isInitializing && (
          <div className="bg-slate-800 rounded-lg p-8 text-center">
            <div className="text-6xl mb-4">📻</div>
            <h2 className="text-xl font-bold mb-2">番組を開始</h2>
            <p className="text-slate-400 mb-6">
              Xのバズ投稿を集めて、ラジオ風に読み上げます
            </p>
            <button
              onClick={handleStartProgram}
              className={`px-6 py-3 rounded-lg font-bold text-lg ${
                isAIMode
                  ? 'bg-purple-600 hover:bg-purple-500'
                  : 'bg-blue-600 hover:bg-blue-500'
              }`}
            >
              {isAIMode ? '🎙️ AI番組スタート' : '📻 番組スタート'}
            </button>
            <p className="text-slate-500 text-sm mt-4">
              約30分・7ジャンル・70投稿
            </p>
          </div>
        )}

        {/* 保存済みスクリプト一覧（AIモードで番組がない時に表示） */}
        {isAIMode && settingsConfirmed && hasApiKeys && !hasProgramContent && !isInitializing && savedScripts.length > 0 && (
          <div className="bg-slate-800 rounded-lg p-4">
            <h3 className="font-bold mb-4 flex items-center gap-2">
              <span>📚</span>
              保存済み番組（{savedScripts.length}件）
            </h3>
            <div className="space-y-2">
              {savedScripts.map((saved) => (
                <div
                  key={saved.id}
                  className="flex items-center justify-between bg-slate-700 rounded-lg px-4 py-3"
                >
                  <div className="flex-1">
                    <div className="font-medium">{saved.title}</div>
                    <div className="text-sm text-slate-400">
                      {saved.program.sections?.length || 0}セクション・
                      約{saved.program.totalDuration}分
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadScript(saved.id)}
                      className="px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm"
                    >
                      ▶ 再生
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('この番組を削除しますか？')) {
                          deleteSavedScript(saved.id);
                        }
                      }}
                      className="px-2 py-1 bg-slate-600 hover:bg-red-600 rounded text-sm"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-slate-500 text-xs mt-3">
              最大10件まで保存されます。古い番組は自動的に削除されます。
            </p>
          </div>
        )}

        {/* 初期化中 */}
        {(isInitializing || isGeneratingScript) && (
          <div className="bg-slate-800 rounded-lg p-8">
            <div className="text-center mb-6">
              <div className="text-6xl mb-4 animate-pulse">
                {isGeneratingScript ? '🎙️' : '📡'}
              </div>
              <h2 className="text-xl font-bold mb-2">
                {isGeneratingScript ? 'AI番組を生成中...' : '番組を準備中...'}
              </h2>
              <p className="text-slate-400">
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
                    <span className="flex-1">{seg.name}</span>
                    <span className={seg.posts.length > 0 ? 'text-green-400' : 'text-slate-500'}>
                      {seg.posts.length > 0 ? `✅ ${seg.posts.length}件` : '⏳ 収集中...'}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {isGeneratingScript && (
              <div className="mt-6 text-center">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-900/50 rounded-lg">
                  <div className="w-3 h-3 bg-purple-400 rounded-full animate-pulse"></div>
                  <span className="text-purple-300 text-sm">
                    オープニング・7つのコーナー・エンディングを構成中...
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 番組コンテンツ（番組が存在する限り常に表示） */}
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
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="font-bold mb-4 flex items-center gap-2">
                  <span>📝</span>
                  番組構成（クリックでスクリプト表示）
                </h3>
                <div className="space-y-2">
                  {aiProgram.sections.map((section, index) => (
                    <div key={section.id} className="rounded-lg overflow-hidden">
                      <div
                        className={`w-full text-left px-4 py-3 cursor-pointer transition-all ${
                          index === currentSectionIndex
                            ? 'bg-purple-600 text-white'
                            : index < currentSectionIndex
                              ? 'bg-slate-700/50 text-slate-400'
                              : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
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
                              className="px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded text-xs"
                            >
                              ▶ 再生
                            </button>
                            <span className="text-slate-400">
                              {section.chunks?.length || 0}パート
                            </span>
                          </div>
                        </div>
                      </div>
                      {/* スクリプト内容 */}
                      {expandedSection === section.id && (
                        <div className="bg-slate-900 p-4 border-t border-slate-700">
                          <div className="text-sm text-slate-300 whitespace-pre-wrap max-h-96 overflow-y-auto">
                            {section.chunks?.map((chunk, i) => (
                              <div key={i} className="mb-4">
                                <div className="text-xs text-purple-400 mb-1">
                                  パート {i + 1}/{section.chunks?.length}
                                </div>
                                <div className="pl-2 border-l-2 border-purple-600">
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
          </>
        )}

        {/* 設定 (APIキー設定済み時は折りたたみ) */}
        {hasApiKeys && (
          <details className="bg-slate-800 rounded-lg">
            <summary className="p-4 cursor-pointer hover:bg-slate-700 rounded-lg">
              ⚙️ 設定
            </summary>
            <div className="p-4 pt-0">
              <Settings />
            </div>
          </details>
        )}
      </main>

      {/* フッター */}
      <footer className="text-center text-slate-500 text-sm py-8">
        X Timeline Radio v2 - Powered by Grok & Gemini
      </footer>
    </div>
  );
}
