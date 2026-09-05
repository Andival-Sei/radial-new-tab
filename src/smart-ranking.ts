import type { AppData, Shortcut } from './types';

export type SmartReason = 'pinned' | 'rightNow' | 'today' | 'recent' | 'frequent' | 'suggested' | null;

export interface RankedShortcut {
  item: Shortcut;
  reason: SmartReason;
  score: number;
}

export function getHourBucket(date: Date) {
  const hour = date.getHours();
  if (hour < 6) return 0;
  if (hour < 12) return 1;
  if (hour < 18) return 2;
  return 3;
}

function share(values: number[] | undefined, index: number) {
  const total = values?.reduce((sum, value) => sum + value, 0) ?? 0;
  return total > 0 ? (values?.[index] ?? 0) / total : 0;
}

export function rankShortcuts(shortcuts: Shortcut[], usage: AppData['usage'], now = new Date()): RankedShortcut[] {
  const hourBucket = getHourBucket(now);
  const weekday = now.getDay();

  return shortcuts
    .map((item, index) => {
      const stats = usage[item.id] ?? { count: 0, lastOpened: 0 };
      const ageHours = stats.lastOpened ? Math.max(0, now.getTime() - stats.lastOpened) / 3_600_000 : Number.POSITIVE_INFINITY;
      const hourAffinity = share(stats.hourBuckets, hourBucket);
      const dayAffinity = share(stats.weekdayBuckets, weekday);
      const freshness = stats.lastOpened ? Math.pow(.5, ageHours / (24 * 21)) : 1;
      const frequency = Math.log2(stats.count + 1) * 24 * freshness;
      const recency = ageHours < 12 ? 24 : ageHours < 72 ? 13 : ageHours < 336 ? 6 : 0;
      const context = stats.count >= 3 ? (hourAffinity * 28 + dayAffinity * 16) * freshness : 0;
      const score = (item.pinned ? 10_000 : 0) + frequency + recency + context;

      let reason: SmartReason = null;
      if (item.pinned) reason = 'pinned';
      else if ((stats.hourBuckets?.[hourBucket] ?? 0) >= 2 && hourAffinity >= .4) reason = 'rightNow';
      else if ((stats.weekdayBuckets?.[weekday] ?? 0) >= 2 && dayAffinity >= .4) reason = 'today';
      else if (ageHours < 24) reason = 'recent';
      else if (stats.count >= 3) reason = 'frequent';
      else if (item.source === 'topSites') reason = 'suggested';

      return { item, index, reason, score };
    })
    .sort((a, b) => Number(Boolean(b.item.pinned)) - Number(Boolean(a.item.pinned)) || (a.item.pinned && b.item.pinned ? a.index - b.index : b.score - a.score || a.index - b.index))
    .map(({ item, reason, score }) => ({ item, reason, score }));
}
