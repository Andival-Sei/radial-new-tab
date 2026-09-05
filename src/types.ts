export type Theme = 'system' | 'light' | 'dark';
export type Language = 'auto' | 'ru' | 'en';
export type SearchEngine = 'browser' | 'google' | 'yandex' | 'bing' | 'duckduckgo';
export type LayoutMode = 'tiles';
export type ShortcutSource = 'manual' | 'topSites';

export interface Shortcut {
  id: string;
  title: string;
  url: string;
  color: string;
  collectionId?: string;
  source?: ShortcutSource;
  pinned?: boolean;
}

export interface Collection {
  id: string;
  title: string;
  color: string;
  /** Browser bookmark folder id, when the collection came from an import. */
  bookmarkFolderId?: string;
}

export interface Settings {
  theme: Theme;
  language: Language;
  searchEngine: SearchEngine;
  clock24: boolean;
  showSeconds: boolean;
  compactMode: boolean;
  layoutMode: LayoutMode;
  autoAddTopSites: boolean;
  collectionsEnabled: boolean;
}

export interface AppData {
  shortcuts: Shortcut[];
  collections: Collection[];
  dismissedAutoSites: string[];
  settings: Settings;
  usage: Record<string, {
    count: number;
    lastOpened: number;
    hourBuckets?: number[];
    weekdayBuckets?: number[];
  }>;
}
