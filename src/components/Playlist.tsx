import { useStore } from '../store/useStore';

const GENRE_INFO: Record<string, { name: string; icon: string }> = {
  trending: { name: '今バズってる', icon: '🔥' },
  politics: { name: '政治', icon: '🏛️' },
  economy: { name: '経済', icon: '💹' },
  lifestyle: { name: '暮らし', icon: '🏠' },
  entertainment: { name: 'エンタメ', icon: '🎬' },
  science: { name: '科学・テック', icon: '🔬' },
  international: { name: '国際', icon: '🌍' },
};

// 現在のセグメントの投稿のみ表示するモード
export function PostList() {
  const { program, currentSegmentIndex, currentPostIndex, isPlaying, playFromPosition } = useStore();

  if (!program || program.segments.length === 0) return null;

  const segment = program.segments[currentSegmentIndex];
  if (!segment || segment.posts.length === 0) return null;

  const genreInfo = GENRE_INFO[segment.genre] || { name: segment.genre, icon: '📰' };

  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden">
      {/* セグメントヘッダー */}
      <div className="px-4 py-3 bg-slate-700/50 flex items-center gap-2">
        <span className="text-lg">{genreInfo.icon}</span>
        <span className="font-bold">{genreInfo.name}</span>
        <span className="text-slate-400 text-sm">({segment.posts.length}件)</span>
        {isPlaying && (
          <span className="ml-auto text-green-400 text-sm animate-pulse">▶ 再生中</span>
        )}
      </div>

      {/* 投稿リスト */}
      <div className="divide-y divide-slate-700/50 max-h-[50vh] overflow-y-auto">
        {segment.posts.map((post, postIdx) => {
          const isCurrentPost = postIdx === currentPostIndex;
          const isPastPost = postIdx < currentPostIndex;

          return (
            <div
              key={post.id}
              className={`px-4 py-3 flex items-start gap-3 cursor-pointer transition-all ${
                isCurrentPost
                  ? 'bg-blue-900/50 border-l-4 border-blue-500'
                  : isPastPost
                    ? 'bg-slate-800/50 opacity-60'
                    : 'hover:bg-slate-700/30'
              }`}
              onClick={() => playFromPosition(currentSegmentIndex, postIdx)}
            >
              {/* 番号 */}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                isCurrentPost
                  ? 'bg-blue-600'
                  : isPastPost
                    ? 'bg-slate-600'
                    : 'bg-slate-700'
              }`}>
                {postIdx + 1}
              </div>

              {/* 投稿内容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-blue-400 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{post.author.username}
                  </a>
                  {post.author.name !== post.author.username && (
                    <span className="text-slate-400 text-sm truncate">
                      ({post.author.name})
                    </span>
                  )}
                  {isCurrentPost && isPlaying && (
                    <span className="text-blue-400 text-xs animate-pulse">♪</span>
                  )}
                </div>
                <p className="text-slate-200 break-words">{post.text}</p>
                <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
                  {post.metrics.likes > 0 && (
                    <span>❤️ {formatNumber(post.metrics.likes)}</span>
                  )}
                  {post.metrics.retweets > 0 && (
                    <span>🔄 {formatNumber(post.metrics.retweets)}</span>
                  )}
                  {post.metrics.replies > 0 && (
                    <span>💬 {formatNumber(post.metrics.replies)}</span>
                  )}
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline ml-auto text-xs"
                    onClick={(e) => e.stopPropagation()}
                  >
                    🔗 元投稿
                  </a>
                </div>
                {post.buzzReason && (
                  <p className="text-xs text-yellow-500 mt-1">
                    🔥 {post.buzzReason}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 全セグメント表示モード（モーダル/オーバーレイ用）
interface PlaylistProps {
  onClose: () => void;
}

export function Playlist({ onClose }: PlaylistProps) {
  const { program, currentSegmentIndex, currentPostIndex, isPlaying, playFromPosition } = useStore();

  if (!program || program.segments.length === 0) {
    return (
      <div className="bg-slate-800 rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">📋 全プレイリスト</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <p className="text-slate-400 text-sm">番組を開始すると、ここにプレイリストが表示されます。</p>
      </div>
    );
  }

  // 総投稿数を計算
  const totalPosts = program.segments.reduce((sum, seg) => sum + seg.posts.length, 0);

  return (
    <div className="bg-slate-800 rounded-lg p-6 max-h-[70vh] overflow-hidden flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold">📋 全プレイリスト</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">全{totalPosts}件</span>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl">✕</button>
        </div>
      </div>

      <div className="overflow-y-auto flex-1 space-y-4">
        {program.segments.map((segment, segIdx) => {
          const genreInfo = GENRE_INFO[segment.genre] || { name: segment.genre, icon: '📰' };
          const isCurrentSegment = segIdx === currentSegmentIndex;

          return (
            <div key={segment.id} className="border border-slate-700 rounded-lg overflow-hidden">
              {/* セグメントヘッダー */}
              <div className={`px-4 py-2 flex items-center gap-2 ${
                isCurrentSegment ? 'bg-blue-900/50' : 'bg-slate-700/50'
              }`}>
                <span className="text-lg">{genreInfo.icon}</span>
                <span className="font-bold">{genreInfo.name}</span>
                <span className="text-slate-400 text-sm">({segment.posts.length}件)</span>
                {isCurrentSegment && isPlaying && (
                  <span className="ml-auto text-green-400 text-sm animate-pulse">▶ 再生中</span>
                )}
              </div>

              {/* 投稿リスト */}
              <div className="divide-y divide-slate-700/50">
                {segment.posts.map((post, postIdx) => {
                  const isCurrentPost = isCurrentSegment && postIdx === currentPostIndex;
                  const isPastPost = segIdx < currentSegmentIndex ||
                    (isCurrentSegment && postIdx < currentPostIndex);

                  return (
                    <div
                      key={post.id}
                      className={`px-4 py-3 flex items-start gap-3 cursor-pointer transition-colors ${
                        isCurrentPost
                          ? 'bg-green-900/30'
                          : isPastPost
                            ? 'bg-slate-800/50 opacity-60'
                            : 'hover:bg-slate-700/30'
                      }`}
                      onClick={() => playFromPosition(segIdx, postIdx)}
                    >
                      {/* 番号 */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        isCurrentPost
                          ? 'bg-green-600'
                          : isPastPost
                            ? 'bg-slate-600'
                            : 'bg-slate-700'
                      }`}>
                        {postIdx + 1}
                      </div>

                      {/* 投稿内容 */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-bold text-sm truncate text-blue-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            @{post.author.username}
                          </a>
                          {isCurrentPost && isPlaying && (
                            <span className="text-green-400 text-xs">▶</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-300 line-clamp-2">{post.text}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                          <span>❤️ {formatNumber(post.metrics.likes)}</span>
                          <span>🔄 {formatNumber(post.metrics.retweets)}</span>
                          <span>💬 {formatNumber(post.metrics.replies)}</span>
                          <a
                            href={post.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:underline ml-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            🔗 元投稿
                          </a>
                        </div>
                      </div>

                      {/* 再生ボタン */}
                      <button
                        className={`px-3 py-1 rounded text-xs ${
                          isCurrentPost
                            ? 'bg-green-600 text-white'
                            : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          playFromPosition(segIdx, postIdx);
                        }}
                      >
                        {isCurrentPost && isPlaying ? '再生中' : 'ここから'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}
