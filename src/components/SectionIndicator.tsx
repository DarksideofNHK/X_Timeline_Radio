import { useStore } from '../store/useStore';
import { formatScriptDate } from '../lib/scriptStorage';

export function SectionIndicator() {
  const aiProgram = useStore((state) => state.aiProgram);
  const currentSectionIndex = useStore((state) => state.currentSectionIndex);
  const currentChunkIndex = useStore((state) => state.currentChunkIndex);
  const audioSettings = useStore((state) => state.audioSettings);
  const showType = audioSettings.showType;

  if (!aiProgram || !aiProgram.sections || aiProgram.sections.length === 0) {
    return null;
  }

  const currentSection = aiProgram.sections[currentSectionIndex];
  if (!currentSection) return null;

  const totalSections = aiProgram.sections.length;
  const totalChunks = currentSection.chunks?.length || 0;
  const progress = ((currentSectionIndex / totalSections) * 100).toFixed(0);

  return (
    <div className="bg-bg-card rounded-xl p-4 border border-border-light shadow-sm">
      {/* 生成日時 */}
      {aiProgram.generatedAt && (
        <div className="text-xs text-text-disabled mb-2">
          生成日時: {formatScriptDate(aiProgram.generatedAt)}
        </div>
      )}

      {/* 現在のセクション */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl">{getSectionIcon(currentSection.type, currentSection.genre, showType)}</span>
          <div>
            <h3 className="font-bold text-lg text-text-primary">{currentSection.title}</h3>
            <p className="text-text-secondary text-sm">
              セクション {currentSectionIndex + 1} / {totalSections}
              {totalChunks > 1 && ` (パート ${currentChunkIndex + 1}/${totalChunks})`}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-text-secondary text-sm">番組進行</p>
          <p className="text-xl font-bold text-purple-600">{progress}%</p>
        </div>
      </div>

      {/* プログレスバー */}
      <div className="h-2 bg-bg-menu rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* セクション一覧 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {aiProgram.sections.map((section, index) => (
          <div
            key={section.id}
            className={`px-2 py-1 rounded text-xs transition-all ${
              index === currentSectionIndex
                ? 'bg-purple-600 text-white'
                : index < currentSectionIndex
                  ? 'bg-green-100 text-green-700'
                  : 'bg-bg-menu text-text-secondary'
            }`}
          >
            {getSectionIcon(section.type, section.genre, showType)}
            <span className="ml-1 hidden sm:inline">
              {section.type === 'opening' && 'OP'}
              {section.type === 'closing' && 'ED'}
              {section.type === 'corner' && getGenreShortName(section.genre, showType)}
              {section.type === 'transition' && '→'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// セクションタイプとジャンルに応じたアイコン（番組タイプ対応）
function getSectionIcon(type: string, genre?: string, showType?: string): string {
  // 番組タイプ別のオープニング・クロージングアイコン
  if (type === 'opening') {
    if (showType === 'politician-watch') return '🥊';
    if (showType === 'old-media-buster') return '💥';
    if (showType === 'disaster-news') return '🚨';
    return '📻';
  }
  if (type === 'closing') {
    if (showType === 'politician-watch') return '🏆';
    if (showType === 'old-media-buster') return '✊';
    if (showType === 'disaster-news') return '🙏';
    return '👋';
  }
  if (type === 'transition') return '🎵';

  // X Timeline Radio用
  const xTimelineIcons: Record<string, string> = {
    trending: '🔥',
    politics: '🏛️',
    economy: '💹',
    lifestyle: '🏠',
    entertainment: '🎬',
    science: '🔬',
    international: '🌍',
  };

  // 政治家ウオッチ用
  const politicianIcons: Record<string, string> = {
    'ruling-ldp': '🔴',
    'ruling-komeito': '🟡',
    'opposition-cdp': '🔵',
    'opposition-ishin': '🟠',
    'opposition-dpfp': '🟢',
    'opposition-others': '🟣',
    'public-reaction': '💬',
  };

  // オールドメディア用
  const oldMediaIcons: Record<string, string> = {
    'nhk': '📺',
    'newspapers': '📰',
    'tv-stations': '📡',
  };

  // 災害ニュース用（速報性重視の新構成）
  const disasterIcons: Record<string, string> = {
    'damage': '🔥',
    'breaking': '🚨',
    'local-voices': '📢',
    'warnings': '⚠️',
    'infrastructure': '🚃',
    'preparedness': '🛡️',
  };

  // 番組タイプに応じてアイコンマップを選択
  let icons = xTimelineIcons;
  if (showType === 'politician-watch') icons = politicianIcons;
  if (showType === 'old-media-buster') icons = oldMediaIcons;
  if (showType === 'disaster-news') icons = disasterIcons;

  return genre ? icons[genre] || '📰' : '📰';
}

// ジャンルの短縮名を取得（番組タイプ対応）
function getGenreShortName(genre?: string, showType?: string): string {
  if (!genre) return '';

  // X Timeline Radio用
  const xTimelineNames: Record<string, string> = {
    trending: 'バズ',
    politics: '政治',
    economy: '経済',
    lifestyle: '生活',
    entertainment: '芸能',
    science: '科学',
    international: '国際',
  };

  // 政治家ウオッチ用
  const politicianNames: Record<string, string> = {
    'ruling-ldp': '自民',
    'ruling-komeito': '公明',
    'opposition-cdp': '立民',
    'opposition-ishin': '維新',
    'opposition-dpfp': '国民',
    'opposition-others': '他党',
    'public-reaction': '反応',
  };

  // オールドメディア用
  const oldMediaNames: Record<string, string> = {
    'nhk': 'NHK',
    'newspapers': '新聞',
    'tv-stations': '民放',
  };

  // 災害ニュース用（速報性重視の新構成）
  const disasterNames: Record<string, string> = {
    'damage': '被害',
    'breaking': '速報',
    'local-voices': '現地',
    'warnings': '警報',
    'infrastructure': '交通',
    'preparedness': '防災',
  };

  // 番組タイプに応じて名前マップを選択
  let names = xTimelineNames;
  if (showType === 'politician-watch') names = politicianNames;
  if (showType === 'old-media-buster') names = oldMediaNames;
  if (showType === 'disaster-news') names = disasterNames;

  return names[genre] || genre.slice(0, 3);
}
