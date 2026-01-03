// TTS音声キャッシュ（IndexedDB）

const DB_NAME = 'x-timeline-radio-audio-cache';
const STORE_NAME = 'audio-cache';
const DB_VERSION = 1;
const MAX_CACHE_SIZE = 100; // 最大100エントリ
const CACHE_EXPIRY = 60 * 60 * 1000; // 1時間

interface CacheEntry {
  key: string;          // script + voiceId のハッシュ
  audioUrl: string;     // blob URL
  blob: Blob;           // 音声データ
  createdAt: number;
  voiceId: string;
}

class AudioCache {
  private db: IDBDatabase | null = null;
  private memoryCache: Map<string, string> = new Map(); // key -> blob URL

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.cleanExpired();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  private generateKey(script: string, voiceId: string): string {
    // シンプルなハッシュ（script + voiceId）
    const str = `${voiceId}:${script}`;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `audio_${Math.abs(hash).toString(36)}`;
  }

  async get(script: string, voiceId: string): Promise<string | null> {
    const key = this.generateKey(script, voiceId);

    // メモリキャッシュをチェック
    if (this.memoryCache.has(key)) {
      console.log('[AudioCache] Memory cache hit');
      return this.memoryCache.get(key)!;
    }

    await this.init();
    if (!this.db) return null;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        const entry: CacheEntry | undefined = request.result;
        if (!entry) {
          resolve(null);
          return;
        }

        // 有効期限チェック
        if (Date.now() - entry.createdAt > CACHE_EXPIRY) {
          this.delete(key);
          resolve(null);
          return;
        }

        // Blob から URL を作成してメモリキャッシュに保存
        const url = URL.createObjectURL(entry.blob);
        this.memoryCache.set(key, url);
        console.log('[AudioCache] IndexedDB cache hit');
        resolve(url);
      };
    });
  }

  async set(script: string, voiceId: string, blob: Blob): Promise<string> {
    const key = this.generateKey(script, voiceId);
    const url = URL.createObjectURL(blob);

    // メモリキャッシュに保存
    this.memoryCache.set(key, url);

    await this.init();
    if (!this.db) return url;

    // キャッシュサイズ制限
    await this.ensureCapacity();

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const entry: CacheEntry = {
        key,
        audioUrl: url,
        blob,
        createdAt: Date.now(),
        voiceId,
      };

      const request = store.put(entry);
      request.onerror = () => {
        console.warn('[AudioCache] Failed to cache audio');
        resolve(url);
      };
      request.onsuccess = () => {
        console.log('[AudioCache] Cached audio');
        resolve(url);
      };
    });
  }

  private async delete(key: string): Promise<void> {
    if (!this.db) return;

    // メモリキャッシュからも削除
    const url = this.memoryCache.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      this.memoryCache.delete(key);
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  }

  private async ensureCapacity(): Promise<void> {
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();

      countRequest.onsuccess = () => {
        if (countRequest.result < MAX_CACHE_SIZE) {
          resolve();
          return;
        }

        // 古いエントリを削除
        const index = store.index('createdAt');
        const cursorRequest = index.openCursor();
        let deleted = 0;
        const toDelete = countRequest.result - MAX_CACHE_SIZE + 10;

        cursorRequest.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor && deleted < toDelete) {
            store.delete(cursor.primaryKey);
            deleted++;
            cursor.continue();
          } else {
            console.log(`[AudioCache] Cleaned up ${deleted} old entries`);
            resolve();
          }
        };
      };
    });
  }

  private async cleanExpired(): Promise<void> {
    if (!this.db) return;

    const expiredTime = Date.now() - CACHE_EXPIRY;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('createdAt');
      const range = IDBKeyRange.upperBound(expiredTime);
      const cursorRequest = index.openCursor(range);
      let deleted = 0;

      cursorRequest.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          store.delete(cursor.primaryKey);
          deleted++;
          cursor.continue();
        } else {
          if (deleted > 0) {
            console.log(`[AudioCache] Cleaned ${deleted} expired entries`);
          }
          resolve();
        }
      };

      cursorRequest.onerror = () => resolve();
    });
  }

  async clear(): Promise<void> {
    // メモリキャッシュをクリア
    for (const url of this.memoryCache.values()) {
      URL.revokeObjectURL(url);
    }
    this.memoryCache.clear();

    await this.init();
    if (!this.db) return;

    return new Promise((resolve) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => {
        console.log('[AudioCache] Cache cleared');
        resolve();
      };
      request.onerror = () => resolve();
    });
  }
}

export const audioCache = new AudioCache();
