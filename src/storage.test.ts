import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadData, mergeData, saveData } from './storage';
import { defaultData } from './data';

afterEach(() => vi.unstubAllGlobals());

it('recovers the last local save after sync quota fails', async () => {
  let local: Record<string, unknown> = {};
  const synced = { ...defaultData, savedAt: 1 };
  vi.stubGlobal('chrome', { storage: {
    sync: { get: async () => ({ radialData: synced }), set: async () => { throw new Error('quota'); } },
    local: { get: async () => local, set: async (value: Record<string, unknown>) => { local = value; } },
  } });
  await saveData({ ...defaultData, shortcuts: [] });
  expect((await loadData()).shortcuts).toEqual([]);
});

it('rejects unsafe URLs and sanitizes invalid usage without crashing', () => {
  const data = mergeData({
    shortcuts: [
      { id: 'unsafe', title: 'Bad', url: 'javascript:alert(1)', color: '#fff' },
      { id: 'ok', title: 'Good', url: 'https://example.com', color: 'broken' },
    ],
    usage: { ok: { count: -1, lastOpened: Number.NaN } },
  });
  expect(data.shortcuts).toHaveLength(1);
  expect(data.usage.ok.count).toBe(0);
});

describe('mergeData', () => {
  it('keeps defaults for missing settings', () => {
    const result = mergeData({ settings: { theme: 'dark' } as never });
    expect(result.settings.theme).toBe('dark');
    expect(result.settings.language).toBe('auto');
    expect(result.settings.layoutMode).toBe('tiles');
    expect(result.shortcuts.length).toBeGreaterThan(0);
  });

  it('migrates the removed orbit layout to tiles', () => {
    const result = mergeData({ settings: { layoutMode: 'orbit' } as never });
    expect(result.settings.layoutMode).toBe('tiles');
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
