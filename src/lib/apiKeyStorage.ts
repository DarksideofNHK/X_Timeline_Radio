/**
 * APIキー専用ストレージ
 * アプリのキャッシュクリアとは独立して保存される
 */

const API_KEY_STORAGE_KEY = 'x-timeline-radio-api-keys';

export interface ApiKeys {
  grokApiKey: string;
  geminiApiKey: string;
  openaiApiKey: string;
}

const DEFAULT_KEYS: ApiKeys = {
  grokApiKey: '',
  geminiApiKey: '',
  openaiApiKey: '',
};

/**
 * APIキーを取得
 */
export function getApiKeys(): ApiKeys {
  try {
    const stored = localStorage.getItem(API_KEY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_KEYS,
        ...parsed,
      };
    }
  } catch (e) {
    console.error('[ApiKeyStorage] Failed to load API keys:', e);
  }
  return DEFAULT_KEYS;
}

/**
 * APIキーを保存
 */
export function saveApiKeys(keys: Partial<ApiKeys>): void {
  try {
    const current = getApiKeys();
    const updated = {
      ...current,
      ...keys,
    };
    localStorage.setItem(API_KEY_STORAGE_KEY, JSON.stringify(updated));
    console.log('[ApiKeyStorage] API keys saved');
  } catch (e) {
    console.error('[ApiKeyStorage] Failed to save API keys:', e);
  }
}

/**
 * APIキーをクリア（ユーザーが明示的に要求した場合のみ）
 */
export function clearApiKeys(): void {
  try {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    console.log('[ApiKeyStorage] API keys cleared');
  } catch (e) {
    console.error('[ApiKeyStorage] Failed to clear API keys:', e);
  }
}
