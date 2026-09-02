import { defaultData } from './data';
import type { AppData } from './types';

const KEY = 'radialData';

function hasChromeStorage() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.sync);
}

export async function loadData(): Promise<AppData> {
  if (hasChromeStorage()) {
    try {
      const result = await chrome.storage.sync.get(KEY);
      const stored = result[KEY] as Partial<AppData> | undefined;
      return mergeData(stored);
    } catch {
      const result = await chrome.storage.local.get(KEY);
      return mergeData(result[KEY] as Partial<AppData> | undefined);
    }
  }
  const raw = localStorage.getItem(KEY);
  return mergeData(raw ? JSON.parse(raw) as Partial<AppData> : undefined);
}

export async function saveData(data: AppData) {
  if (hasChromeStorage()) {
    try { await chrome.storage.sync.set({ [KEY]: data }); }
    catch { await chrome.storage.local.set({ [KEY]: data }); }
  } else localStorage.setItem(KEY, JSON.stringify(data));
}

export function mergeData(stored?: Partial<AppData>): AppData {
  return {
    shortcuts: Array.isArray(stored?.shortcuts) ? stored.shortcuts : defaultData.shortcuts,
    settings: { ...defaultData.settings, ...stored?.settings },
  };
}
