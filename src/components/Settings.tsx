import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { bgmManager, type BgmSource } from '../lib/bgm';
import { bgmStorage, type BgmTrack } from '../lib/bgmStorage';
import { SPEED_OPTIONS, OPENAI_VOICE_OPTIONS, type ProgramMode, type Theme } from '../types';

export function Settings() {
  const { apiConfig, setApiConfig, audioSettings, setAudioSettings, clearCache, isGuestMode } = useStore();
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [bgmSource, setBgmSource] = useState<BgmSource>('default');
  const [tracks, setTracks] = useState<BgmTrack[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // トラック一覧を読み込み
  useEffect(() => {
    loadTracks();
  }, []);

  const loadTracks = async () => {
    const allTracks = await bgmStorage.getAllTracks();
    setTracks(allTracks);
  };

  // BGM音量をパーセント（0-100）から実際の音量に変換
  // 0% = 0（ミュート）、100% = 0.05（控えめな最大音量）
  const getBgmVolumeDecimal = (percent: number) => {
    if (percent === 0) return 0;
    return (percent / 100) * 0.05;
  };

  const handleBgmToggle = async () => {
    if (bgmEnabled) {
      bgmManager.stop();
      setBgmEnabled(false);
    } else {
      const volumeDecimal = getBgmVolumeDecimal(audioSettings.bgmVolume);
      bgmManager.setConfig({ source: bgmSource, volume: volumeDecimal });
      await bgmManager.start();
      setBgmEnabled(true);
    }
  };

  const handleBgmSourceChange = async (source: BgmSource) => {
    setBgmSource(source);
    if (bgmEnabled) {
      bgmManager.stop();
      const volumeDecimal = getBgmVolumeDecimal(audioSettings.bgmVolume);
      bgmManager.setConfig({ source, volume: volumeDecimal });
      await bgmManager.start();
    }
  };

  const handleBgmVolumeChange = (volume: number) => {
    setAudioSettings({ bgmVolume: volume });
    // 再生中なら即座に音量を反映
    if (bgmEnabled) {
      const volumeDecimal = getBgmVolumeDecimal(volume);
      bgmManager.setConfig({ volume: volumeDecimal });
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('audio/')) {
        alert(`${file.name} は音声ファイルではありません`);
        continue;
      }

      if (tracks.length >= 5) {
        alert('最大5曲までです');
        break;
      }

      const track = await bgmStorage.addTrack(file);
      if (track) {
        setTracks(prev => [...prev, track]);
      }
    }

    setUploading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveTrack = async (id: string) => {
    await bgmStorage.removeTrack(id);
    setTracks(prev => prev.filter(t => t.id !== id));
  };

  const handleClearCache = () => {
    clearCache();
    alert('キャッシュをクリアしました。次回の番組スタートで新しい投稿を取得します。');
  };

  return (
    <div className="bg-bg-card rounded-xl p-6 space-y-4 border border-border-light shadow-sm">
      <h2 className="text-lg font-bold text-text-primary">API設定</h2>

      {/* ゲストモード時はAPIキー入力を非表示 */}
      {isGuestMode ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-green-700">
            <span className="text-xl">🎟️</span>
            <span className="font-medium">ゲストモードで利用中</span>
          </div>
          <p className="text-sm text-green-600 mt-2">
            APIキーはサーバー側で管理されています。すべての機能をご利用いただけます。
          </p>
          <button
            onClick={() => {
              // ゲストモードを解除
              useStore.setState({ isGuestMode: false });
              setApiConfig({ grokApiKey: '', geminiApiKey: '', openaiApiKey: '' });
            }}
            className="mt-3 px-3 py-1.5 text-sm bg-bg-menu hover:bg-hover-bg rounded-lg text-text-secondary border border-border-light transition-colors"
          >
            ゲストモードを解除
          </button>
        </div>
      ) : (
        <>
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              Grok API Key
            </label>
            <input
              type="password"
              value={apiConfig.grokApiKey}
              onChange={(e) => setApiConfig({ grokApiKey: e.target.value })}
              placeholder="xai-..."
              className="w-full bg-bg-menu border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent text-text-primary"
            />
            <p className="text-xs text-text-disabled mt-1">
              <a
                href="https://x.ai/api"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                x.ai/api
              </a>
              で取得
            </p>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">
              Gemini API Key（スクリプト生成 / TTS）
            </label>
            <input
              type="password"
              value={apiConfig.geminiApiKey}
              onChange={(e) => setApiConfig({ geminiApiKey: e.target.value })}
              placeholder="AIzaSy..."
              className="w-full bg-bg-menu border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent text-text-primary"
            />
            <p className="text-xs text-text-disabled mt-1">
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Google AI Studio
              </a>
              で取得
            </p>
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1">
              OpenAI API Key（TTS用・おすすめ）
            </label>
            <input
              type="password"
              value={apiConfig.openaiApiKey}
              onChange={(e) => setApiConfig({ openaiApiKey: e.target.value })}
              placeholder="sk-..."
              className="w-full bg-bg-menu border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent text-text-primary"
            />
            <p className="text-xs text-text-disabled mt-1">
              <a
                href="https://platform.openai.com/api-keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                OpenAI Platform
              </a>
              で取得（$15/100万文字・安定）
            </p>
          </div>
        </>
      )}

      <div className="pt-4 border-t border-border-light">
        <h3 className="text-sm font-bold text-text-secondary mb-3">テーマ</h3>
        <div className="flex gap-2">
          <button
            onClick={() => setAudioSettings({ theme: 'light' as Theme })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              audioSettings.theme === 'light'
                ? 'bg-accent text-white'
                : 'bg-bg-menu text-text-secondary hover:bg-hover-bg border border-border-light'
            }`}
          >
            ☀️ ライト
          </button>
          <button
            onClick={() => setAudioSettings({ theme: 'dark' as Theme })}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              audioSettings.theme === 'dark'
                ? 'bg-accent text-white'
                : 'bg-bg-menu text-text-secondary hover:bg-hover-bg border border-border-light'
            }`}
          >
            🌙 ダーク
          </button>
        </div>
      </div>

      <div className="pt-4 border-t border-border-light">
        <h3 className="text-sm font-bold text-text-secondary mb-3">番組モード</h3>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setAudioSettings({ programMode: 'simple' as ProgramMode })}
            className={`flex-1 px-3 py-3 rounded-lg text-sm transition-colors ${
              audioSettings.programMode === 'simple'
                ? 'bg-accent text-white'
                : 'bg-bg-menu text-text-secondary hover:bg-hover-bg border border-border-light'
            }`}
          >
            <div className="font-bold">📻 シンプルモード</div>
            <div className="text-xs opacity-70 mt-1">投稿を順番に読み上げ</div>
          </button>
          <button
            onClick={() => setAudioSettings({ programMode: 'ai-script' as ProgramMode })}
            className={`flex-1 px-3 py-3 rounded-lg text-sm transition-colors ${
              audioSettings.programMode === 'ai-script'
                ? 'bg-purple-600 text-white'
                : 'bg-bg-menu text-text-secondary hover:bg-hover-bg border border-border-light'
            }`}
          >
            <div className="font-bold">🎙️ AI番組モード</div>
            <div className="text-xs opacity-70 mt-1">Geminiが20分番組を生成</div>
          </button>
        </div>
        {audioSettings.programMode === 'ai-script' && (
          apiConfig.geminiApiKey ? (
            <p className="text-xs text-green-600 mb-2">
              ✅ Gemini APIキーが設定されています
            </p>
          ) : (
            <p className="text-xs text-yellow-600 mb-2">
              ⚠️ AI番組モードにはGemini APIキーの入力が必要です
            </p>
          )
        )}
      </div>

      <div className="pt-4 border-t border-border-light">
        <h3 className="text-sm font-bold text-text-secondary mb-3">読み上げ設定（OpenAI TTS）</h3>

        {/* 声の選択 */}
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-1">
            読み手の声
          </label>
          <select
            value={audioSettings.openaiVoiceId}
            onChange={(e) => setAudioSettings({ openaiVoiceId: e.target.value as any })}
            className="w-full bg-bg-menu border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-accent text-text-primary"
          >
            {OPENAI_VOICE_OPTIONS.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} - {voice.description}
              </option>
            ))}
          </select>
        </div>

        {/* 再生速度 */}
        <div className="mb-4">
          <label className="block text-sm text-text-secondary mb-1">
            再生速度
          </label>
          <select
            value={audioSettings.speed}
            onChange={(e) => setAudioSettings({ speed: parseFloat(e.target.value) })}
            className="w-full bg-bg-menu border border-border-light rounded-lg px-3 py-2 focus:outline-none focus:border-accent text-text-primary"
          >
            {SPEED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-text-disabled">
          設定は次の投稿から反映されます。
        </p>
      </div>

      <div className="pt-4 border-t border-border-light">
        <h3 className="text-sm font-bold text-text-secondary mb-3">BGM設定</h3>

        {/* BGM ON/OFF */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={handleBgmToggle}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              bgmEnabled
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-bg-menu hover:bg-hover-bg text-text-secondary border border-border-light'
            }`}
          >
            {bgmEnabled ? '🔊 BGM ON' : '🔇 BGM OFF'}
          </button>
        </div>

        {/* BGM音量スライダー */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm text-text-secondary">
              BGM音量
            </label>
            <span className="text-sm font-bold text-accent min-w-[3rem] text-right">
              {audioSettings.bgmVolume ?? 5}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={audioSettings.bgmVolume ?? 5}
            onChange={(e) => handleBgmVolumeChange(parseInt(e.target.value))}
            className="w-full h-3 bg-bg-menu rounded-lg appearance-none cursor-pointer accent-accent touch-pan-y"
            style={{
              background: `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${audioSettings.bgmVolume ?? 5}%, var(--color-bg-menu) ${audioSettings.bgmVolume ?? 5}%, var(--color-bg-menu) 100%)`
            }}
          />
          <div className="flex justify-between text-xs text-text-disabled mt-2">
            <span>🔇 0%</span>
            <span>50%</span>
            <span>🔊 100%</span>
          </div>
          {(audioSettings.bgmVolume ?? 5) === 0 && (
            <p className="text-xs text-yellow-600 mt-1">⚠️ BGMはミュートされています</p>
          )}
        </div>

        {/* BGMソース選択 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => handleBgmSourceChange('default')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              bgmSource === 'default'
                ? 'bg-accent text-white'
                : 'bg-bg-menu text-text-secondary hover:bg-hover-bg border border-border-light'
            }`}
          >
            🎵 デフォルトBGM
          </button>
          <button
            onClick={() => handleBgmSourceChange('uploaded')}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              bgmSource === 'uploaded'
                ? 'bg-accent text-white'
                : 'bg-bg-menu text-text-secondary hover:bg-hover-bg border border-border-light'
            }`}
          >
            📁 カスタムBGM
          </button>
        </div>

        {/* デフォルトBGM情報 */}
        {bgmSource === 'default' && (
          <div className="bg-bg-menu rounded-lg px-3 py-2 mb-3 border border-border-light">
            <p className="text-sm text-text-primary">🎵 Digital Newsfeed Groove</p>
            <p className="text-xs text-text-disabled">Elevenlabs生成</p>
          </div>
        )}

        {/* カスタムBGMアップロード */}
        {bgmSource === 'uploaded' && (
          <>
            <div className="mb-3">
              <label className={`inline-block px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                tracks.length >= 5
                  ? 'bg-bg-menu cursor-not-allowed text-text-disabled'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}>
                {uploading ? '⏳ アップロード中...' : '📁 ファイル追加'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={handleFileSelect}
                  disabled={tracks.length >= 5 || uploading}
                  className="hidden"
                />
              </label>
              <span className="text-xs text-text-disabled ml-2">最大5曲</span>
            </div>

            {/* トラック一覧 */}
            {tracks.length === 0 ? (
              <p className="text-xs text-text-disabled">
                MP3ファイルをアップロードしてください
              </p>
            ) : (
              <div className="space-y-2">
                {tracks.map((track, index) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between bg-bg-menu rounded-lg px-3 py-2 border border-border-light"
                  >
                    <span className="text-sm truncate flex-1 text-text-primary">
                      {index + 1}. {track.name}
                    </span>
                    <button
                      onClick={() => handleRemoveTrack(track.id)}
                      className="text-red-500 hover:text-red-600 ml-2 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <p className="text-xs text-text-disabled mt-3">
          TTS再生中は自動的に音量が下がります。
        </p>
      </div>

      <div className="pt-4 border-t border-border-light">
        <h3 className="text-sm font-bold text-text-secondary mb-2">キャッシュ管理</h3>
        <p className="text-xs text-text-disabled mb-2">
          投稿データは30分間キャッシュされます。
        </p>
        <button
          onClick={handleClearCache}
          className="px-4 py-2 bg-bg-menu hover:bg-hover-bg rounded-lg text-sm font-medium text-text-secondary border border-border-light transition-colors"
        >
          キャッシュをクリア
        </button>
      </div>
    </div>
  );
}
