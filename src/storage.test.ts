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
});
