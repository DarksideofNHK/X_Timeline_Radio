// BGM管理クラス
// デフォルトBGMまたはユーザーアップロードBGMを再生

import { bgmStorage } from './bgmStorage';

export type BgmSource = 'none' | 'default' | 'uploaded';

// モバイルブラウザ判定
function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// モバイル用音量補正 (-14dB ≈ 0.2倍)
const MOBILE_VOLUME_MULTIPLIER = 0.2;

// 番組タイプ別BGM設定
const SHOW_TYPE_BGMS: Record<string, { name: string; path: string }> = {
  'x-timeline-radio': {
    name: 'Digital Newsfeed Groove',
    path: '/bgm/Digital_Newsfeed_Groove_2026-01-03T112506.mp3',
  },
  'politician-watch': {
    name: 'Cybernetic Dominion',
    path: '/bgm/Cybernetic_Dominion_2026-01-04T093727.mp3',
  },
  'old-media-buster': {
    name: 'Decline of the Old Guard',
    path: '/bgm/Decline_of_the_Old_Guard_2026-01-04T074159.mp3',
  },
};

// デフォルトBGM設定（フォールバック）
const DEFAULT_BGM = SHOW_TYPE_BGMS['x-timeline-radio'];

interface BgmConfig {
  source: BgmSource;
  volume: number; // 0-1
  showType: string; // 番組タイプ
}

class BgmManager {
  private audioElement: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private isPlaying = false;
  private isMobile: boolean;
  private config: BgmConfig = {
    source: 'default', // デフォルトBGMをデフォルトに
    volume: 0.004, // -18dB追加調整後（旧: 0.034 → 0.004）パーソナリティの声を優先
    showType: 'x-timeline-radio', // デフォルトはX Timeline Radio
  };

  constructor() {
    this.isMobile = isMobileBrowser();
    if (this.isMobile) {
      console.log('[BGM] Mobile browser detected, applying -8dB volume reduction');
    }
  }

  // モバイル対応の実効音量を取得
  private getEffectiveVolume(baseVolume: number): number {
    return this.isMobile ? baseVolume * MOBILE_VOLUME_MULTIPLIER : baseVolume;
  }

  // 設定を更新
  setConfig(config: Partial<BgmConfig>) {
    this.config = { ...this.config, ...config };
    if (this.audioElement) {
      this.audioElement.volume = this.getEffectiveVolume(this.config.volume);
    }
  }

  // BGM再生開始
  async start() {
    if (this.isPlaying) return;
    if (this.config.source === 'none') return;

    console.log('[BGM] Starting...', this.config.source);

    let audioSrc: string;
    let trackName: string;

    if (this.config.source === 'default') {
      // 番組タイプ別のBGMを使用
      const showBgm = SHOW_TYPE_BGMS[this.config.showType] || DEFAULT_BGM;
      audioSrc = showBgm.path;
      trackName = showBgm.name;
      console.log(`[BGM] Using BGM for ${this.config.showType}: ${trackName}`);
    } else {
      // ユーザーアップロードBGMを使用
      const track = await bgmStorage.getRandomTrack();
      if (!track) {
        console.log('[BGM] No uploaded tracks available, falling back to show-specific BGM');
        const showBgm = SHOW_TYPE_BGMS[this.config.showType] || DEFAULT_BGM;
        audioSrc = showBgm.path;
        trackName = showBgm.name;
      } else {
        // 前のObjectURLを解放
        if (this.currentObjectUrl) {
          URL.revokeObjectURL(this.currentObjectUrl);
        }
        this.currentObjectUrl = URL.createObjectURL(track.blob);
        audioSrc = this.currentObjectUrl;
        trackName = track.name;
      }
    }

    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }

    this.audioElement = new Audio(audioSrc);
    this.audioElement.loop = true;
    this.audioElement.volume = this.getEffectiveVolume(this.config.volume);

    // 曲が終わったら次のランダム曲へ（アップロード曲の場合のみ）
    this.audioElement.onended = () => {
      if (this.config.source === 'uploaded') {
        this.playNext();
      }
    };

    try {
      await this.audioElement.play();
      this.isPlaying = true;
      console.log(`[BGM] Playing: ${trackName}`);
    } catch (e) {
      console.error('[BGM] Failed to play:', e);
      this.isPlaying = false;
    }
  }

  // 次の曲を再生
  private async playNext() {
    if (!this.isPlaying) return;

    const track = await bgmStorage.getRandomTrack();
    if (!track) return;

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
    }

    this.currentObjectUrl = URL.createObjectURL(track.blob);

    if (this.audioElement) {
      this.audioElement.src = this.currentObjectUrl;
      try {
        await this.audioElement.play();
        console.log(`[BGM] Now playing: ${track.name}`);
      } catch (e) {
        console.error('[BGM] Failed to play next:', e);
      }
    }
  }

  // BGM停止
  stop() {
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement = null;
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    this.isPlaying = false;
    console.log('[BGM] Stopped');
  }

  // フェードアウト（TTS再生時）
  fadeOut(duration = 500): Promise<void> {
    return new Promise((resolve) => {
      if (!this.audioElement) {
        resolve();
        return;
      }

      const effectiveVolume = this.getEffectiveVolume(this.config.volume);
      const targetVolume = effectiveVolume * 0.25; // 25%まで（TTS音声を際立たせる）
      const startVolume = this.audioElement.volume;
      const steps = 20;
      const stepDuration = duration / steps;
      const volumeStep = (startVolume - targetVolume) / steps;

      let currentStep = 0;
      const interval = setInterval(() => {
        currentStep++;
        const newVolume = Math.max(0, startVolume - (volumeStep * currentStep));

        if (this.audioElement) {
          this.audioElement.volume = newVolume;
        }

        if (currentStep >= steps) {
          clearInterval(interval);
          resolve();
        }
      }, stepDuration);
    });
  }

  // フェードイン（TTS終了時）
  fadeIn(duration = 300): Promise<void> {
    return new Promise((resolve) => {
      if (!this.audioElement) {
        resolve();
        return;
      }

      const targetVolume = this.getEffectiveVolume(this.config.volume);
      const startVolume = this.audioElement.volume;
      const steps = 15;
      const stepDuration = duration / steps;
      const volumeStep = (targetVolume - startVolume) / steps;

      let currentStep = 0;
      const interval = setInterval(() => {
        currentStep++;
        const newVolume = Math.min(1, startVolume + (volumeStep * currentStep));

        if (this.audioElement) {
          this.audioElement.volume = newVolume;
        }

        if (currentStep >= steps) {
          clearInterval(interval);
          resolve();
        }
      }, stepDuration);
    });
  }

  // ダッキング（TTS再生中は音量を下げる）
  async duck() {
    await this.fadeOut(300);
  }

  // ダッキング解除
  async unduck() {
    await this.fadeIn(200);
  }

  // 状態取得
  getIsPlaying() {
    return this.isPlaying;
  }

  getConfig() {
    return { ...this.config };
  }
}

// シングルトンインスタンス
export const bgmManager = new BgmManager();
