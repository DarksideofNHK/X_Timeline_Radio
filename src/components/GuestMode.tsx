import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { ShowTypeId } from '../types';

interface GuestUsage {
  used: number;
  remaining: number;
  limit: number;
  costPerGeneration: string;
  message: string;
}

interface GuestResult {
  success: boolean;
  showType: string;
  script: any;
  usage: {
    remaining: number;
    limit: number;
    resetAt: string;
  };
  estimatedCost: string;
}

export function GuestMode() {
  const [password, setPassword] = useState('');
  const [showType, setShowType] = useState<'x-timeline-radio' | 'politician-watch' | 'old-media-buster' | 'disaster-news'>('x-timeline-radio');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GuestResult | null>(null);
  const [usage, setUsage] = useState<GuestUsage | null>(null);

  // ストアからプレイヤー関連の状態を取得
  const setAudioSettings = useStore((state) => state.setAudioSettings);

  // 生成した番組を再生画面で開く
  const handlePlayGenerated = () => {
    if (!result?.script) return;

    // ストアにAI番組をセット
    const store = useStore.getState();

    // AIモードに設定
    setAudioSettings({
      programMode: 'ai-script',
      showType: result.showType as ShowTypeId
    });

    // aiProgramを直接セット（ストアの内部状態を更新）
    useStore.setState({
      aiProgram: {
        id: `guest-${Date.now()}`,
        sections: result.script.sections || [],
        totalDuration: result.script.totalDuration || 20,
        status: 'ready',
      },
      currentSectionIndex: 0,
      currentChunkIndex: 0,
      isInitializing: false,
      isGeneratingScript: false,
    });

    // URLから?guestパラメータを削除して通常モードに切り替え
    window.history.replaceState({}, '', window.location.pathname);
    window.location.reload();
  };

  // 使用状況を取得
  useEffect(() => {
    fetch('/api/guest-generate')
      .then(res => res.json())
      .then(data => {
        if (data.remaining !== undefined) {
          setUsage(data);
        }
      })
      .catch(() => {
        // ゲストモードが無効の場合は無視
      });
  }, []);

  const handleGenerate = async () => {
    if (!password) {
      setError('パスワードを入力してください');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch('/api/guest-generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Guest-Password': password,
        },
        body: JSON.stringify({ showType }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'エラーが発生しました');
        return;
      }

      setResult(data);
      // 使用状況を更新
      if (data.usage) {
        setUsage(prev => prev ? {
          ...prev,
          used: prev.limit - data.usage.remaining,
          remaining: data.usage.remaining,
        } : null);
      }
    } catch (err) {
      setError('通信エラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  const showTypeOptions = [
    { id: 'x-timeline-radio', name: 'X Timeline Radio', description: '今バズってる話題' },
    { id: 'politician-watch', name: '政治家ウオッチ', description: '政党別の発言追跡' },
    { id: 'old-media-buster', name: 'オールドメディアをぶっ壊せ', description: 'メディア批判' },
    { id: 'disaster-news', name: 'X災害ニュース', description: '災害情報速報' },
  ] as const;

  return (
    <div className="min-h-screen bg-bg-base text-text-primary p-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-center">
          🎙️ ゲスト生成モード
        </h1>

        {/* 使用状況 */}
        {usage && (
          <div className="bg-bg-secondary rounded-lg p-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">本日の残り回数</span>
              <span className="text-xl font-bold">
                {usage.remaining} / {usage.limit}
              </span>
            </div>
            <div className="text-sm text-text-secondary mt-2">
              1回あたりのコスト: {usage.costPerGeneration}
            </div>
          </div>
        )}

        {/* パスワード入力 */}
        <div className="bg-bg-secondary rounded-lg p-4 mb-4">
          <label className="block text-sm font-medium mb-2">
            ゲストパスワード
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="パスワードを入力"
            className="w-full px-4 py-2 bg-bg-base border border-border-primary rounded-lg focus:outline-none focus:border-accent"
          />
        </div>

        {/* 番組タイプ選択 */}
        <div className="bg-bg-secondary rounded-lg p-4 mb-4">
          <label className="block text-sm font-medium mb-2">
            番組タイプ
          </label>
          <div className="grid grid-cols-2 gap-3">
            {showTypeOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => setShowType(option.id)}
                className={`p-3 rounded-lg border-2 transition-colors ${
                  showType === option.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border-primary hover:border-accent/50'
                }`}
              >
                <div className="font-medium">{option.name}</div>
                <div className="text-sm text-text-secondary">{option.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 生成ボタン */}
        <button
          onClick={handleGenerate}
          disabled={isLoading || (usage?.remaining === 0)}
          className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
            isLoading || (usage?.remaining === 0)
              ? 'bg-gray-600 cursor-not-allowed'
              : 'bg-accent hover:bg-accent-hover'
          }`}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin">⏳</span>
              生成中... (1-2分)
            </span>
          ) : usage?.remaining === 0 ? (
            '本日の上限に達しました'
          ) : (
            '🎙️ 番組を生成'
          )}
        </button>

        {/* エラー表示 */}
        {error && (
          <div className="mt-4 p-4 bg-red-500/20 border border-red-500 rounded-lg text-red-300">
            {error}
          </div>
        )}

        {/* 生成結果 */}
        {result && (
          <div className="mt-6 bg-bg-secondary rounded-lg p-4">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              ✅ 生成完了
            </h2>

            {/* 再生ボタン */}
            <button
              onClick={handlePlayGenerated}
              className="w-full py-4 mb-4 rounded-lg font-bold text-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors"
            >
              ▶ 再生画面へ
            </button>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-text-secondary">番組タイプ: </span>
                <span className="font-medium">{result.showType}</span>
              </div>
              <div>
                <span className="text-text-secondary">セクション数: </span>
                <span className="font-medium">{result.script?.sections?.length || 0}</span>
              </div>
              <div>
                <span className="text-text-secondary">残り回数: </span>
                <span className="font-medium">{result.usage.remaining}/{result.usage.limit}</span>
              </div>
            </div>

            {/* 台本プレビュー */}
            <details className="mt-4">
              <summary className="cursor-pointer text-accent hover:underline text-sm">
                台本を表示（デバッグ用）
              </summary>
              <pre className="mt-2 p-3 bg-bg-base rounded text-xs overflow-auto max-h-64">
                {JSON.stringify(result.script, null, 2)}
              </pre>
            </details>
          </div>
        )}

        {/* 注意事項 */}
        <div className="mt-6 p-4 bg-bg-secondary rounded-lg text-sm text-text-secondary">
          <h3 className="font-medium mb-2">ℹ️ 注意事項</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>1日あたりの生成回数に制限があります</li>
            <li>生成には1-2分程度かかります</li>
            <li>「再生画面へ」で通常のプレイヤーに移動します</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
