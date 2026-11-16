/** Immutable chunks are committed by replacing the small index last. */
export const DATA_KEY = 'radialData';
export const SYNC_INDEX_KEY = 'radialDataIndex';
const CHUNK_PREFIX = 'radialChunk:';

interface ChunkIndex {
  format: 'chunks-v1';
  savedAt: number;
  chunks: string[];
}

function isIndex(value: unknown): value is ChunkIndex {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<ChunkIndex>;
  return (
    item.format === 'chunks-v1' &&
    typeof item.savedAt === 'number' &&
    Array.isArray(item.chunks) &&
    item.chunks.length > 0 &&
    item.chunks.length <= 100 &&
    item.chunks.every((key) => typeof key === 'string' && key.startsWith(CHUNK_PREFIX))
  );
}

export async function readSyncedData(): Promise<unknown> {
  const result = await chrome.storage.sync.get([DATA_KEY, SYNC_INDEX_KEY]);
  // Keep the legacy key readable by older installed versions. Their startup
  // saves must never replace a chunk index with an empty default library.
  const value: unknown = result[SYNC_INDEX_KEY] ?? result[DATA_KEY];
  if (!isIndex(value)) return value;
  const parts = await chrome.storage.sync.get(value.chunks);
  if (value.chunks.some((key) => typeof parts[key] !== 'string'))
    throw new Error('Incomplete sync snapshot');
  return JSON.parse(value.chunks.map((key) => parts[key]).join(''));
}

export async function writeSyncedData(snapshot: { savedAt: number }): Promise<void> {
  const json = JSON.stringify(snapshot);
  const encoder = new TextEncoder();
  // Leave space for the old committed snapshot while staging a new one.
  if (encoder.encode(JSON.stringify(json)).length > 45_000) throw new Error('Sync quota exceeded');
  const previous = await chrome.storage.sync.get(SYNC_INDEX_KEY);
  const old = previous[SYNC_INDEX_KEY];
  const oldChunks = isIndex(old) ? old.chunks : [];
  if (encoder.encode(DATA_KEY + json).length <= 7500) {
    await chrome.storage.sync.set({ [DATA_KEY]: snapshot });
    if (isIndex(old)) await chrome.storage.sync.remove(SYNC_INDEX_KEY);
    if (oldChunks.length) await chrome.storage.sync.remove(oldChunks);
    return;
  }
  const revision = crypto.randomUUID();
  const characters = Array.from(json);
  const chunks: Record<string, string> = {};
  for (let offset = 0; offset < characters.length; offset += 1000) {
    chunks[`${CHUNK_PREFIX}${revision}:${offset / 1000}`] = characters
      .slice(offset, offset + 1000)
      .join('');
  }
  const keys = Object.keys(chunks);
  try {
    await chrome.storage.sync.set(chunks);
    await chrome.storage.sync.set({
      [SYNC_INDEX_KEY]: {
        format: 'chunks-v1',
        savedAt: snapshot.savedAt,
        chunks: keys,
      } satisfies ChunkIndex,
    });
  } catch (error) {
    // A failed upload never replaces the previous index.
    try {
      await chrome.storage.sync.remove(keys);
    } catch {
      /* Local backup is intact. */
    }
    throw error;
  }
  if (oldChunks.length) await chrome.storage.sync.remove(oldChunks);
}
