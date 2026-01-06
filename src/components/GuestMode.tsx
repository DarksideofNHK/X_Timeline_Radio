import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';

// ゲストモード: パスワード認証後、通常モードと同じUIを使用
// APIキーはサーバー側の環境変数を使用

export function GuestMode() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  // パスワード認証
  const handleAuth = async () => {
    if (!password) {
      setError('パスワードを入力してください');
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const response = await fetch('/api/guest-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 認証成功: ゲストモードとしてストアに設定
        useStore.setState({
          isGuestMode: true,
          apiConfig: {
            grokApiKey: 'GUEST_MODE',
            geminiApiKey: 'GUEST_MODE',
            openaiApiKey: 'GUEST_MODE',
          },
        });
        setIsAuthenticated(true);
        // URLからguestパラメータを削除して通常UIに移行
        window.history.replaceState({}, '', window.location.pathname);
        window.location.reload();
      } else {
        setError(data.message || 'パスワードが正しくありません');
      }
    } catch (err) {
      setError('認証に失敗しました');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-main text-text-primary flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-bg-card rounded-xl p-8 border border-border-light shadow-lg">
          <div className="text-center mb-6">
            <div className="text-5xl mb-4">🎙️</div>
            <h1 className="text-2xl font-bold mb-2">X Timeline Radio</h1>
            <p className="text-text-secondary">ゲストアクセス</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                パスワード
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
                placeholder="ゲストパスワードを入力"
                className="w-full px-4 py-3 bg-bg-menu border border-border-light rounded-lg focus:outline-none focus:border-accent text-lg"
                disabled={isChecking}
              />
            </div>

            {error && (
              <div className="p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleAuth}
              disabled={isChecking}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-colors ${
                isChecking
                  ? 'bg-gray-600 cursor-not-allowed'
                  : 'bg-accent hover:bg-accent-hover text-white'
              }`}
            >
              {isChecking ? '確認中...' : 'ログイン'}
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-text-secondary">
            <p>APIキー不要でご利用いただけます</p>
          </div>
        </div>
      </div>
    </div>
  );
}
