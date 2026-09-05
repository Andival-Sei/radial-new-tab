import { describe, expect, it } from 'vitest';
import { rankShortcuts } from './smart-ranking';
import type { Shortcut } from './types';

const links: Shortcut[] = [
  { id: 'a', title: 'A', url: 'https://a.example', color: '#fff' },
  { id: 'b', title: 'B', url: 'https://b.example', color: '#fff' },
  { id: 'c', title: 'C', url: 'https://c.example', color: '#fff', pinned: true },
];

describe('rankShortcuts', () => {
  it('lets recently useful links overtake abandoned high-frequency links', () => {
    const now = new Date('2026-09-05T10:00:00');
    const result = rankShortcuts(links.slice(0, 2), {
      a: { count: 500, lastOpened: now.getTime() - 180 * 86400000 },
      b: { count: 4, lastOpened: now.getTime() - 3600000 },
    }, now);
    expect(result[0].item.id).toBe('b');
  });
  it('keeps cold shortcuts stable and puts pinned links first', () => {
    expect(rankShortcuts(links, {}, new Date('2026-09-05T10:00:00')).map(({ item }) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('uses time affinity instead of raw frequency alone', () => {
    const now = new Date('2026-09-05T10:00:00');
    const result = rankShortcuts(links.slice(0, 2), {
      a: { count: 8, lastOpened: 0, hourBuckets: [0, 0, 8, 0], weekdayBuckets: [] },
      b: { count: 5, lastOpened: 0, hourBuckets: [0, 5, 0, 0], weekdayBuckets: [] },
    }, now);
    expect(result[0].item.id).toBe('b');
    expect(result[0].reason).toBe('rightNow');
  });
});
