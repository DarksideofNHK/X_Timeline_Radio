import { useStore } from '../store/useStore';

export function Player() {
  const {
    program,
    isPlaying,
    currentSegmentIndex,
    currentPostIndex,
    startPlayback,
    stopPlayback,
    nextSegment,
  } = useStore();

  if (!program) return null;

  const currentSegment = program.segments[currentSegmentIndex];
  const currentSegmentPostCount = currentSegment?.posts?.length || 0;

  // 再生中のみ進捗を表示（再生前は0）
  const hasStarted = isPlaying || currentPostIndex > 0 || currentSegmentIndex > 0;

  // 完了したセグメントの投稿数 + 現在の投稿位置（1-indexed）
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
        {/* 再生コントロール */}
        <button
          onClick={isPlaying ? stopPlayback : startPlayback}
          className="w-14 h-14 bg-blue-600 hover:bg-blue-500 rounded-full flex items-center justify-center text-2xl flex-shrink-0"
        >
          {isPlaying ? '⏹️' : '▶️'}
        </button>

        {/* メイン情報 */}
        <div className="flex-1 min-w-0">
          {/* ステータス行 */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {isPlaying ? (
                <span className="flex items-center gap-1.5 text-green-400 text-sm font-bold">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  ON AIR
                </span>
              ) : (
                <span className="text-slate-400 text-sm">停止中</span>
              )}
              <span className="text-slate-500">|</span>
              <span className="text-sm">
                {currentSegment?.icon} {currentSegment?.name}
              </span>
            </div>
            <span className="text-sm text-slate-400">
              {currentPostInSegment}/{currentSegmentPostCount}件目
            </span>
          </div>

          {/* 進捗バー */}
          <div>
            <div className="flex justify-between text-xs text-slate-400 mb-1">
              <span>📊 {currentPostNumber} / {program.totalPosts} Posts</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* スキップボタン */}
        <button
          onClick={nextSegment}
          className="w-10 h-10 bg-slate-700 hover:bg-slate-600 rounded-full flex items-center justify-center text-lg flex-shrink-0"
          title="次のセグメント"
        >
          ⏭️
        </button>
      </div>
    </div>
  );
}
