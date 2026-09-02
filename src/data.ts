import type { AppData, Shortcut } from './types';

export const shortcutColors = ['#6EA8FF', '#67E8F9', '#A78BFA', '#FB7185', '#FBBF24', '#34D399'];

export const initialShortcuts: Shortcut[] = [
  { id: 'edge', title: 'Microsoft', url: 'https://www.microsoft.com', color: '#6EA8FF' },
  { id: 'github', title: 'GitHub', url: 'https://github.com', color: '#A78BFA' },
  { id: 'youtube', title: 'YouTube', url: 'https://youtube.com', color: '#FB7185' },
  { id: 'mail', title: 'Mail', url: 'https://outlook.live.com', color: '#67E8F9' },
  { id: 'drive', title: 'Drive', url: 'https://drive.google.com', color: '#FBBF24' },
  { id: 'reddit', title: 'Reddit', url: 'https://reddit.com', color: '#FB7185' },
  { id: 'chatgpt', title: 'ChatGPT', url: 'https://chatgpt.com', color: '#34D399' },
  { id: 'telegram', title: 'Telegram', url: 'https://web.telegram.org', color: '#6EA8FF' },
  { id: 'notion', title: 'Notion', url: 'https://notion.so', color: '#A78BFA' },
];

export const defaultData: AppData = {
  shortcuts: initialShortcuts,
  collections: [],
  dismissedAutoSites: [],
  settings: {
    theme: 'system',
    language: 'auto',
    searchEngine: 'browser',
    clock24: true,
    showSeconds: false,
    compactMode: false,
    layoutMode: 'orbit',
    autoAddTopSites: false,
    collectionsEnabled: false,
  },
  usage: {},
};
