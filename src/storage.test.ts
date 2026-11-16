import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadData, mergeData, saveData } from './storage';
import { defaultData } from './data';

afterEach(() => vi.unstubAllGlobals());

it('keeps a migrated synced library over an older app version’s startup save', async () => {
  vi.stubGlobal('chrome', {
    storage: {
      sync: {
        get: async () => ({ radialData: { ...defaultData, savedAt: 1, storageVersion: 2 } }),
      },
      local: { get: async () => ({ radialData: { ...defaultData, shortcuts: [], savedAt: 2 } }) },
    },
  });
  expect((await loadData()).shortcuts).toHaveLength(defaultData.shortcuts.length);
});

it('recovers the last local save after sync quota fails', async () => {
  let local: Record<string, unknown> = {};
  const synced = { ...defaultData, savedAt: 1 };
  vi.stubGlobal('chrome', {
    storage: {
      sync: {
        get: async () => ({ radialData: synced }),
        set: async () => {
          throw new Error('quota');
        },
      },
      local: {
        get: async () => local,
        set: async (value: Record<string, unknown>) => {
          local = value;
        },
      },
    },
  });
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
  it('validates imported settings, colors and duplicate collection IDs', () => {
    const result = mergeData({
      settings: {
        theme: 'unknown',
        searchEngine: 'malicious',
        language: 42,
        clock24: 'false',
        showSeconds: true,
      },
      collections: [
        { id: 'a', title: ' Work ', color: 'red' },
        { id: 'a', title: 'Duplicate', color: '#ffffff' },
        null,
      ],
      shortcuts: [{ id: 'one', title: ' One ', url: 'example.com', color: null }],
    });
    expect(result.settings).toEqual({ ...defaultData.settings, showSeconds: true });
    expect(result.collections).toEqual([{ id: 'a', title: 'Work', color: '#6EA8FF' }]);
    expect(result.shortcuts[0].url).toBe('https://example.com/');
    expect(result.shortcuts[0].color).toBe('#6EA8FF');
  });

  it('handles null, primitive input and prototype-named IDs', () => {
    expect(mergeData(null).settings).toEqual(defaultData.settings);
    expect(mergeData('broken').shortcuts).toHaveLength(defaultData.shortcuts.length);
    const input = JSON.parse(
      '{"shortcuts":[{"id":"__proto__","title":"Safe","url":"https://example.com","color":"#ffffff"}],"usage":{"__proto__":{"count":2,"lastOpened":1}}}',
    );
    expect(mergeData(input).usage['__proto__'].count).toBe(2);
    expect({}).not.toHaveProperty('count');
  });
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
        {
          id: 'one',
          title: 'One',
          url: 'https://one.example',
          color: '#6EA8FF',
          collectionId: 'work',
        },
        {
          id: 'two',
          title: 'Two',
          url: 'https://two.example',
          color: '#67E8F9',
          collectionId: 'missing',
        },
      ],
    });
    expect(result.shortcuts[0].collectionId).toBe('work');
    expect(result.shortcuts[1].collectionId).toBeUndefined();
  });
});
