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
    <div className="bg-bg-card rounded-xl p-4 border border-border-light shadow-sm">
      <h3 className="text-sm font-bold text-text-secondary mb-3">
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
              className={`flex items-center gap-3 p-2 rounded-lg ${
                isCurrent
                  ? 'bg-accent/10 border border-accent'
                  : isDone
                    ? 'bg-bg-menu'
                    : isError
                      ? 'bg-red-50 border border-red-200'
                      : 'bg-bg-menu/50'
              }`}
            >
              <span className="text-lg">{STATUS_ICONS[segment.status]}</span>
              <span className="text-lg">{segment.icon}</span>
              <span className={`text-text-primary ${isCurrent ? 'font-bold' : ''}`}>{segment.name}</span>
              <span className="text-text-disabled text-sm">
                ({segment.posts.length}件)
              </span>
              {isCurrent && (
                <span className="ml-auto text-accent text-sm font-medium">
                  ◀ {STATUS_LABELS[segment.status]}
                </span>
              )}
              {!isCurrent && segment.status !== 'pending' && (
                <span className="ml-auto text-text-disabled text-sm">
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
