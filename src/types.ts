export type Theme = 'system' | 'light' | 'dark';
export type Language = 'auto' | 'ru' | 'en';
export type SearchEngine = 'browser' | 'google' | 'yandex' | 'bing' | 'duckduckgo';

export interface Shortcut {
  id: string;
  title: string;
  url: string;
  color: string;
}

export interface Settings {
  theme: Theme;
  language: Language;
  searchEngine: SearchEngine;
  clock24: boolean;
  showSeconds: boolean;
  compactMode: boolean;
}

export interface AppData {
  shortcuts: Shortcut[];
  settings: Settings;
}
