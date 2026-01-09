import { useState, useEffect, useRef } from 'react';
import { SHOW_TYPES, getShowType } from '../lib/showTypes';
import type { ShowTypeId } from '../types';

interface FreemiumUsage {
  remaining: {
    daily: number;
    intervalSeconds: number;
    monthly: number;
  };
  limits: {
    daily: number;
    intervalSeconds: number;
    monthly: number;
  };
}

interface FreemiumSection {
  id: string;
  type: string;
  genre?: string;
  title: string;
  chunks: string[];
  estimatedDuration: number;
}

interface FreemiumResult {
  success: boolean;
  showType: string;
  topic: string | null;
  sections: FreemiumSection[];
  totalDuration: number;
  showConfig: {
    name: string;
    voice: string;
    bgm: string;
  };
  usage: FreemiumUsage;
  upgradePrompt: {
    message: string;
    benefits: string[];
  };
  disclaimer: string;
}

export function FreemiumMode() {
  const [showType, setShowType] = useState<ShowTypeId>('x-timeline-radio');
  const [topic, setTopic] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FreemiumResult | null>(null);
  const [usage, setUsage] = useState<FreemiumUsage | null>(null);
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bgmRef = useRef<HTMLAudioElement | null>(null);

  // 使用状況を取得
  useEffect(() => {
    fetchUsageStatus();
  }, []);

  const fetchUsageStatus = async () => {
    try {
      const response = await fetch('/api/freemium/generate');
      if (response.ok) {
        const data = await response.json();
        setUsage(data.usage);
      }
    } catch (err) {
      console.error('Failed to fetch usage status:', err);
    }
  };

  // 番組生成
  const handleGenerate = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    setError(null);
    setResult(null);
    setShowUpgradePrompt(false);

    try {
      const response = await fetch('/api/freemium/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showType,
          topic: topic.trim() || undefined
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          setError(data.message || '生成制限に達しました');
        } else {
          setError(data.message || '生成に失敗しました');
        }
        return;
      }

      setResult(data);
      setUsage(data.usage);

      // 自動再生開始
      if (data.sections && data.sections.length > 0) {
        startPlayback(data);
      }

    } catch (err) {
      setError('生成に失敗しました。しばらく待ってから再試行してください。');
    } finally {
      setIsGenerating(false);
    }
  };

  // 再生開始
  const startPlayback = async (data: FreemiumResult) => {
    if (!data.sections || data.sections.length === 0) return;

    const section = data.sections[0];
    if (!section.chunks || section.chunks.length === 0) return;

    setIsPlaying(true);
    setCurrentChunkIndex(0);

    // BGM開始
    if (data.showConfig?.bgm && bgmRef.current) {
      bgmRef.current.src = `/bgm/${data.showConfig.bgm}.mp3`;
      bgmRef.current.volume = 0.15;
      bgmRef.current.loop = true;
      try {
        await bgmRef.current.play();
      } catch (e) {
        console.log('BGM autoplay blocked');
      }
    }

    // TTS生成・再生
    await playChunks(section.chunks, data.showConfig?.voice || 'nova');
  };

  // チャンク再生
  const playChunks = async (chunks: string[], voice: string) => {
    for (let i = 0; i < chunks.length; i++) {
      setCurrentChunkIndex(i);

      try {
        // TTS生成
        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: chunks[i],
            voice,
            apiKey: undefined // サーバー側のAPIキーを使用
          })
        });

        if (!response.ok) {
          console.error('TTS failed for chunk', i);
          continue;
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);

        await new Promise<void>((resolve, reject) => {
          if (audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.onended = () => {
              URL.revokeObjectURL(url);
              resolve();
            };
            audioRef.current.onerror = () => {
              URL.revokeObjectURL(url);
              reject();
            };
            audioRef.current.play().catch(reject);
          } else {
            resolve();
          }
        });

      } catch (err) {
        console.error('Playback error:', err);
      }
    }

    // 再生完了
    setIsPlaying(false);
    if (bgmRef.current) {
      bgmRef.current.pause();
    }
    setShowUpgradePrompt(true);
  };

  // 停止
  const handleStop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    }
    if (bgmRef.current) {
      bgmRef.current.pause();
    }
    setIsPlaying(false);
  };

  // APIキー設定画面へ
  const handleUpgrade = () => {
    window.location.href = '/';
  };

  const showTypeConfig = getShowType(showType);
  const canGenerate = usage && usage.remaining.daily > 0 && usage.remaining.intervalSeconds === 0;

  return (
    <div className="min-h-screen bg-bg-main text-text-primary">
      {/* ヘッダー */}
      <header className="bg-bg-card border-b border-border-light p-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🎙️</span>
            <div>
              <h1 className="text-xl font-bold">X Timeline Radio</h1>
              <p className="text-sm text-text-secondary">Free Trial</p>
            </div>
          </div>
          {usage && (
            <div className="text-right text-sm">
              <div className="text-text-secondary">本日の残り</div>
              <div className="text-lg font-bold text-accent">
                {usage.remaining.daily}/{usage.limits.daily}回
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4">
        {/* 生成フォーム */}
        {!result && !isGenerating && (
          <div className="bg-bg-card rounded-xl p-6 border border-border-light">
            <h2 className="text-lg font-bold mb-4">あなた専用のラジオを作る</h2>

            {/* 番組タイプ選択 */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                ベース番組
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(SHOW_TYPES).map(([id, config]) => (
                  <button
                    key={id}
                    onClick={() => setShowType(id as ShowTypeId)}
                    className={`p-3 rounded-lg border text-left transition-colors ${
                      showType === id
                        ? 'bg-accent/20 border-accent'
                        : 'bg-bg-menu border-border-light hover:border-accent/50'
                    }`}
                  >
                    <div className="font-medium">{config.name}</div>
                    <div className="text-xs text-text-secondary mt-1">
                      {config.description || ''}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* トピック入力 */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2">
                今日聴きたいトピック（任意）
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="例: AI、経済、スポーツ"
                maxLength={50}
                className="w-full px-4 py-3 bg-bg-menu border border-border-light rounded-lg focus:outline-none focus:border-accent"
              />
              <p className="text-xs text-text-secondary mt-1">
                指定したトピックに関連する投稿を優先的に収集します
              </p>
            </div>

            {/* エラー表示 */}
            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            {/* 生成ボタン */}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
                canGenerate
                  ? 'bg-accent hover:bg-accent-hover text-white'
                  : 'bg-gray-600 cursor-not-allowed text-gray-400'
              }`}
            >
              {usage?.remaining.intervalSeconds && usage.remaining.intervalSeconds > 0
                ? `${Math.ceil(usage.remaining.intervalSeconds / 60)}分後に生成可能`
                : usage?.remaining.daily === 0
                ? '本日の生成上限に達しました'
                : `無料で生成（残り${usage?.remaining.daily || 0}回）`}
            </button>

            {/* フル版への誘導 */}
            <div className="mt-6 p-4 bg-bg-menu rounded-lg border border-border-light">
              <div className="flex items-center gap-2 mb-2">
                <span>🔓</span>
                <span className="font-medium">フルカスタマイズ＆全コーナー</span>
              </div>
              <p className="text-sm text-text-secondary mb-3">
                APIキーを設定すると、全コーナーの再生、ファクトチェック機能、詳細なカスタマイズが可能になります。
              </p>
              <button
                onClick={handleUpgrade}
                className="w-full py-2 border border-accent text-accent rounded-lg hover:bg-accent/10 transition-colors"
              >
                APIキーを設定する
              </button>
            </div>
          </div>
        )}

        {/* 生成中 */}
        {isGenerating && (
          <div className="bg-bg-card rounded-xl p-8 border border-border-light text-center">
            <div className="animate-spin text-5xl mb-4">🎙️</div>
            <h2 className="text-xl font-bold mb-2">番組を生成中...</h2>
            <p className="text-text-secondary">
              Xの投稿を収集し、台本を作成しています
            </p>
            <p className="text-sm text-text-secondary mt-2">
              30〜60秒ほどかかります
            </p>
          </div>
        )}

        {/* 再生中 / 再生完了 */}
        {result && (
          <div className="bg-bg-card rounded-xl p-6 border border-border-light">
            {/* 番組情報 */}
            <div className="flex items-center gap-4 mb-6">
              <div className="text-5xl">
                {showType === 'politician-watch' ? '🥊' :
                 showType === 'old-media-buster' ? '💥' :
                 showType === 'disaster-news' ? '🚨' : '📻'}
              </div>
              <div>
                <h2 className="text-xl font-bold">{result.showConfig?.name || 'X Timeline Radio'}</h2>
                {result.topic && (
                  <p className="text-sm text-accent">トピック: {result.topic}</p>
                )}
                <p className="text-sm text-text-secondary">
                  オープニング + 第1コーナー
                </p>
              </div>
            </div>

            {/* 再生コントロール */}
            {isPlaying && (
              <div className="mb-6">
                <div className="flex items-center gap-4 mb-2">
                  <div className="animate-pulse text-accent">再生中</div>
                  <button
                    onClick={handleStop}
                    className="px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30"
                  >
                    停止
                  </button>
                </div>
                <div className="w-full bg-bg-menu rounded-full h-2">
                  <div
                    className="bg-accent h-2 rounded-full transition-all"
                    style={{
                      width: `${((currentChunkIndex + 1) / (result.sections[0]?.chunks?.length || 1)) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}

            {/* 注意書き */}
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm mb-4">
              <span className="text-yellow-400">⚠️</span> {result.disclaimer}
            </div>

            {/* アップグレードプロンプト */}
            {showUpgradePrompt && (
              <div className="p-4 bg-accent/10 border border-accent/30 rounded-lg">
                <h3 className="font-bold mb-2">🎵 試聴ありがとうございました！</h3>
                <p className="text-sm text-text-secondary mb-3">
                  {result.upgradePrompt?.message}
                </p>
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2">✅ フル版の特典:</div>
                  <ul className="text-sm text-text-secondary space-y-1">
                    {result.upgradePrompt?.benefits.map((benefit, i) => (
                      <li key={i}>・{benefit}</li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={handleUpgrade}
                  className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-bold transition-colors"
                >
                  APIキーを設定する
                </button>
              </div>
            )}

            {/* 再生成ボタン */}
            {!isPlaying && (
              <button
                onClick={() => {
                  setResult(null);
                  setShowUpgradePrompt(false);
                  fetchUsageStatus();
                }}
                className="w-full mt-4 py-3 border border-border-light rounded-lg hover:bg-bg-menu transition-colors"
              >
                別の番組を生成
              </button>
            )}
          </div>
        )}
      </main>

      {/* オーディオ要素（非表示） */}
      <audio ref={audioRef} />
      <audio ref={bgmRef} />

      {/* フッター */}
      <footer className="max-w-2xl mx-auto p-4 text-center text-sm text-text-secondary">
        <p>
          このサービスは無料でお試しいただけます。
          1回あたり約¥3のコストがかかっています。
        </p>
      </footer>
    </div>
  );
}
