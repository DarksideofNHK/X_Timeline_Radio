import type { AIScriptProgram } from '../types';

const STORAGE_KEY = 'x-timeline-radio-saved-scripts';
const MAX_SAVED_SCRIPTS = 10;

export interface SavedScript {
  id: string;
  program: AIScriptProgram;
  savedAt: string;
  title: string;
}

// 保存済みスクリプト一覧を取得
export function getSavedScripts(): SavedScript[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return [];
    return JSON.parse(data) as SavedScript[];
  } catch (e) {
    console.error('Failed to load saved scripts:', e);
    return [];
  }
}

// スクリプトを保存
export function saveScript(program: AIScriptProgram, customTitle?: string): SavedScript {
  const scripts = getSavedScripts();

  const date = new Date(program.generatedAt);
  const defaultTitle = `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;

  const savedScript: SavedScript = {
    id: program.id,
    program,
    savedAt: new Date().toISOString(),
    title: customTitle || defaultTitle,
  };

  // 同じIDのスクリプトがあれば更新、なければ追加
  const existingIndex = scripts.findIndex(s => s.id === program.id);
  if (existingIndex >= 0) {
    scripts[existingIndex] = savedScript;
  } else {
    scripts.unshift(savedScript);
  }

  // 最大保存数を超えたら古いものを削除
  while (scripts.length > MAX_SAVED_SCRIPTS) {
    scripts.pop();
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
  return savedScript;
}

// スクリプトを削除
export function deleteScript(id: string): void {
  const scripts = getSavedScripts().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scripts));
}

// スクリプトを取得
export function getScript(id: string): SavedScript | null {
  const scripts = getSavedScripts();
  return scripts.find(s => s.id === id) || null;
}

// 日時をフォーマット
export function formatScriptDate(isoString: string): string {
  const date = new Date(isoString);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}
