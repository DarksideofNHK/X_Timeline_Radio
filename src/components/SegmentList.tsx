import { useStore } from '../store/useStore';
import type { SegmentStatus } from '../types';

const STATUS_ICONS: Record<SegmentStatus, string> = {
  pending: '⬚',
  collecting: '📡',
  scripting: '📝',
  generating: '🎤',
  ready: '✅',
  playing: '🎵',
  done: '✅',
  error: '❌',
};

const STATUS_LABELS: Record<SegmentStatus, string> = {
  pending: '待機',
  collecting: '収集中',
  scripting: 'スクリプト生成中',
  generating: '音声生成中',
  ready: '準備完了',
  playing: '再生中',
  done: '完了',
  error: 'エラー',
};

export function SegmentList() {
  const { program, currentSegmentIndex } = useStore();

  if (!program) return null;

  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <h3 className="text-sm font-bold text-slate-400 mb-3">
        📋 セグメント一覧
      </h3>
      <div className="space-y-2">
        {program.segments.map((segment, index) => {
          const isCurrent = index === currentSegmentIndex;
          const isDone = segment.status === 'done';
          const isError = segment.status === 'error';

          return (
            <div
              key={segment.id}
              className={`flex items-center gap-3 p-2 rounded ${
                isCurrent
                  ? 'bg-blue-900/50 border border-blue-700'
                  : isDone
                    ? 'bg-slate-700/50'
                    : isError
                      ? 'bg-red-900/30'
                      : 'bg-slate-700/30'
              }`}
            >
              <span className="text-lg">{STATUS_ICONS[segment.status]}</span>
              <span className="text-lg">{segment.icon}</span>
              <span className={isCurrent ? 'font-bold' : ''}>{segment.name}</span>
              <span className="text-slate-500 text-sm">
                ({segment.posts.length}件)
              </span>
              {isCurrent && (
                <span className="ml-auto text-blue-400 text-sm">
                  ◀ {STATUS_LABELS[segment.status]}
                </span>
              )}
              {!isCurrent && segment.status !== 'pending' && (
                <span className="ml-auto text-slate-500 text-sm">
                  {STATUS_LABELS[segment.status]}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
