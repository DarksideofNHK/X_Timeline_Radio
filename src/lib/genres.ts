import type { Genre, GenreConfig } from '../types';

export const GENRES: GenreConfig[] = [
  {
    id: 'trending',
    name: '今バズってる',
    icon: '🔥',
    query: '直近3時間以内で最もバズっている日本語の投稿。ジャンル問わず、いいね・RT・リプライが急上昇中のもの',
  },
  {
    id: 'politics',
    name: '政治',
    icon: '🏛️',
    query: '日本の政治ニュース、国会、政府、政党に関するバズ投稿。賛否が分かれている議論も含む',
  },
  {
    id: 'economy',
    name: '経済',
    icon: '💹',
    query: '経済ニュース、株価、為替、企業ニュース、ビジネスに関するバズ投稿',
  },
  {
    id: 'lifestyle',
    name: '暮らし',
    icon: '🏠',
    query: '暮らし、生活、グルメ、旅行、育児、健康、ライフハックに関するバズ投稿',
  },
  {
    id: 'entertainment',
    name: 'エンタメ',
    icon: '🎬',
    query: 'エンタメ、芸能、音楽、映画、ドラマ、アニメ、ゲームに関するバズ投稿',
  },
  {
    id: 'science',
    name: '科学・テック',
    icon: '🔬',
    query: '科学、テクノロジー、AI、宇宙、医療、研究に関するバズ投稿',
  },
  {
    id: 'international',
    name: '国際',
    icon: '🌍',
    query: '国際ニュース、海外の話題、世界情勢に関するバズ投稿。日本語で議論されているもの',
  },
];

export function getGenreConfig(genre: Genre): GenreConfig {
  return GENRES.find((g) => g.id === genre) || GENRES[0];
}

// 番組構成用のセグメント順序
export const PROGRAM_SEGMENTS: Genre[] = [
  'trending',      // 最初は今バズってるもの
  'politics',
  'economy',
  'lifestyle',
  'entertainment',
  'science',
  'international',
];

// 各セグメントあたりのPost数
export const POSTS_PER_SEGMENT = 10;

// 合計Post数
export const TOTAL_POSTS = PROGRAM_SEGMENTS.length * POSTS_PER_SEGMENT;
