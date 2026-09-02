import { defaultData } from './data';
import type { AppData } from './types';

const KEY = 'radialData';
const BACKGROUND_KEY = 'radialBackgroundImage';

function hasChromeStorage() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.sync);
}

function hasChromeLocalStorage() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
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

/**
 * Background images stay local to the device. Keeping them outside of AppData
 * avoids filling the small storage.sync quota with base64 image data.
 */
export async function loadBackgroundImage(): Promise<string | null> {
  if (hasChromeLocalStorage()) {
    try {
      const result = await chrome.storage.local.get(BACKGROUND_KEY);
      return typeof result[BACKGROUND_KEY] === 'string' ? result[BACKGROUND_KEY] : null;
    } catch {
      return null;
    }
  }
  return localStorage.getItem(BACKGROUND_KEY);
}

export async function saveBackgroundImage(image: string | null) {
  if (hasChromeLocalStorage()) {
    if (image) await chrome.storage.local.set({ [BACKGROUND_KEY]: image });
    else await chrome.storage.local.remove(BACKGROUND_KEY);
    return;
  }
  if (image) localStorage.setItem(BACKGROUND_KEY, image);
  else localStorage.removeItem(BACKGROUND_KEY);
}

export function mergeData(stored?: Partial<AppData>): AppData {
  return {
    shortcuts: Array.isArray(stored?.shortcuts) ? stored.shortcuts : defaultData.shortcuts,
    settings: { ...defaultData.settings, ...stored?.settings },
    usage: stored?.usage && typeof stored.usage === 'object' ? stored.usage : {},
  };
}
