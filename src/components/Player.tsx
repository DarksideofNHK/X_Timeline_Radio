import { useState, useCallback } from 'react';
import { useStore, unlockAudio } from '../store/useStore';

// ボタン状態の型定義
type ButtonState = 'idle' | 'loading' | 'playing' | 'disabled';

export function Player() {
  // 二重クリック防止用の処理中フラグ
  const [isProcessing, setIsProcessing] = useState(false);

  const {
    // 共通
    isPlaying,
    isPreloading,
    stopPlayback,
    audioSettings,
    // シンプルモード
    program,
    currentSegmentIndex,
    currentPostIndex,
    startPlayback,
    nextSegment,
    // AI番組モード
    aiProgram,
    currentSectionIndex,
    currentChunkIndex,
    playAIScript,
    playAISectionFromPosition,
  } = useStore();

  const isAIMode = audioSettings.programMode === 'ai-script';

  // モードに応じたコンテンツ存在チェック
  if (isAIMode) {
    if (!aiProgram || !aiProgram.sections?.length) return null;
  } else {
    if (!program) return null;
  }

  // AI番組モード
  if (isAIMode && aiProgram) {
    const currentSection = aiProgram.sections[currentSectionIndex];
    const totalSections = aiProgram.sections.length;
    const totalChunks = aiProgram.sections.reduce((sum, s) => sum + (s.chunks?.length || 0), 0);
    const completedChunks = aiProgram.sections
      .slice(0, currentSectionIndex)
      .reduce((sum, s) => sum + (s.chunks?.length || 0), 0) + currentChunkIndex;

    const progress = totalChunks > 0 ? Math.round((completedChunks / totalChunks) * 100) : 0;

    const handlePlayPause = useCallback(async () => {
      // 二重クリック防止
      if (isProcessing) {
        console.log('[Player] Already processing, ignoring click');
        return;
      }

      console.log('[Player] Play button clicked, isPlaying:', isPlaying);

      if (isPlaying) {
        console.log('[Player] Stopping playback');
        stopPlayback();
        return;
      }

      // 再生開始処理
      setIsProcessing(true);
      try {
        console.log('[Player] Starting playback...');
        // モバイルブラウザ用: オーディオ権限を取得
        await unlockAudio();
        console.log('[Player] Audio unlock completed');
        // 再生開始
        await playAIScript();
      } catch (e) {
        console.error('[Player] Playback error:', e);
      } finally {
        setIsProcessing(false);
      }
    }, [isPlaying, isProcessing, stopPlayback, playAIScript]);

    const handleNextSection = useCallback(async () => {
      // 二重クリック防止
      if (isProcessing) return;
      if (currentSectionIndex >= totalSections - 1) return;

      console.log('[Player] Next section button clicked');
      setIsProcessing(true);
      try {
        await unlockAudio();
        console.log('[Player] Audio unlock completed for next section');
        await playAISectionFromPosition(currentSectionIndex + 1, 0);
      } catch (e) {
        console.error('[Player] Next section error:', e);
      } finally {
        setIsProcessing(false);
      }
    }, [isProcessing, currentSectionIndex, totalSections, playAISectionFromPosition]);

    return (
      <div className="p-4">
        <div className="flex items-center gap-4">
          {/* 再生ボタン */}
          <button
            onClick={handlePlayPause}
            disabled={isPlaying || isPreloading || isProcessing}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 shadow-lg transition-all ${
              isPlaying || isPreloading || isProcessing
                ? 'bg-gray-400 cursor-not-allowed opacity-50'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
            title={isProcessing ? '処理中...' : isPreloading ? '読み込み中...' : '再生'}
          >
            {isProcessing ? '⏳' : isPreloading ? '⏳' : '▶️'}
          </button>

          {/* 停止ボタン */}
          <button
            onClick={() => stopPlayback()}
            disabled={!isPlaying}
            className={`w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 shadow-lg transition-all ${
              !isPlaying
                ? 'bg-gray-400 cursor-not-allowed opacity-50'
                : 'bg-red-600 hover:bg-red-500 text-white'
            }`}
            title="停止"
          >
            ⏹️
          </button>

          {/* メイン情報 */}
          <div className="flex-1 min-w-0">
            {/* ステータス行 */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isPreloading ? (
                  <span className="flex items-center gap-1.5 text-yellow-600 text-sm font-bold">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                    読み込み中
                  </span>
                ) : isPlaying ? (
                  <span className="flex items-center gap-1.5 text-green-600 text-sm font-bold">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    ON AIR
                  </span>
                ) : (
                  <span className="text-text-disabled text-sm">停止中</span>
                )}
                <span className="text-border-light">|</span>
                <span className="text-sm truncate text-text-primary">
                  {currentSection?.title || 'セクション'}
                </span>
              </div>
              <span className="text-sm text-text-secondary">
                {currentSectionIndex + 1}/{totalSections}
              </span>
            </div>

            {/* 進捗バー */}
            <div>
              <div className="flex justify-between text-xs text-text-secondary mb-1">
                <span>🎙️ AI番組</span>
                <span>{progress}%</span>
              </div>
              <div className="h-1.5 bg-bg-menu rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* 次のセクションボタン */}
          <button
            onClick={handleNextSection}
            disabled={currentSectionIndex >= totalSections - 1 || isProcessing}
            className="w-10 h-10 bg-bg-menu hover:bg-hover-bg disabled:opacity-50 disabled:cursor-not-allowed rounded-full flex items-center justify-center text-lg flex-shrink-0 border border-border-light transition-colors"
            title={isProcessing ? '処理中...' : '次のセクション'}
          >
            {isProcessing ? '⏳' : '⏭️'}
          </button>
        </div>
      </div>
    );
  }

  // シンプルモード
  if (!program) return null;

  const currentSegment = program.segments[currentSegmentIndex];
  const currentSegmentPostCount = currentSegment?.posts?.length || 0;

  const hasStarted = isPlaying || currentPostIndex > 0 || currentSegmentIndex > 0;

  const currentPostNumber = hasStarted
    ? program.segments
        .slice(0, currentSegmentIndex)
        .reduce((sum, seg) => sum + seg.posts.length, 0) + currentPostIndex + 1
    : 0;

  const currentPostInSegment = hasStarted ? currentPostIndex + 1 : 0;

  const progress = program.totalPosts > 0 && hasStarted
    ? Math.round((currentPostNumber / program.totalPosts) * 100)
    : 0;

  // シンプルモードの再生ハンドラー
  const handleSimplePlay = useCallback(async () => {
    // 二重クリック防止
    if (isProcessing) {
      console.log('[Player] Simple mode: Already processing, ignoring click');
      return;
    }

    console.log('[Player] Simple play button clicked');
    setIsProcessing(true);
    try {
      // モバイルブラウザ用: オーディオ権限を取得
      await unlockAudio();
      console.log('[Player] Audio unlock completed');
      // 再生開始
      startPlayback();
    } catch (e) {
      console.error('[Player] Simple playback error:', e);
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, startPlayback]);

  return (
    <div className="p-4">
      <div className="flex items-center gap-4">
        {/* 再生ボタン */}
        <button
          onClick={handleSimplePlay}
          disabled={isPlaying || isProcessing}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 shadow-lg transition-all ${
            isPlaying || isProcessing
              ? 'bg-gray-400 cursor-not-allowed opacity-50'
              : 'bg-accent hover:bg-accent-hover text-white'
          }`}
          title={isProcessing ? '処理中...' : '再生'}
        >
          {isProcessing ? '⏳' : '▶️'}
        </button>

        {/* 停止ボタン */}
        <button
          onClick={() => stopPlayback()}
          disabled={!isPlaying}
          className={`w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0 shadow-lg transition-all ${
            !isPlaying
              ? 'bg-gray-400 cursor-not-allowed opacity-50'
              : 'bg-red-600 hover:bg-red-500 text-white'
          }`}
          title="停止"
        >
          ⏹️
        </button>

        {/* メイン情報 */}
        <div className="flex-1 min-w-0">
          {/* ステータス行 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {isPlaying ? (
                <span className="flex items-center gap-1.5 text-green-600 text-sm font-bold">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  ON AIR
                </span>
              ) : (
                <span className="text-text-disabled text-sm">停止中</span>
              )}
              <span className="text-border-light">|</span>
              <span className="text-sm text-text-primary">
                {currentSegment?.icon} {currentSegment?.name}
              </span>
            </div>
            <span className="text-sm text-text-secondary">
              {currentPostInSegment}/{currentSegmentPostCount}件目
            </span>
          </div>

          {/* 進捗バー */}
          <div>
            <div className="flex justify-between text-xs text-text-secondary mb-1">
              <span>📊 {currentPostNumber} / {program.totalPosts} Posts</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-bg-menu rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* スキップボタン */}
        <button
          onClick={nextSegment}
          className="w-10 h-10 bg-bg-menu hover:bg-hover-bg rounded-full flex items-center justify-center text-lg flex-shrink-0 border border-border-light transition-colors"
          title="次のセグメント"
        >
          ⏭️
        </button>
      </div>
    </div>
  );
}
