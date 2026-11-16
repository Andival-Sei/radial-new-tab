import type { AppData, Shortcut } from './types';
import { shortcutColors } from './data';
import { getHourBucket } from './smart-ranking';

export function recordShortcutVisit(data: AppData, id: string, openedAt = new Date()): AppData {
  const previous = Object.hasOwn(data.usage, id) ? data.usage[id] : { count: 0, lastOpened: 0 };
  const hourBuckets = Array.from({ length: 4 }, (_, i) => previous.hourBuckets?.[i] ?? 0);
  const weekdayBuckets = Array.from({ length: 7 }, (_, i) => previous.weekdayBuckets?.[i] ?? 0);
  hourBuckets[getHourBucket(openedAt)] += 1;
  weekdayBuckets[openedAt.getDay()] += 1;
  return {
    ...data,
    usage: {
      ...data.usage,
      [id]: {
        count: previous.count + 1,
        lastOpened: openedAt.getTime(),
        hourBuckets,
        weekdayBuckets,
      },
    },
  };
}

export function hostLabel(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function isAutoShortcut(item: Shortcut) {
  return item.source === 'topSites' || item.id.startsWith('top-site-');
}

function stableSiteId(url: string) {
  let hash = 0;
  for (let index = 0; index < url.length; index += 1)
    hash = ((hash << 5) - hash + url.charCodeAt(index)) | 0;
  return `top-site-${Math.abs(hash).toString(36)}`;
}

export function asTopSiteShortcut(
  site: { title?: string; url?: string },
  index: number,
): Shortcut | null {
  if (!site.url) return null;
  try {
    const parsed = new URL(site.url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    const host = parsed.hostname.replace(/^www\./, '');
    return {
      id: stableSiteId(site.url),
      title: site.title?.trim() || host,
      url: parsed.toString(),
      color: shortcutColors[index % shortcutColors.length],
      source: 'topSites',
    };
  } catch {
    return null;
  }
}
