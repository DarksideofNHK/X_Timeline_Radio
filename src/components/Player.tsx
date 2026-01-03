import { useStore } from '../store/useStore';

export function Player() {
  const {
    // 共通
    isPlaying,
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

    const handlePlayPause = () => {
      if (isPlaying) {
        stopPlayback();
      } else {
        playAIScript();
      }
    };

    const handleNextSection = () => {
      if (currentSectionIndex < totalSections - 1) {
        playAISectionFromPosition(currentSectionIndex + 1, 0);
      }
    };

    return (
      <div className="p-4">
        <div className="flex items-center gap-4">
          {/* 再生/停止ボタン */}
          <button
            onClick={handlePlayPause}
            className="w-14 h-14 bg-purple-600 hover:bg-purple-500 rounded-full flex items-center justify-center text-2xl flex-shrink-0 text-white shadow-lg transition-all"
          >
            {isPlaying ? '⏸️' : '▶️'}
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
            disabled={currentSectionIndex >= totalSections - 1}
            className="w-10 h-10 bg-bg-menu hover:bg-hover-bg disabled:opacity-50 disabled:cursor-not-allowed rounded-full flex items-center justify-center text-lg flex-shrink-0 border border-border-light transition-colors"
            title="次のセクション"
          >
            ⏭️
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

  return (
    <div className="p-4">
      <div className="flex items-center gap-4">
        {/* 再生/停止ボタン */}
        <button
          onClick={isPlaying ? stopPlayback : startPlayback}
          className="w-14 h-14 bg-accent hover:bg-accent-hover rounded-full flex items-center justify-center text-2xl flex-shrink-0 text-white shadow-lg transition-all"
        >
          {isPlaying ? '⏸️' : '▶️'}
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
