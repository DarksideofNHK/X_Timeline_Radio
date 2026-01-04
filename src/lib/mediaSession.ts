// Media Session API 管理
// バックグラウンド再生・ロック画面コントロール対応

export interface MediaSessionInfo {
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
}

type PlaybackState = 'playing' | 'paused' | 'none';

class MediaSessionManager {
  private isSupported: boolean;
  private actionHandlers: {
    play?: () => void;
    pause?: () => void;
    stop?: () => void;
    nexttrack?: () => void;
    previoustrack?: () => void;
  } = {};

  constructor() {
    this.isSupported = 'mediaSession' in navigator;
    if (this.isSupported) {
      console.log('[MediaSession] Supported');
    } else {
      console.log('[MediaSession] Not supported in this browser');
    }
  }

  // アクションハンドラーを設定
  setActionHandlers(handlers: {
    play?: () => void;
    pause?: () => void;
    stop?: () => void;
    nexttrack?: () => void;
    previoustrack?: () => void;
  }) {
    if (!this.isSupported) return;

    this.actionHandlers = handlers;

    try {
      if (handlers.play) {
        navigator.mediaSession.setActionHandler('play', () => {
          console.log('[MediaSession] Play action');
          handlers.play?.();
        });
      }

      if (handlers.pause) {
        navigator.mediaSession.setActionHandler('pause', () => {
          console.log('[MediaSession] Pause action');
          handlers.pause?.();
        });
      }

      if (handlers.stop) {
        navigator.mediaSession.setActionHandler('stop', () => {
          console.log('[MediaSession] Stop action');
          handlers.stop?.();
        });
      }

      if (handlers.nexttrack) {
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          console.log('[MediaSession] Next track action');
          handlers.nexttrack?.();
        });
      }

      if (handlers.previoustrack) {
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          console.log('[MediaSession] Previous track action');
          handlers.previoustrack?.();
        });
      }

      console.log('[MediaSession] Action handlers registered');
    } catch (e) {
      console.error('[MediaSession] Failed to set action handlers:', e);
    }
  }

  // メタデータを更新
  updateMetadata(info: MediaSessionInfo) {
    if (!this.isSupported) return;

    try {
      const metadata: MediaMetadataInit = {
        title: info.title,
        artist: info.artist || 'X Timeline Radio',
        album: info.album || 'バズ投稿ラジオ',
      };

      // アートワーク（アイコン）を設定
      if (info.artwork) {
        metadata.artwork = [
          { src: info.artwork, sizes: '512x512', type: 'image/png' },
        ];
      } else {
        // デフォルトアイコン（SVGを使用）
        metadata.artwork = [
          { src: '/radio.svg', sizes: '512x512', type: 'image/svg+xml' },
        ];
      }

      navigator.mediaSession.metadata = new MediaMetadata(metadata);
      console.log(`[MediaSession] Metadata updated: ${info.title}`);
    } catch (e) {
      console.error('[MediaSession] Failed to update metadata:', e);
    }
  }

  // 再生状態を更新
  setPlaybackState(state: PlaybackState) {
    if (!this.isSupported) return;

    try {
      navigator.mediaSession.playbackState = state;
      console.log(`[MediaSession] Playback state: ${state}`);
    } catch (e) {
      console.error('[MediaSession] Failed to set playback state:', e);
    }
  }

  // 再生位置を更新（オプション）
  setPositionState(duration: number, position: number, playbackRate: number = 1.0) {
    if (!this.isSupported) return;

    try {
      navigator.mediaSession.setPositionState({
        duration,
        position,
        playbackRate,
      });
    } catch (e) {
      // ブラウザがサポートしていない場合はログのみ
      console.debug('[MediaSession] Position state not supported');
    }
  }

  // Media Sessionを初期化
  initialize() {
    if (!this.isSupported) return;

    // 初期メタデータを設定
    this.updateMetadata({
      title: 'X Timeline Radio',
      artist: 'バズ投稿ラジオ',
      album: '準備中...',
    });

    this.setPlaybackState('none');
    console.log('[MediaSession] Initialized');
  }

  // クリーンアップ
  cleanup() {
    if (!this.isSupported) return;

    try {
      navigator.mediaSession.metadata = null;
      this.setPlaybackState('none');

      // ハンドラーを解除
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
      navigator.mediaSession.setActionHandler('nexttrack', null);
      navigator.mediaSession.setActionHandler('previoustrack', null);

      console.log('[MediaSession] Cleaned up');
    } catch (e) {
      console.error('[MediaSession] Cleanup error:', e);
    }
  }
}

// シングルトンインスタンス
export const mediaSessionManager = new MediaSessionManager();
