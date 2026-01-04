/**
 * 番組タイプ定義（フロントエンド用）
 * API側の定義と同期を保つこと
 */

export interface ShowTypeConfig {
  id: string;
  name: string;
  description: string;
  icon: string;
  allowDownload: boolean;
  color: string; // UIテーマカラー
  isTest?: boolean; // テスト版フラグ
}

// 利用可能な番組タイプ
export const SHOW_TYPES: ShowTypeConfig[] = [
  {
    id: 'x-timeline-radio',
    name: 'X Timeline Radio',
    description: 'Xのトレンドを7ジャンルでお届け',
    icon: '📻',
    allowDownload: false,
    color: 'blue',
    isTest: false,
  },
  {
    id: 'politician-watch',
    name: 'X政治家ウオッチ',
    description: '与野党政治家のX投稿をバトル実況風に紹介',
    icon: '🥊',
    allowDownload: true, // 公人なのでOK
    color: 'red',
    isTest: true, // テスト版
  },
  {
    id: 'old-media-buster',
    name: 'オールドメディアをぶっ壊せラジオ',
    description: 'NHK・新聞・TV局への批判投稿を紹介',
    icon: '📺',
    allowDownload: false, // 一般人の投稿含む
    color: 'orange',
    isTest: true, // テスト版
  },
];

// IDから番組タイプを取得
export function getShowType(id: string): ShowTypeConfig | undefined {
  return SHOW_TYPES.find(s => s.id === id);
}

// ダウンロード可能かどうかを判定
export function isDownloadAllowed(showTypeId: string): boolean {
  const showType = getShowType(showTypeId);
  return showType?.allowDownload ?? false;
}
