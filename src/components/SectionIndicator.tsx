import { useStore } from '../store/useStore';
import { formatScriptDate } from '../lib/scriptStorage';

export function SectionIndicator() {
  const aiProgram = useStore((state) => state.aiProgram);
  const currentSectionIndex = useStore((state) => state.currentSectionIndex);
  const currentChunkIndex = useStore((state) => state.currentChunkIndex);

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
          <span className="text-2xl">{getSectionIcon(currentSection.type, currentSection.genre)}</span>
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
            {getSectionIcon(section.type, section.genre)}
            <span className="ml-1 hidden sm:inline">
              {section.type === 'opening' && 'OP'}
              {section.type === 'closing' && 'ED'}
              {section.type === 'corner' && section.genre?.slice(0, 3)}
              {section.type === 'transition' && '→'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// セクションタイプとジャンルに応じたアイコン
function getSectionIcon(type: string, genre?: string): string {
  if (type === 'opening') return '📻';
  if (type === 'closing') return '👋';
  if (type === 'transition') return '🎵';

  // コーナーの場合はジャンルに応じたアイコン
  const genreIcons: Record<string, string> = {
    trending: '🔥',
    politics: '🏛️',
    economy: '💹',
    lifestyle: '🏠',
    entertainment: '🎬',
    science: '🔬',
    international: '🌍',
  };

  return genre ? genreIcons[genre] || '📰' : '📰';
}
