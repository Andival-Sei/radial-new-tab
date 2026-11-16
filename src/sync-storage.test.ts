import { afterEach, expect, it, vi } from 'vitest';
import { readSyncedData, writeSyncedData, DATA_KEY, SYNC_INDEX_KEY } from './sync-storage';

afterEach(() => vi.unstubAllGlobals());

function storage() {
  const values: Record<string, unknown> = {};
  let failCommit = false;
  vi.stubGlobal('chrome', {
    storage: {
      sync: {
        get: async (keys: string | string[]) =>
          Object.fromEntries(
            (Array.isArray(keys) ? keys : [keys]).map((key) => [key, values[key]]),
          ),
        set: async (items: Record<string, unknown>) => {
          if (failCommit && (DATA_KEY in items || SYNC_INDEX_KEY in items))
            throw new Error('offline');
          for (const [key, value] of Object.entries(items)) {
            if (new TextEncoder().encode(key + JSON.stringify(value)).length > 8192)
              throw new Error('per-item quota');
          }
          Object.assign(values, items);
        },
        remove: async (keys: string | string[]) => {
          for (const key of typeof keys === 'string' ? [keys] : keys) delete values[key];
        },
      },
    },
  });
  return {
    values,
    failNextCommit: () => {
      failCommit = true;
    },
  };
}

it('roundtrips a Unicode library above the per-item quota and cleans up replaced chunks', async () => {
  const { values } = storage();
  const snapshot = {
    savedAt: 1,
    shortcuts: Array.from({ length: 110 }, (_, i) => ({
      title: `Работа 👩‍💻 ${i}`,
      url: `https://example.com/${i}`,
      id: `${i}`,
      color: '#ffffff',
    })),
  };
  expect(new TextEncoder().encode(JSON.stringify(snapshot)).length).toBeGreaterThan(8192);
  await writeSyncedData(snapshot);
  expect(Object.keys(values).length).toBeGreaterThan(1);
  expect(await readSyncedData()).toEqual(snapshot);
  values[DATA_KEY] = { savedAt: 999, shortcuts: [] }; // An older version saves on another device.
  expect(await readSyncedData()).toEqual(snapshot);
  await writeSyncedData({ savedAt: 2 });
  expect(await readSyncedData()).toEqual({ savedAt: 2 });
  expect(Object.keys(values)).toEqual([DATA_KEY]);
});

it('preserves the previous committed snapshot when uploading the index fails', async () => {
  const { values, failNextCommit } = storage();
  await writeSyncedData({ savedAt: 1 });
  failNextCommit();
  await expect(
    writeSyncedData({ savedAt: 2, text: 'x'.repeat(10_000) } as { savedAt: number }),
  ).rejects.toThrow('offline');
  expect(await readSyncedData()).toEqual({ savedAt: 1 });
  expect(Object.keys(values)).toEqual([DATA_KEY]);
});

it('detects an incomplete synced snapshot instead of importing partial data', async () => {
  const { values } = storage();
  values[SYNC_INDEX_KEY] = { format: 'chunks-v1', savedAt: 1, chunks: ['radialChunk:missing'] };
  await expect(readSyncedData()).rejects.toThrow('Incomplete');
});
