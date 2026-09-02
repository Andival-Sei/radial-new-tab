import { describe, expect, it } from 'vitest';
import { mergeData } from './storage';

describe('mergeData', () => {
  it('keeps defaults for missing settings', () => {
    const result = mergeData({ settings: { theme: 'dark' } as never });
    expect(result.settings.theme).toBe('dark');
    expect(result.settings.language).toBe('auto');
    expect(result.shortcuts.length).toBeGreaterThan(0);
  });

  it('accepts an explicitly empty shortcut list', () => {
    expect(mergeData({ shortcuts: [] }).shortcuts).toEqual([]);
  });

  it('keeps only shortcut assignments that point to an existing collection', () => {
    const result = mergeData({
      collections: [{ id: 'work', title: 'Work', color: '#6EA8FF' }],
      shortcuts: [
        { id: 'one', title: 'One', url: 'https://one.example', color: '#6EA8FF', collectionId: 'work' },
        { id: 'two', title: 'Two', url: 'https://two.example', color: '#67E8F9', collectionId: 'missing' },
      ],
    });
    expect(result.shortcuts[0].collectionId).toBe('work');
    expect(result.shortcuts[1].collectionId).toBeUndefined();
  });
});
