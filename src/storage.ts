import { defaultData } from './data';
import type { AppData } from './types';
import { normalizeUrl } from './url';

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
    const [sync, local] = await Promise.allSettled([chrome.storage.sync.get(KEY), chrome.storage.local.get(KEY)]);
    if (sync.status === 'rejected' && local.status === 'rejected') throw new Error('Storage unavailable');
    const synced = sync.status === 'fulfilled' ? sync.value[KEY] as (Partial<AppData> & { savedAt?: number }) | undefined : undefined;
    const cached = local.status === 'fulfilled' ? local.value[KEY] as (Partial<AppData> & { savedAt?: number }) | undefined : undefined;
    // Legacy local values were only written after sync failed. Prefer that
    // recovery copy; new copies carry a timestamp on both storage areas.
    return mergeData(cached && (!synced || (cached.savedAt ?? Number.MAX_SAFE_INTEGER) >= (synced.savedAt ?? 0)) ? cached : synced);
  }
  const raw = localStorage.getItem(KEY);
  try { return mergeData(raw ? JSON.parse(raw) as Partial<AppData> : undefined); }
  catch { throw new Error('Stored data could not be read'); }
}

let writeQueue: Promise<unknown> = Promise.resolve();
export async function saveData(data: AppData) {
  const snapshot = { ...data, savedAt: Date.now() };
  const write = async () => {
    if (hasChromeStorage()) {
      await chrome.storage.local.set({ [KEY]: snapshot });
      try { await chrome.storage.sync.set({ [KEY]: snapshot }); }
      catch { /* Local mirror remains authoritative when sync is full/offline. */ }
    } else localStorage.setItem(KEY, JSON.stringify(snapshot));
  };
  writeQueue = writeQueue.catch(() => undefined).then(write);
  return writeQueue;
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
  const collections = Array.isArray(stored?.collections)
    ? stored.collections.filter((item): item is AppData['collections'][number] => Boolean(item && typeof item.id === 'string' && typeof item.title === 'string' && typeof item.color === 'string'))
    : defaultData.collections;
  const collectionIds = new Set(collections.map((item) => item.id));
  const ids = new Set<string>();
  const shortcuts = (Array.isArray(stored?.shortcuts) ? stored.shortcuts : defaultData.shortcuts).flatMap((item) => {
    if (!item || typeof item.id !== 'string' || ids.has(item.id) || typeof item.title !== 'string' || typeof item.url !== 'string') return [];
    try {
      const url = normalizeUrl(item.url);
      ids.add(item.id);
      return [{ ...item, url, title: item.title.trim() || new URL(url).hostname, pinned: item.pinned === true, color: /^#[\da-f]{6}$/i.test(item.color) ? item.color : '#6EA8FF' }];
    } catch { return []; }
  });
  const usage: AppData['usage'] = {};
  const safeNumber = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
  for (const item of shortcuts) {
    const stats = stored?.usage?.[item.id];
    if (!stats) continue;
    usage[item.id] = { count: safeNumber(stats.count), lastOpened: safeNumber(stats.lastOpened), hourBuckets: Array.from({ length: 4 }, (_, i) => safeNumber(stats.hourBuckets?.[i])), weekdayBuckets: Array.from({ length: 7 }, (_, i) => safeNumber(stats.weekdayBuckets?.[i])) };
  }
  const dismissedAutoSites = Array.isArray(stored?.dismissedAutoSites)
    ? stored.dismissedAutoSites.filter((item): item is string => typeof item === 'string')
    : defaultData.dismissedAutoSites;
  return {
    shortcuts: shortcuts.map((item) => ({
      ...item,
      source: item.source === 'topSites' || item.id.startsWith('top-site-') ? 'topSites' : 'manual',
      ...(item.collectionId && collectionIds.has(item.collectionId) ? { collectionId: item.collectionId } : { collectionId: undefined }),
    })),
    collections,
    dismissedAutoSites,
    settings: { ...defaultData.settings, ...stored?.settings, layoutMode: 'tiles' },
    usage,
  };
}
