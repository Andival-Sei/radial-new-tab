import { defaultData } from './data';
import type { AppData } from './types';
import { normalizeUrl } from './url';
import { DATA_KEY as KEY, readSyncedData, writeSyncedData } from './sync-storage';

const BACKGROUND_KEY = 'radialBackgroundImage';

function hasChromeStorage() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.sync);
}

function hasChromeLocalStorage() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function loadData(): Promise<AppData> {
  if (hasChromeStorage()) {
    const [sync, local] = await Promise.allSettled([
      readSyncedData(),
      chrome.storage.local.get(KEY),
    ]);
    if (sync.status === 'rejected' && local.status === 'rejected')
      throw new Error('Storage unavailable');
    const synced =
      sync.status === 'fulfilled'
        ? (sync.value as
            (Partial<AppData> & { savedAt?: number; storageVersion?: number }) | undefined)
        : undefined;
    const cached =
      local.status === 'fulfilled'
        ? (local.value[KEY] as
            (Partial<AppData> & { savedAt?: number; storageVersion?: number }) | undefined)
        : undefined;
    if (!synced && sync.status === 'rejected' && !cached) throw new Error('Sync data unavailable');
    // Legacy local values were only written after sync failed. Prefer that
    // recovery copy; new copies carry a timestamp on both storage areas.
    const preferSyncMigration = synced?.storageVersion === 2 && cached?.storageVersion !== 2;
    return mergeData(
      !preferSyncMigration &&
        cached &&
        (!synced || (cached.savedAt ?? Number.MAX_SAFE_INTEGER) >= (synced.savedAt ?? 0))
        ? cached
        : synced,
    );
  }
  const raw = localStorage.getItem(KEY);
  try {
    return mergeData(raw ? (JSON.parse(raw) as Partial<AppData>) : undefined);
  } catch {
    throw new Error('Stored data could not be read');
  }
}

let writeQueue: Promise<unknown> = Promise.resolve();
export type SaveResult = 'synced' | 'local';
export async function saveData(data: AppData): Promise<SaveResult> {
  const snapshot = { ...data, savedAt: Date.now(), storageVersion: 2 };
  const write = async (): Promise<SaveResult> => {
    if (hasChromeStorage()) {
      await chrome.storage.local.set({ [KEY]: snapshot });
      try {
        await writeSyncedData(snapshot);
        return 'synced';
      } catch {
        return 'local';
      }
    }
    localStorage.setItem(KEY, JSON.stringify(snapshot));
    return 'local';
  };
  const previous = writeQueue;
  const pending = (async () => {
    try {
      await previous;
    } catch {
      /* A failed save must not block later edits. */
    }
    if (globalThis.navigator?.locks) return navigator.locks.request('radial-data-write', write);
    return write();
  })();
  writeQueue = pending;
  return pending;
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

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const safeNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
const safeColor = (value: unknown) =>
  typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : '#6EA8FF';

/** Treat disk, sync and imported JSON as untrusted, versioned input. */
export function mergeData(input?: unknown): AppData {
  const stored = record(input);
  const collectionIds = new Set<string>();
  const collections: AppData['collections'] = [];
  for (const value of Array.isArray(stored.collections) ? stored.collections : []) {
    const item = record(value);
    if (
      typeof item.id !== 'string' ||
      !item.id ||
      collectionIds.has(item.id) ||
      typeof item.title !== 'string' ||
      !item.title.trim()
    )
      continue;
    collectionIds.add(item.id);
    collections.push({
      id: item.id,
      title: item.title.trim().slice(0, 48),
      color: safeColor(item.color),
      ...(typeof item.bookmarkFolderId === 'string'
        ? { bookmarkFolderId: item.bookmarkFolderId }
        : {}),
    });
  }
  const ids = new Set<string>();
  const shortcuts: AppData['shortcuts'] = [];
  for (const value of Array.isArray(stored.shortcuts) ? stored.shortcuts : defaultData.shortcuts) {
    const item = record(value);
    if (
      typeof item.id !== 'string' ||
      !item.id ||
      ids.has(item.id) ||
      typeof item.title !== 'string' ||
      typeof item.url !== 'string'
    )
      continue;
    try {
      const url = normalizeUrl(item.url);
      ids.add(item.id);
      shortcuts.push({
        id: item.id,
        url,
        title: (item.title.trim() || new URL(url).hostname).slice(0, 256),
        color: safeColor(item.color),
        pinned: item.pinned === true,
        source:
          item.source === 'topSites' || item.id.startsWith('top-site-') ? 'topSites' : 'manual',
        ...(typeof item.collectionId === 'string' && collectionIds.has(item.collectionId)
          ? { collectionId: item.collectionId }
          : {}),
      });
    } catch {
      /* Invalid links never become navigable. */
    }
  }
  const usage: AppData['usage'] = Object.create(null);
  const storedUsage = record(stored.usage);
  for (const item of shortcuts) {
    if (!Object.hasOwn(storedUsage, item.id)) continue;
    const stats = record(storedUsage[item.id]);
    const hours = Array.isArray(stats.hourBuckets) ? stats.hourBuckets : [];
    const weekdays = Array.isArray(stats.weekdayBuckets) ? stats.weekdayBuckets : [];
    usage[item.id] = {
      count: safeNumber(stats.count),
      lastOpened: safeNumber(stats.lastOpened),
      hourBuckets: Array.from({ length: 4 }, (_, i) => safeNumber(hours[i])),
      weekdayBuckets: Array.from({ length: 7 }, (_, i) => safeNumber(weekdays[i])),
    };
  }
  const settings = { ...defaultData.settings };
  const candidate = record(stored.settings);
  for (const key of [
    'clock24',
    'showSeconds',
    'compactMode',
    'autoAddTopSites',
    'collectionsEnabled',
  ] as const) {
    if (typeof candidate[key] === 'boolean') settings[key] = candidate[key];
  }
  if (candidate.theme === 'system' || candidate.theme === 'light' || candidate.theme === 'dark')
    settings.theme = candidate.theme;
  if (candidate.language === 'auto' || candidate.language === 'ru' || candidate.language === 'en')
    settings.language = candidate.language;
  if (
    candidate.searchEngine === 'browser' ||
    candidate.searchEngine === 'google' ||
    candidate.searchEngine === 'yandex' ||
    candidate.searchEngine === 'bing' ||
    candidate.searchEngine === 'duckduckgo'
  )
    settings.searchEngine = candidate.searchEngine;
  return {
    shortcuts,
    collections,
    usage,
    settings,
    dismissedAutoSites: Array.isArray(stored.dismissedAutoSites)
      ? [
          ...new Set(
            stored.dismissedAutoSites.filter((item): item is string => typeof item === 'string'),
          ),
        ]
      : [],
  };
}
