import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { bgmManager, type BgmSource } from '../lib/bgm';
import { bgmStorage, type BgmTrack } from '../lib/bgmStorage';
import { SPEED_OPTIONS, OPENAI_VOICE_OPTIONS, type ProgramMode } from '../types';

export function Settings() {
  const { apiConfig, setApiConfig, audioSettings, setAudioSettings, clearCache } = useStore();
  const [bgmEnabled, setBgmEnabled] = useState(false);
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

  const handleBgmToggle = async () => {
    if (bgmEnabled) {
      bgmManager.stop();
      setBgmEnabled(false);
    } else {
      bgmManager.setConfig({ source: bgmSource, volume: 0.15 });
      await bgmManager.start();
      setBgmEnabled(true);
    }
  };

  const handleBgmSourceChange = async (source: BgmSource) => {
    setBgmSource(source);
    if (bgmEnabled) {
      bgmManager.stop();
      bgmManager.setConfig({ source, volume: 0.15 });
      await bgmManager.start();
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
    <div className="bg-slate-800 rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-bold">API設定</h2>

      <div>
        <label className="block text-sm text-slate-400 mb-1">
          Grok API Key
        </label>
        <input
          type="password"
          value={apiConfig.grokApiKey}
          onChange={(e) => setApiConfig({ grokApiKey: e.target.value })}
          placeholder="xai-..."
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1">
          <a
            href="https://x.ai/api"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            x.ai/api
          </a>
          で取得
        </p>
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-1">
          Gemini API Key（スクリプト生成 / TTS）
        </label>
        <input
          type="password"
          value={apiConfig.geminiApiKey}
          onChange={(e) => setApiConfig({ geminiApiKey: e.target.value })}
          placeholder="AIzaSy..."
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1">
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            Google AI Studio
          </a>
          で取得
        </p>
      </div>

      <div>
        <label className="block text-sm text-slate-400 mb-1">
          OpenAI API Key（TTS用・おすすめ）
        </label>
        <input
          type="password"
          value={apiConfig.openaiApiKey}
          onChange={(e) => setApiConfig({ openaiApiKey: e.target.value })}
          placeholder="sk-..."
          className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
        />
        <p className="text-xs text-slate-500 mt-1">
          <a
            href="https://platform.openai.com/api-keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline"
          >
            OpenAI Platform
          </a>
          で取得（$15/100万文字・安定）
        </p>
      </div>

      <div className="pt-4 border-t border-slate-700">
        <h3 className="text-sm font-bold text-slate-400 mb-3">番組モード</h3>
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setAudioSettings({ programMode: 'simple' as ProgramMode })}
            className={`flex-1 px-3 py-3 rounded text-sm ${
              audioSettings.programMode === 'simple'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <div className="font-bold">📻 シンプルモード</div>
            <div className="text-xs opacity-70 mt-1">投稿を順番に読み上げ</div>
          </button>
          <button
            onClick={() => setAudioSettings({ programMode: 'ai-script' as ProgramMode })}
            className={`flex-1 px-3 py-3 rounded text-sm ${
              audioSettings.programMode === 'ai-script'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            <div className="font-bold">🎙️ AI番組モード</div>
            <div className="text-xs opacity-70 mt-1">Geminiが30分番組を生成</div>
          </button>
        </div>
        {audioSettings.programMode === 'ai-script' && (
          apiConfig.geminiApiKey ? (
            <p className="text-xs text-green-400 mb-2">
              ✅ Gemini APIキーが設定されています
            </p>
          ) : (
            <p className="text-xs text-yellow-500 mb-2">
              ⚠️ AI番組モードにはGemini APIキーの入力が必要です
            </p>
          )
        )}
      </div>

      <div className="pt-4 border-t border-slate-700">
        <h3 className="text-sm font-bold text-slate-400 mb-3">読み上げ設定（OpenAI TTS）</h3>

        {/* 声の選択 */}
        <div className="mb-4">
          <label className="block text-sm text-slate-400 mb-1">
            読み手の声
          </label>
          <select
            value={audioSettings.openaiVoiceId}
            onChange={(e) => setAudioSettings({ openaiVoiceId: e.target.value as any })}
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
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
          <label className="block text-sm text-slate-400 mb-1">
            再生速度
          </label>
          <select
            value={audioSettings.speed}
            onChange={(e) => setAudioSettings({ speed: parseFloat(e.target.value) })}
            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 focus:outline-none focus:border-blue-500"
          >
            {SPEED_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-slate-500">
          設定は次の投稿から反映されます。
        </p>
      </div>

      <div className="pt-4 border-t border-slate-700">
        <h3 className="text-sm font-bold text-slate-400 mb-3">BGM設定</h3>

        {/* BGM ON/OFF */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={handleBgmToggle}
            className={`px-4 py-2 rounded text-sm ${
              bgmEnabled
                ? 'bg-green-600 hover:bg-green-500'
                : 'bg-slate-700 hover:bg-slate-600'
            }`}
          >
            {bgmEnabled ? '🔊 BGM ON' : '🔇 BGM OFF'}
          </button>
        </div>

        {/* BGMソース選択 */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => handleBgmSourceChange('default')}
            className={`flex-1 px-3 py-2 rounded text-sm ${
              bgmSource === 'default'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            🎵 デフォルトBGM
          </button>
          <button
            onClick={() => handleBgmSourceChange('uploaded')}
            className={`flex-1 px-3 py-2 rounded text-sm ${
              bgmSource === 'uploaded'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            📁 カスタムBGM
          </button>
        </div>

        {/* デフォルトBGM情報 */}
        {bgmSource === 'default' && (
          <div className="bg-slate-700/50 rounded px-3 py-2 mb-3">
            <p className="text-sm text-slate-300">🎵 Digital Newsfeed Groove</p>
            <p className="text-xs text-slate-500">Elevenlabs生成</p>
          </div>
        )}

        {/* カスタムBGMアップロード */}
        {bgmSource === 'uploaded' && (
          <>
            <div className="mb-3">
              <label className={`inline-block px-4 py-2 rounded text-sm cursor-pointer ${
                tracks.length >= 5
                  ? 'bg-slate-600 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500'
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
              <span className="text-xs text-slate-500 ml-2">最大5曲</span>
            </div>

            {/* トラック一覧 */}
            {tracks.length === 0 ? (
              <p className="text-xs text-slate-500">
                MP3ファイルをアップロードしてください
              </p>
            ) : (
              <div className="space-y-2">
                {tracks.map((track, index) => (
                  <div
                    key={track.id}
                    className="flex items-center justify-between bg-slate-700 rounded px-3 py-2"
                  >
                    <span className="text-sm truncate flex-1">
                      {index + 1}. {track.name}
                    </span>
                    <button
                      onClick={() => handleRemoveTrack(track.id)}
                      className="text-red-400 hover:text-red-300 ml-2 text-sm"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <p className="text-xs text-slate-500 mt-3">
          TTS再生中は自動的に音量が下がります。
        </p>
      </div>

      <div className="pt-4 border-t border-slate-700">
        <h3 className="text-sm font-bold text-slate-400 mb-2">キャッシュ管理</h3>
        <p className="text-xs text-slate-500 mb-2">
          投稿データは30分間キャッシュされます。
        </p>
        <button
          onClick={handleClearCache}
          className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"
        >
          キャッシュをクリア
        </button>
      </div>
    </div>
  );
}
