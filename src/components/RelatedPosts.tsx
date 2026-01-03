import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import type { RelatedPost } from '../types';

const POSTS_PER_PAGE = 10;

// X埋め込みウィジェットのスクリプトをロード
function loadTwitterWidget() {
  if ((window as any).twttr) {
    return Promise.resolve((window as any).twttr);
  }

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    script.onload = () => {
      resolve((window as any).twttr);
    };
    document.head.appendChild(script);
  });
}

interface XEmbedProps {
  statusId: string;
}

function XEmbed({ statusId }: XEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const embedTweet = async () => {
      if (!containerRef.current) return;

      try {
        const twttr = await loadTwitterWidget();
        if (!mounted) return;

        // コンテナをクリア
        containerRef.current.innerHTML = '';

        // 埋め込みを作成
        await twttr.widgets.createTweet(statusId, containerRef.current, {
          theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
          conversation: 'none',
          cards: 'hidden',
          width: 400,
        });

        if (mounted) {
          setLoading(false);
        }
      } catch (e) {
        console.error('[XEmbed] Failed to embed:', e);
        if (mounted) {
          setLoading(false);
          setError(true);
        }
      }
    };

    embedTweet();

    return () => {
      mounted = false;
    };
  }, [statusId]);

  if (error) {
    return (
      <a
        href={`https://x.com/i/status/${statusId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block p-4 bg-bg-menu rounded-lg border border-border-light hover:border-accent transition-colors"
      >
        <div className="text-text-secondary text-sm">
          埋め込みを読み込めませんでした
        </div>
        <div className="text-accent text-xs mt-1">
          クリックして元投稿を開く →
        </div>
      </a>
    );
  }

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-menu rounded-lg border border-border-light min-h-[100px]">
          <div className="text-text-secondary text-sm">読み込み中...</div>
        </div>
      )}
      <div ref={containerRef} className={loading ? 'invisible' : 'visible'} />
    </div>
  );
}

export function RelatedPosts() {
  const { collectedAnnotations } = useStore();
  const [currentPage, setCurrentPage] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  if (!collectedAnnotations || collectedAnnotations.length === 0) {
    return null;
  }

  const totalPages = Math.ceil(collectedAnnotations.length / POSTS_PER_PAGE);
  const startIndex = currentPage * POSTS_PER_PAGE;
  const endIndex = Math.min(startIndex + POSTS_PER_PAGE, collectedAnnotations.length);
  const currentPosts = collectedAnnotations.slice(startIndex, endIndex);

  return (
    <div className="bg-bg-card rounded-xl border border-border-light overflow-hidden">
      {/* ヘッダー（折りたたみトグル） */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-bg-menu transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <span className="font-medium">関連投稿を見る</span>
          <span className="text-text-secondary text-sm">
            ({collectedAnnotations.length}件)
          </span>
        </div>
        <span className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}>
          ▼
        </span>
      </button>

      {/* コンテンツ */}
      {isExpanded && (
        <div className="border-t border-border-light">
          {/* 説明 */}
          <div className="p-4 bg-bg-menu/50 text-sm text-text-secondary">
            Grok APIが検索時に参照した実際のX投稿です。
            埋め込みが表示されない場合は、リンクをクリックして確認できます。
          </div>

          {/* 投稿リスト */}
          <div className="p-4 space-y-4">
            {currentPosts.map((post) => (
              <div key={post.statusId} className="relative">
                <XEmbed statusId={post.statusId} />
                <a
                  href={post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute top-2 right-2 bg-bg-card/80 backdrop-blur px-2 py-1 rounded text-xs text-accent hover:underline"
                >
                  🔗 開く
                </a>
              </div>
            ))}
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-border-light flex items-center justify-between">
              <button
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="px-4 py-2 bg-bg-menu rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bg-card transition-colors"
              >
                ← 前へ
              </button>

              <div className="text-sm text-text-secondary">
                {startIndex + 1} - {endIndex} / {collectedAnnotations.length}件
                <span className="mx-2">|</span>
                ページ {currentPage + 1} / {totalPages}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={currentPage >= totalPages - 1}
                className="px-4 py-2 bg-bg-menu rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-bg-card transition-colors"
              >
                次へ →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
