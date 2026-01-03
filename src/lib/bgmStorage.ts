// IndexedDBを使ったBGMファイル管理
// 最大5曲まで保存可能

const DB_NAME = 'x-timeline-radio-bgm';
const DB_VERSION = 1;
const STORE_NAME = 'bgm-tracks';
const MAX_TRACKS = 5;

export interface BgmTrack {
  id: string;
  name: string;
  blob: Blob;
  addedAt: number;
}

class BgmStorage {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
    });
  }

  async addTrack(file: File): Promise<BgmTrack | null> {
    if (!this.db) await this.init();

    const tracks = await this.getAllTracks();
    if (tracks.length >= MAX_TRACKS) {
      console.log('[BGM Storage] Max tracks reached');
      return null;
    }

    const track: BgmTrack = {
      id: `bgm-${Date.now()}`,
      name: file.name,
      blob: file,
      addedAt: Date.now(),
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.add(track);

      request.onsuccess = () => resolve(track);
      request.onerror = () => reject(request.error);
    });
  }

  async removeTrack(id: string): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getAllTracks(): Promise<BgmTrack[]> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async getRandomTrack(): Promise<BgmTrack | null> {
    const tracks = await this.getAllTracks();
    if (tracks.length === 0) return null;
    return tracks[Math.floor(Math.random() * tracks.length)];
  }

  async clearAll(): Promise<void> {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

export const bgmStorage = new BgmStorage();
