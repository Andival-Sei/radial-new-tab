import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { defaultData } from './data';
import { loadData, saveData, type SaveResult } from './storage';
import type { AppData } from './types';

/** External refreshes do not write back, and pending local edits take priority. */
export function useStoredData(onLoadUsage: (usage: AppData['usage']) => void) {
  const [data, setData] = useState<AppData>(defaultData);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [syncState, setSyncState] = useState<SaveResult | null>(null);
  const persisted = useRef<AppData | null>(null);
  const currentData = useRef(data);
  const writes = useRef(0);
  useLayoutEffect(() => {
    currentData.current = data;
  }, [data]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const loaded = await loadData();
        if (cancelled) return;
        persisted.current = loaded;
        setData(loaded);
        onLoadUsage(loaded.usage);
        setReady(true);
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [onLoadUsage]);

  useEffect(() => {
    if (!ready || persisted.current === data) return;
    persisted.current = data;
    writes.current += 1;
    let cancelled = false;
    async function save() {
      try {
        const result = await saveData(data);
        if (!cancelled) {
          setSyncState(result);
          setSaveError(false);
        }
      } catch {
        if (!cancelled) setSaveError(true);
      } finally {
        writes.current -= 1;
      }
    }
    void save();
    return () => {
      cancelled = true;
    };
  }, [data, ready]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let timer: number;
    async function refresh() {
      if (writes.current) return;
      try {
        const loaded = await loadData();
        if (cancelled || writes.current) return;
        if (
          persisted.current !== currentData.current ||
          JSON.stringify(currentData.current) === JSON.stringify(loaded)
        )
          return;
        persisted.current = loaded;
        setData(loaded);
      } catch {
        /* Keep the working copy when another snapshot is still arriving. */
      }
    }
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void refresh(), 80);
    };
    const storageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if ((area === 'sync' || area === 'local') && (changes.radialData || changes.radialDataIndex))
        schedule();
    };
    const localChanged = (event: StorageEvent) => {
      if (event.key === 'radialData') schedule();
    };
    window.addEventListener('focus', schedule);
    window.addEventListener('storage', localChanged);
    if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.addListener(storageChanged);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('focus', schedule);
      window.removeEventListener('storage', localChanged);
      if (typeof chrome !== 'undefined') chrome.storage?.onChanged?.removeListener(storageChanged);
    };
  }, [ready]);

  const restore = useCallback(
    (value: AppData) => {
      setLoadError(false);
      setReady(true);
      setData(value);
      onLoadUsage(value.usage);
    },
    [onLoadUsage],
  );
  return { data, setData, ready, loadError, saveError, syncState, restore };
}
