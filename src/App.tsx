import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeUrl } from './url';
import { useDialogFocus } from './use-dialog-focus';
import {
  Bookmark, Check, ChevronDown, Download, FolderOpen, Focus, History, Image as ImageIcon, Languages, MoreHorizontal,
  Pencil, Pin, Plus, RotateCcw, Search, Settings as SettingsIcon, Sparkles, Sun, Trash2, Upload, X,
} from 'lucide-react';
import { defaultData, shortcutColors } from './data';
import { makeTranslator } from './i18n';
import { loadBackgroundImage, loadData, mergeData, saveBackgroundImage, saveData } from './storage';
import { getHourBucket, rankShortcuts, type SmartReason } from './smart-ranking';
import type { AppData, Collection, Language, SearchEngine, Shortcut, Theme } from './types';

const searchUrls: Record<Exclude<SearchEngine, 'browser'>, string> = {
  bing: 'https://www.bing.com/search?q=',
  google: 'https://www.google.com/search?q=',
  yandex: 'https://yandex.ru/search/?text=',
  duckduckgo: 'https://duckduckgo.com/?q=',
};
const MAX_BACKGROUND_BYTES = 5 * 1024 * 1024;

type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;

interface BookmarkFolderOption {
  id: string;
  title: string;
  depth: number;
  links: number;
}

interface BookmarkImportResult {
  data: AppData;
  imported: number;
  skipped: number;
}

function faviconSources(url: string) {
  const site = new URL(url);
  const directSources = [
    `${site.origin}/favicon.ico`,
    `${site.origin}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(site.origin)}&sz=128`,
  ];
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return [chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`), ...directSources];
  }
  return directSources;
}

function initials(title: string) {
  return title.trim().slice(0, 2).toUpperCase();
}

function hostLabel(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function isAutoShortcut(item: Shortcut) {
  return item.source === 'topSites' || item.id.startsWith('top-site-');
}

function stableSiteId(url: string) {
  let hash = 0;
  for (let index = 0; index < url.length; index += 1) hash = ((hash << 5) - hash + url.charCodeAt(index)) | 0;
  return `top-site-${Math.abs(hash).toString(36)}`;
}

function asTopSiteShortcut(site: { title?: string; url?: string }, index: number): Shortcut | null {
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

function countBookmarkLinks(node: BookmarkNode): number {
  if (node.url) {
    try { return /^https?:$/i.test(new URL(node.url).protocol) ? 1 : 0; } catch { return 0; }
  }
  return (node.children ?? []).reduce((total, child) => total + countBookmarkLinks(child), 0);
}

function getBookmarkFolders(nodes: BookmarkNode[], depth = 0): BookmarkFolderOption[] {
  return nodes.flatMap((node) => {
    if (node.url) return [];
    const children = node.children ?? [];
    return [
      { id: node.id, title: node.title || '', depth, links: countBookmarkLinks(node) },
      ...getBookmarkFolders(children, depth + 1),
    ];
  });
}

function collectionIdForBookmarkFolder(folderId: string) {
  return `collection-bookmark-${folderId.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function makeBookmarkImport(data: AppData, root: BookmarkNode): BookmarkImportResult {
  const knownUrls = new Set<string>();
  for (const item of data.shortcuts) {
    try { knownUrls.add(normalizeUrl(item.url)); } catch { /* Keep malformed legacy data out of the dedupe set. */ }
  }
  const importedCollections = new Map<string, { id: string; title: string }>();
  const newShortcuts: Shortcut[] = [];
  let skipped = 0;

  function visit(node: BookmarkNode, folderPath: string[], folderId: string) {
    if (node.url) {
      try {
        const url = normalizeUrl(node.url);
        if (knownUrls.has(url)) { skipped += 1; return; }
        knownUrls.add(url);
        const collectionKey = folderId;
        if (!importedCollections.has(collectionKey)) {
          const generatedId = collectionIdForBookmarkFolder(collectionKey);
          const existing = data.collections.find((collection) => collection.bookmarkFolderId === collectionKey || collection.id === generatedId);
          importedCollections.set(collectionKey, { id: existing?.id ?? generatedId, title: existing?.title ?? (folderPath.filter(Boolean).join(' / ') || 'Imported') });
        }
        const collectionId = importedCollections.get(collectionKey)?.id ?? collectionIdForBookmarkFolder(collectionKey);
        const parsed = new URL(url);
        newShortcuts.push({
          id: `bookmark-${crypto.randomUUID()}`,
          title: node.title?.trim() || parsed.hostname.replace(/^www\./, ''),
          url,
          color: shortcutColors[newShortcuts.length % shortcutColors.length],
          collectionId,
        });
      } catch {
        skipped += 1;
      }
      return;
    }
    const nextPath = node.id === root.id ? [node.title || ''] : [...folderPath, node.title || ''];
    for (const child of node.children ?? []) visit(child, nextPath, node.id);
  }

  visit(root, [], root.id);
  const collections: Collection[] = [...importedCollections.entries()].map(([folderId, item], index) => {
    const existing = data.collections.find((collection) => collection.bookmarkFolderId === folderId || collection.id === item.id);
    return existing ?? {
      id: item.id,
      title: item.title,
      color: shortcutColors[(data.collections.length + index) % shortcutColors.length],
      bookmarkFolderId: folderId,
    };
  });
  const mergedCollectionIds = new Set(data.collections.map((collection) => collection.id));
  const addedCollections = collections.filter((collection) => !mergedCollectionIds.has(collection.id));
  return {
    data: {
      ...data,
      collections: [...data.collections, ...addedCollections],
      shortcuts: [...data.shortcuts, ...newShortcuts],
    },
    imported: newShortcuts.length,
    skipped,
  };
}

export default function App() {
  const [data, setData] = useState<AppData>(defaultData);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [undo, setUndo] = useState<{ item: Shortcut; index: number } | null>(null);
  const [selectedResult, setSelectedResult] = useState(-1);
  const [searchActive, setSearchActive] = useState(false);
  const [rankingTime] = useState(() => new Date());
  const [rankingUsage, setRankingUsage] = useState<AppData['usage']>({});
  const [now, setNow] = useState(new Date());
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editor, setEditor] = useState<Shortcut | null | 'new'>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [toast, setToast] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [collectionEditor, setCollectionEditor] = useState<Collection | 'new' | null>(null);
  const [bookmarkFolders, setBookmarkFolders] = useState<BookmarkFolderOption[]>([]);
  const [bookmarkModalOpen, setBookmarkModalOpen] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const backgroundRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { locale, t } = useMemo(() => makeTranslator(data.settings.language), [data.settings.language]);

  useEffect(() => {
    loadData().then((loaded) => { setData(loaded); setRankingUsage(loaded.usage); setReady(true); }).catch(() => setLoadError(true));
    loadBackgroundImage().then(setBackgroundImage);
  }, []);

  useEffect(() => {
    if (!ready || !data.settings.autoAddTopSites || typeof chrome === 'undefined' || !chrome.topSites?.get) return;
    let cancelled = false;
    void chrome.topSites.get().then((sites) => {
      if (cancelled) return;
      setData((current) => {
        const existingHosts = new Set(current.shortcuts.flatMap((item) => {
          try { return [new URL(item.url).hostname.replace(/^www\./, '')]; } catch { return []; }
        }));
        const dismissedHosts = new Set(current.dismissedAutoSites);
        const additions: Shortcut[] = [];
        // `topSites` already returns the browser's finite, ranked list. Import
        // the whole list instead of applying an arbitrary six-item cutoff.
        for (const [index, site] of sites.entries()) {
          const shortcut = asTopSiteShortcut(site, index);
          if (!shortcut) continue;
          const host = new URL(shortcut.url).hostname.replace(/^www\./, '');
          if (existingHosts.has(host) || dismissedHosts.has(host)) continue;
          existingHosts.add(host);
          additions.push(shortcut);
        }
        return additions.length ? { ...current, shortcuts: [...current.shortcuts, ...additions] } : current;
      });
    }).catch(() => {
      // Permission can be revoked or the browser can omit this optional API.
    });
    return () => { cancelled = true; };
  }, [ready, data.settings.autoAddTopSites]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), data.settings.showSeconds ? 1000 : 15000);
    return () => window.clearInterval(timer);
  }, [data.settings.showSeconds]);

  useEffect(() => {
    if (ready) void saveData(data).catch(() => setToast(t('storageError')));
  }, [data, ready, t]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = data.settings.theme;
  }, [locale, data.settings.theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('input, textarea, select, [contenteditable="true"]');
      if ((event.key === '/' || (event.ctrlKey && event.key.toLowerCase() === 'k')) && !isTyping) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setQuery('');
        setSearchActive(false);
        if (editor) setEditor(null);
        else if (collectionEditor) setCollectionEditor(null);
        else if (bookmarkModalOpen) setBookmarkModalOpen(false);
        else setSettingsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor, collectionEditor, bookmarkModalOpen]);

  const filtered = query.trim()
    ? data.shortcuts.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(query.trim().toLowerCase()))
    : [];

  const activeCollectionFilter = data.settings.collectionsEnabled && (collectionFilter === 'all' || collectionFilter === 'ungrouped' || data.collections.some((collection) => collection.id === collectionFilter)) ? collectionFilter : 'all';

  const collectionShortcuts = useMemo(() => {
    if (!data.settings.collectionsEnabled || activeCollectionFilter === 'all') return data.shortcuts;
    if (activeCollectionFilter === 'ungrouped') return data.shortcuts.filter((item) => !item.collectionId);
    return data.shortcuts.filter((item) => item.collectionId === activeCollectionFilter);
  }, [activeCollectionFilter, data.settings.collectionsEnabled, data.shortcuts]);

  const visibleShortcuts = useMemo(() => [...collectionShortcuts].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))), [collectionShortcuts]);
  const suggestions = useMemo(() => rankShortcuts(collectionShortcuts.filter((item) => !item.pinned), rankingUsage, rankingTime).filter(({ item, score }) => score > 8 && (rankingUsage[item.id]?.count ?? 0) >= 2).slice(0, 3), [collectionShortcuts, rankingUsage, rankingTime]);

  const collectionChips = useMemo(() => {
    return [
      { id: 'all', title: t('allLinks'), count: data.shortcuts.length },
      ...data.collections.map((collection) => ({
        id: collection.id, title: collection.title, count: data.shortcuts.filter((item) => item.collectionId === collection.id).length,
      })),
      ...(data.shortcuts.some((item) => !item.collectionId) ? [{ id: 'ungrouped', title: t('ungrouped'), count: data.shortcuts.filter((item) => !item.collectionId).length }] : []),
    ];
  }, [data.collections, data.shortcuts, t]);

  const clock = new Intl.DateTimeFormat(locale, {
    hour: '2-digit', minute: '2-digit', second: data.settings.showSeconds ? '2-digit' : undefined,
    hour12: !data.settings.clock24,
  }).format(now);
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const hour = now.getHours();
  const greeting = t(hour < 12 ? 'greetingMorning' : hour < 18 ? 'greetingDay' : 'greetingEvening');

  function patchSettings(patch: Partial<AppData['settings']>) {
    setData((current) => ({ ...current, settings: { ...current.settings, ...patch } }));
  }

  function handleBackgroundFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/') || file.size > MAX_BACKGROUND_BYTES) {
      setToast(t('backgroundError'));
      if (backgroundRef.current) backgroundRef.current.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      setBackgroundImage(reader.result);
      void saveBackgroundImage(reader.result).then(() => setToast(t('backgroundSaved'))).catch(() => setToast(t('backgroundError')));
    };
    reader.onerror = () => setToast(t('backgroundError'));
    reader.readAsDataURL(file);
    if (backgroundRef.current) backgroundRef.current.value = '';
  }

  function removeBackground() {
    setBackgroundImage(null);
    void saveBackgroundImage(null).then(() => setToast(t('backgroundRemoved'))).catch(() => setToast(t('backgroundError')));
  }

  function resetAll() {
    if (!window.confirm(t('resetConfirm'))) return;
    setRankingUsage({});
    setData(defaultData);
    setBackgroundImage(null);
    void saveBackgroundImage(null).catch(() => undefined);
    setToast(t('resetDone'));
  }

  async function toggleTopSites(enabled: boolean) {
    if (!enabled) {
      patchSettings({ autoAddTopSites: false });
      return;
    }
    if (typeof chrome !== 'undefined' && chrome.permissions?.request) {
      try {
        const granted = await chrome.permissions.request({ permissions: ['topSites'] });
        if (!granted) {
          setToast(t('permissionRequired'));
          return;
        }
      } catch {
        setToast(t('permissionRequired'));
        return;
      }
    }
    patchSettings({ autoAddTopSites: true });
  }

  function createCollection() {
    setCollectionEditor('new');
  }

  function renameCollection(collection: Collection) {
    setCollectionEditor(collection);
  }

  function saveCollection(title: string) {
    const normalized = title.trim();
    if (!normalized || !collectionEditor) return;
    const editing = collectionEditor === 'new' ? null : collectionEditor;
    if (data.collections.some((item) => item.id !== editing?.id && item.title.toLowerCase() === normalized.toLowerCase())) {
      setToast(t('collectionExists'));
      return;
    }
    if (editing) {
      setData((current) => ({ ...current, collections: current.collections.map((item) => item.id === editing.id ? { ...item, title: normalized } : item) }));
      setToast(t('collectionRenamed'));
    } else {
      setData((current) => ({
        ...current,
        collections: [...current.collections, { id: `collection-${crypto.randomUUID()}`, title: normalized, color: shortcutColors[current.collections.length % shortcutColors.length] }],
      }));
      setToast(t('collectionCreated'));
    }
    setCollectionEditor(null);
  }

  function removeCollection(collection: Collection) {
    if (!window.confirm(t('collectionDeleteConfirm'))) return;
    setData((current) => ({
      ...current,
      collections: current.collections.filter((item) => item.id !== collection.id),
      shortcuts: current.shortcuts.map((item) => item.collectionId === collection.id ? { ...item, collectionId: undefined } : item),
    }));
    if (collectionFilter === collection.id) setCollectionFilter('all');
    setToast(t('collectionDeleted'));
  }

  function assignDraggedShortcut(collectionId: string) {
    if (!draggedId || collectionId === 'all') return;
    setData((current) => ({
      ...current,
      shortcuts: current.shortcuts.map((item) => item.id === draggedId ? (collectionId === 'ungrouped' ? { ...item, collectionId: undefined } : { ...item, collectionId }) : item),
    }));
    setDraggedId(null);
    setToast(t('movedToCollection'));
  }

  async function openBookmarkImport() {
    if (!data.settings.collectionsEnabled) {
      setToast(t('enableCollectionsFirst'));
      return;
    }
    if (typeof chrome === 'undefined' || !chrome.bookmarks?.getTree) {
      setToast(t('bookmarksImportError'));
      return;
    }
    if (chrome.permissions?.request) {
      try {
        const granted = await chrome.permissions.request({ permissions: ['bookmarks'] });
        if (!granted) { setToast(t('bookmarksPermission')); return; }
      } catch { setToast(t('bookmarksPermission')); return; }
    }
    try {
      const tree = await chrome.bookmarks.getTree();
      const folders = getBookmarkFolders(tree);
      if (!folders.length) { setToast(t('bookmarksNoFolders')); return; }
      setBookmarkFolders(folders);
      setBookmarkModalOpen(true);
    } catch { setToast(t('bookmarksImportError')); }
  }

  async function importBookmarks(folderId: string) {
    if (typeof chrome === 'undefined' || !chrome.bookmarks?.getSubTree) return;
    setBookmarkLoading(true);
    try {
      const tree = await chrome.bookmarks.getSubTree(folderId);
      const root = tree[0];
      if (!root) { setToast(t('bookmarksImportError')); return; }
      const result = makeBookmarkImport(data, root);
      if (!result.imported) {
        setToast(result.skipped ? `${t('bookmarksNoNewLinks')} · ${result.skipped} ${t('bookmarksSkipped')}` : t('bookmarksNoLinks'));
        return;
      }
      setData(result.data);
      setBookmarkModalOpen(false);
      setToast(`${t('bookmarksImported')}: ${result.imported}${result.skipped ? ` · ${result.skipped} ${t('bookmarksSkipped')}` : ''}`);
    } catch { setToast(t('bookmarksImportError')); }
    finally { setBookmarkLoading(false); }
  }

  function recordVisit(id: string) {
    if (typeof chrome !== 'undefined' && chrome.extension?.inIncognitoContext) return;
    setData((current) => {
      const previous = current.usage[id] ?? { count: 0, lastOpened: 0 };
      const openedAt = new Date();
      const hourBuckets = Array.from({ length: 4 }, (_, index) => previous.hourBuckets?.[index] ?? 0);
      const weekdayBuckets = Array.from({ length: 7 }, (_, index) => previous.weekdayBuckets?.[index] ?? 0);
      hourBuckets[getHourBucket(openedAt)] += 1;
      weekdayBuckets[openedAt.getDay()] += 1;
      return { ...current, usage: { ...current.usage, [id]: { count: previous.count + 1, lastOpened: openedAt.getTime(), hourBuckets, weekdayBuckets } } };
    });
  }

  async function openShortcut(item: Shortcut) {
    // Wait for storage before replacing the extension document.
    const openedAt = new Date();
    const previous = data.usage[item.id] ?? { count: 0, lastOpened: 0 };
    const hourBuckets = Array.from({ length: 4 }, (_, index) => previous.hourBuckets?.[index] ?? 0);
    const weekdayBuckets = Array.from({ length: 7 }, (_, index) => previous.weekdayBuckets?.[index] ?? 0);
    hourBuckets[getHourBucket(openedAt)] += 1;
    weekdayBuckets[openedAt.getDay()] += 1;
    if (!(typeof chrome !== 'undefined' && chrome.extension?.inIncognitoContext)) {
      const next = { ...data, usage: { ...data.usage, [item.id]: { count: previous.count + 1, lastOpened: openedAt.getTime(), hourBuckets, weekdayBuckets } } };
      try { await saveData(next); } catch { setToast(t('storageError')); }
    }
    window.location.assign(item.url);
  }

  function linkClick(event: React.MouseEvent<HTMLAnchorElement>, item: Shortcut) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) { recordVisit(item.id); return; }
    event.preventDefault();
    void openShortcut(item);
  }

  async function submitSearch(forceWeb = false) {
    const text = query.trim();
    if (!text) return;
    const selected = !forceWeb && selectedResult >= 0 ? filtered.slice(0, 5)[selectedResult] : undefined;
    if (selected) { await openShortcut(selected); return; }
    const exact = data.shortcuts.find((item) => item.title.toLowerCase() === text.toLowerCase());
    if (exact && !forceWeb && selectedResult < 0) {
      await openShortcut(exact);
      return;
    }
    if (data.settings.searchEngine === 'browser' && typeof chrome !== 'undefined' && chrome.search?.query) {
      try {
        await chrome.search.query({ text, disposition: 'CURRENT_TAB' });
        return;
      } catch {
        // API can be unavailable in local preview or restricted by browser policy.
      }
    }
    const engine = data.settings.searchEngine === 'browser' ? 'google' : data.settings.searchEngine;
    window.location.assign(`${searchUrls[engine]}${encodeURIComponent(text)}`);
  }

  function saveShortcut(shortcut: Shortcut) {
    setData((current) => ({
      ...current,
      shortcuts: current.shortcuts.some((item) => item.id === shortcut.id)
        ? current.shortcuts.map((item) => item.id === shortcut.id ? shortcut : item)
        : [...current.shortcuts, shortcut],
    }));
    setEditor(null);
    setToast(t('saved'));
  }

  function removeShortcut(id: string) {
    const index = data.shortcuts.findIndex((item) => item.id === id);
    if (index >= 0) setUndo({ item: data.shortcuts[index], index });
    setData((current) => {
      const removed = current.shortcuts.find((item) => item.id === id);
      const dismissedAutoSites = new Set(current.dismissedAutoSites);
      if (removed && isAutoShortcut(removed)) dismissedAutoSites.add(hostLabel(removed.url));
      return {
        ...current,
        shortcuts: current.shortcuts.filter((item) => item.id !== id),
        dismissedAutoSites: [...dismissedAutoSites],
      };
    });
    setEditor(null);
    setToast(t('deleted'));
  }

  function restoreShortcut() {
    if (!undo) return;
    setData((current) => {
      const shortcuts = [...current.shortcuts];
      if (!shortcuts.some((item) => item.id === undo.item.id)) shortcuts.splice(Math.min(undo.index, shortcuts.length), 0, undo.item);
      return { ...current, shortcuts, dismissedAutoSites: current.dismissedAutoSites.filter((host) => host !== hostLabel(undo.item.url)) };
    });
    setUndo(null);
    setToast('');
  }

  function reorder(overId: string) {
    if (!draggedId || draggedId === overId) return;
    setData((current) => {
      const next = [...current.shortcuts];
      const from = next.findIndex((item) => item.id === draggedId);
      const to = next.findIndex((item) => item.id === overId);
      if (from < 0 || to < 0) return current;
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, { ...moved, pinned: next.find((item) => item.id === overId)?.pinned ?? false });
      return { ...current, shortcuts: next };
    });
    setDraggedId(null);
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `radial-new-tab-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    setToast(t('exported'));
  }

  async function importData(file?: File) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<AppData>;
      if (!Array.isArray(parsed.shortcuts)) throw new Error('missing shortcuts');
      if (parsed.shortcuts.some((item) => !item || typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.url !== 'string')) throw new Error('invalid shortcuts');
      parsed.shortcuts.forEach((item) => normalizeUrl(item.url));
      const imported = mergeData(parsed);
      imported.shortcuts = imported.shortcuts.map((item) => ({ ...item, url: normalizeUrl(item.url) }));
      setData(imported);
      setRankingUsage(imported.usage);
      setLoadError(false);
      setReady(true);
      setToast(t('imported'));
    } catch {
      setToast(t('importError'));
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  function renderShortcut(item: Shortcut, index: number, reason: SmartReason = item.pinned ? 'pinned' : null) {
    const reasonKey = reason && ({ pinned: 'smartPinned', rightNow: 'smartRightNow', today: 'smartToday', recent: 'smartRecent', frequent: 'smartFrequent', suggested: 'smartSuggested' } as const)[reason];
    return (
      <article
        className={`shortcut-wrap tile-rank-${index} ${draggedId === item.id ? 'is-dragging' : ''}`}
        style={{ '--index': index, '--shortcut-color': item.color } as React.CSSProperties}
        key={item.id}
        draggable
        onDragStart={() => setDraggedId(item.id)}
        onDragEnd={() => setDraggedId(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => reorder(item.id)}
      >
        <a className="shortcut" href={item.url} title={item.title} onClick={(event) => linkClick(event, item)} onAuxClick={(event) => { if (event.button === 1) recordVisit(item.id); }}>
          <span className="shortcut-topline">
            <ShortcutMark item={item} />
          </span>
          <span className="shortcut-title">{item.title}</span>
          <small className="shortcut-host">{hostLabel(item.url)}</small>
          {reasonKey && <small className="shortcut-meta">{reason === 'pinned' && <Pin size={12} />}<span>{t(reasonKey)}</span></small>}
        </a>
        <button className="shortcut-menu" onClick={() => setEditor(item)} aria-label={`${t('edit')}: ${item.title}`}><MoreHorizontal size={17} /></button>
      </article>
    );
  }

  return (
    <main className={`app ${focusMode ? 'is-focus' : ''} ${data.settings.compactMode ? 'is-compact' : ''} ${backgroundImage ? 'has-background' : ''} ${draggedId ? 'is-dragging-shortcut' : ''}`}>
      <div className="background-image" aria-hidden="true" style={{ '--background-image': backgroundImage ? `url(${backgroundImage})` : 'none' } as React.CSSProperties} />
      <div className="ambient" aria-hidden="true" />
      <header className="topbar">
        <div className="brand"><span className="brand-symbol" aria-hidden="true" />Radial<span className="brand-caption">New Tab</span></div>
        <div className="greeting">{greeting}</div>
      </header>

      <section className="center" aria-label={greeting}>
        <time className="clock" dateTime={now.toISOString()}>{clock}</time>
        <div className="date-line">{date}</div>
        <form className="search" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
          <Search size={21} aria-hidden="true" />
          <input ref={searchInputRef} value={query} onFocus={() => setSearchActive(true)} onBlur={(event) => { if (!event.currentTarget.closest('form')?.contains(event.relatedTarget as Node)) setSearchActive(false); }} onChange={(event) => { setQuery(event.target.value); setSelectedResult(-1); setSearchActive(true); }} role="combobox" aria-expanded={Boolean(query && searchActive)} aria-controls="search-results" aria-autocomplete="list" aria-activedescendant={selectedResult >= 0 ? `result-${selectedResult}` : undefined} onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault(); setSearchActive(true);
              const length = Math.min(filtered.length, 5);
              setSelectedResult((current) => event.key === 'ArrowDown' ? Math.min(length, current + 1) : Math.max(-1, current - 1));
            }
          }} placeholder={t('search')} aria-label={t('search')} autoFocus />
          <kbd>Enter</kbd>
          {query && <button type="button" className="clear" onClick={() => setQuery('')} aria-label={t('close')}><X size={17} /></button>}
          {query && searchActive && (
            <div className="search-results" id="search-results" role="listbox" aria-label={t('search')}>
              {filtered.slice(0, 5).map((item, index) => (
                <a id={`result-${index}`} key={item.id} href={item.url} role="option" aria-selected={selectedResult === index} onClick={(event) => linkClick(event, item)} onAuxClick={(event) => { if (event.button === 1) recordVisit(item.id); }}>
                  <ShortcutMark item={item} small /><span><strong>{item.title}</strong><small>{item.url}</small></span>
                </a>
              ))}
              <button id={`result-${Math.min(filtered.length, 5)}`} type="button" role="option" aria-selected={selectedResult === Math.min(filtered.length, 5)} className="web-result" onClick={() => void submitSearch(true)}><Search size={17} /><span>{t('searchFor')} “{query}”</span></button>
              {!filtered.length && <p>{t('noResults')}</p>}
            </div>
          )}
        </form>
      </section>

      <div className="workspace" inert={focusMode || settingsOpen || Boolean(editor) || Boolean(collectionEditor) || bookmarkModalOpen}>
        {data.settings.collectionsEnabled && <nav className="collection-toolbar" aria-label={t('collections')}>
          {collectionChips.map((collection) => (
            <button key={collection.id} className={activeCollectionFilter === collection.id ? 'selected' : ''} aria-pressed={activeCollectionFilter === collection.id} onClick={() => setCollectionFilter(collection.id)} onDragOver={(event) => { if (draggedId && collection.id !== 'all') event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); assignDraggedShortcut(collection.id); }}>
              <span>{collection.title}</span><small>{collection.count}</small>
            </button>
          ))}
        </nav>}

        {suggestions.length > 0 && <section className="suggestions" aria-label={t('smartForYou')}>
          <header className="section-heading"><h2><Sparkles size={16} />{t('smartForYou')}</h2><span>{t('smartGridHint')}</span></header>
          <div className="suggestion-grid">{suggestions.map(({ item, reason }) => <a key={item.id} href={item.url} onClick={(event) => linkClick(event, item)} onAuxClick={(event) => { if (event.button === 1) recordVisit(item.id); }} className="suggestion" style={{ '--shortcut-color': item.color } as React.CSSProperties}>
            <ShortcutMark item={item} /><span><strong>{item.title}</strong><small>{t(reason === 'rightNow' ? 'smartRightNow' : reason === 'today' ? 'smartToday' : reason === 'recent' ? 'smartRecent' : 'smartFrequent')}</small></span>
          </a>)}</div>
        </section>}
        <section className="library">
          <header className="section-heading"><h2>{t('yourLinks')}<span className="link-count">{visibleShortcuts.length}</span></h2><button className="text-action" onClick={() => setEditor('new')}><Plus size={16} />{t('add')}</button></header>
          {loadError && <p role="alert">{t('loadError')}</p>}
          <div className="shortcut-space is-tiles" aria-label={t('reorderHint')}>
            {ready && visibleShortcuts.map((item, index) => renderShortcut(item, index))}
            {ready && !visibleShortcuts.length && <button className="collection-empty" onClick={() => setEditor('new')}><Plus size={24} /><span>{t('collectionEmpty')}</span><strong>{t('add')}</strong></button>}
          </div>
        </section>
      </div>

      <nav className="dock" aria-label="Actions">
        <button onClick={() => setEditor('new')}><Plus size={20} /><span>{t('add')}</span></button>
        <i />
        <button className={focusMode ? 'active' : ''} onClick={() => setFocusMode((value) => !value)}><Focus size={20} /><span>{t('focus')}</span></button>
        <i />
        <button onClick={() => setSettingsOpen(true)}><SettingsIcon size={20} /><span>{t('settings')}</span></button>
      </nav>

      <button className="settings-fab" onClick={() => setSettingsOpen(true)} aria-label={t('openSettings')}><SettingsIcon size={20} /></button>

      {settingsOpen && <SettingsPanel data={data} t={t} patchSettings={patchSettings} toggleTopSites={toggleTopSites} backgroundImage={backgroundImage} backgroundRef={backgroundRef} onBackgroundFile={handleBackgroundFile} removeBackground={removeBackground} close={() => setSettingsOpen(false)} exportData={exportData} importRef={importRef} importData={importData} reset={resetAll} createCollection={createCollection} renameCollection={renameCollection} removeCollection={removeCollection} openBookmarkImport={() => void openBookmarkImport()} />}
      {bookmarkModalOpen && <BookmarkImportModal folders={bookmarkFolders} t={t} loading={bookmarkLoading} close={() => setBookmarkModalOpen(false)} importFolder={(folderId) => void importBookmarks(folderId)} />}
      {collectionEditor && <CollectionEditor value={collectionEditor === 'new' ? null : collectionEditor} t={t} close={() => setCollectionEditor(null)} save={saveCollection} />}
      {editor && <ShortcutEditor value={editor === 'new' ? null : editor} collections={data.collections} collectionsEnabled={data.settings.collectionsEnabled} t={t} close={() => setEditor(null)} save={saveShortcut} remove={removeShortcut} />}
      {toast && <div className="toast" role="status"><Check size={17} />{toast}{undo && toast === t('deleted') && <button onClick={restoreShortcut}>{t('undo')}</button>}</div>}
    </main>
  );
}

function ShortcutMark({ item, small = false }: { item: Shortcut; small?: boolean }) {
  const sources = useMemo(() => faviconSources(item.url), [item.url]);
  const [failure, setFailure] = useState({ url: item.url, index: 0 });
  const [loadedFor, setLoadedFor] = useState('');
  const sourceIndex = failure.url === item.url ? failure.index : 0;
  const source = sources[sourceIndex];
  const hasIcon = loadedFor === item.url;
  return (
    <span aria-hidden="true" className={`shortcut-mark ${small ? 'small' : ''}`} style={{ '--shortcut-color': item.color } as React.CSSProperties}>
      {!hasIcon && <b>{initials(item.title)}</b>}
      {source && <img src={source} alt="" onLoad={() => setLoadedFor(item.url)} onError={() => { setLoadedFor(''); setFailure({ url: item.url, index: sourceIndex + 1 }); }} />}
    </span>
  );
}

function Segment<T extends string>({ value, values, labels, onChange }: { value: T; values: readonly T[]; labels: string[]; onChange: (value: T) => void }) {
  return <div className="segment">{values.map((item, index) => <button key={item} className={value === item ? 'selected' : ''} onClick={() => onChange(item)}>{labels[index]}</button>)}</div>;
}

type Translator = ReturnType<typeof makeTranslator>['t'];

function SettingsPanel({ data, t, patchSettings, toggleTopSites, backgroundImage, backgroundRef, onBackgroundFile, removeBackground, close, exportData, importRef, importData, reset, createCollection, renameCollection, removeCollection, openBookmarkImport }: {
  data: AppData; t: Translator; patchSettings: (patch: Partial<AppData['settings']>) => void; toggleTopSites: (enabled: boolean) => void; close: () => void;
  backgroundImage: string | null; backgroundRef: React.RefObject<HTMLInputElement | null>; onBackgroundFile: (file?: File) => void; removeBackground: () => void;
  exportData: () => void; importRef: React.RefObject<HTMLInputElement | null>; importData: (file?: File) => void; reset: () => void;
  createCollection: () => void; renameCollection: (collection: Collection) => void; removeCollection: (collection: Collection) => void; openBookmarkImport: () => void;
}) {
  const dialogRef = useDialogFocus();
  return (
    <div className="sheet-layer" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <aside ref={dialogRef} role="dialog" aria-modal="true" className="settings-panel" aria-label={t('settings')}>
        <header><h2>{t('settings')}</h2><button onClick={close} aria-label={t('close')}><X size={21} /></button></header>
        <div className="settings-content">
          <section><h3><Sun size={18} />{t('appearance')}</h3><Segment<Theme> value={data.settings.theme} values={['system', 'light', 'dark']} labels={[t('system'), t('light'), t('dark')]} onChange={(theme) => patchSettings({ theme })} /></section>
          <section><h3><Languages size={18} />{t('language')}</h3><Segment<Language> value={data.settings.language} values={['auto', 'ru', 'en']} labels={[t('auto'), t('russian'), t('english')]} onChange={(language) => patchSettings({ language })} /></section>
          <section><label htmlFor="engine">{t('searchEngine')}</label><div className="select-wrap"><select id="engine" value={data.settings.searchEngine} onChange={(e) => patchSettings({ searchEngine: e.target.value as SearchEngine })}><option value="browser">{t('browserDefault')}</option><option value="google">Google</option><option value="yandex">Яндекс</option><option value="bing">Microsoft Bing</option><option value="duckduckgo">DuckDuckGo</option></select><ChevronDown size={17} /></div></section>
          <section className="collections-settings"><h3><FolderOpen size={18} />{t('collections')}</h3><Toggle label={t('enableCollections')} checked={data.settings.collectionsEnabled} onChange={(collectionsEnabled) => patchSettings({ collectionsEnabled })} /><p className="settings-note">{t('collectionsHint')}</p>{data.settings.collectionsEnabled && <><div className="collection-list">{data.collections.map((collection) => <div className="collection-row" key={collection.id}><span className="collection-swatch" style={{ background: collection.color }} /><strong title={collection.title}>{collection.title}</strong><small>{data.shortcuts.filter((item) => item.collectionId === collection.id).length}</small><button onClick={() => renameCollection(collection)} aria-label={`${t('renameCollection')}: ${collection.title}`}><Pencil size={15} /></button><button className="danger-icon" onClick={() => removeCollection(collection)} aria-label={`${t('deleteCollection')}: ${collection.title}`}><Trash2 size={15} /></button></div>)}</div>{!data.collections.length && <p className="settings-note">{t('noCollections')}</p>}<button className="settings-action collection-add" onClick={createCollection}><Plus size={17} /><span>{t('addCollection')}</span></button><div className="bookmark-import"><div><strong>{t('bookmarkImport')}</strong><span>{t('bookmarkImportHint')}</span></div><button className="settings-action" onClick={openBookmarkImport}><Bookmark size={17} /><span>{t('importBookmarks')}</span></button></div></>}</section>
          <section><h3><History size={18} />{t('automation')}</h3><Toggle label={t('autoAddTopSites')} checked={data.settings.autoAddTopSites} onChange={(enabled) => void toggleTopSites(enabled)} /><p className="settings-note">{t('autoAddTopSitesHint')}</p></section>
          <section><h3><ImageIcon size={18} />{t('background')}</h3><div className="background-picker">{backgroundImage ? <div className="background-preview" style={{ backgroundImage: `url(${backgroundImage})` }} aria-label={t('backgroundPreview')} /> : <div className="background-preview is-empty"><ImageIcon size={22} /></div>}<div className="background-picker-copy"><strong>{backgroundImage ? t('backgroundSelected') : t('backgroundDefault')}</strong><span>{t('backgroundHint')}</span><div className="background-picker-actions"><button className="settings-action" onClick={() => backgroundRef.current?.click()}><Upload size={17} /><span>{t('chooseImage')}</span></button>{backgroundImage && <button className="settings-action danger" onClick={removeBackground}><Trash2 size={17} /><span>{t('removeBackground')}</span></button>}</div></div></div><input ref={backgroundRef} type="file" accept="image/*" hidden onChange={(e) => onBackgroundFile(e.target.files?.[0])} /></section>
          <section className="switches"><Toggle label={t('clock24')} checked={data.settings.clock24} onChange={(clock24) => patchSettings({ clock24 })} /><Toggle label={t('seconds')} checked={data.settings.showSeconds} onChange={(showSeconds) => patchSettings({ showSeconds })} /><Toggle label={t('compact')} checked={data.settings.compactMode} onChange={(compactMode) => patchSettings({ compactMode })} /></section>
          <section><h3>{t('data')}</h3><button className="settings-action" onClick={exportData}><Download size={18} /><span>{t('export')}</span></button><button className="settings-action" onClick={() => importRef.current?.click()}><Upload size={18} /><span>{t('import')}</span></button><input ref={importRef} type="file" accept="application/json" hidden onChange={(e) => void importData(e.target.files?.[0])} /><button className="settings-action danger" onClick={reset}><RotateCcw size={18} /><span>{t('reset')}</span></button></section>
        </div>
      </aside>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="toggle"><span>{label}</span><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /><i aria-hidden="true" /></label>;
}

function CollectionEditor({ value, t, close, save }: { value: Collection | null; t: Translator; close: () => void; save: (title: string) => void }) {
  const [title, setTitle] = useState(value?.title ?? '');
  const dialogRef = useDialogFocus();
  return <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && close()}><form ref={dialogRef as React.RefObject<HTMLFormElement>} role="dialog" aria-modal="true" aria-label={t('collections')} className="editor collection-editor" onSubmit={(event) => { event.preventDefault(); save(title); }}><header><h2><FolderOpen size={20} />{value ? t('renameCollection') : t('addCollection')}</h2><button type="button" onClick={close} aria-label={t('close')}><X size={21} /></button></header><label>{t('collectionName')}<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('collectionNamePlaceholder')} maxLength={48} required autoFocus /></label><p className="settings-note">{t('collectionNameHint')}</p><footer><span /><button type="button" className="secondary" onClick={close}>{t('cancel')}</button><button type="submit" className="primary">{t('save')}</button></footer></form></div>;
}

function BookmarkImportModal({ folders, t, loading, close, importFolder }: { folders: BookmarkFolderOption[]; t: Translator; loading: boolean; close: () => void; importFolder: (folderId: string) => void }) {
  const [selectedId, setSelectedId] = useState(folders[0]?.id ?? '');
  const selected = folders.find((folder) => folder.id === selectedId);
  const dialogRef = useDialogFocus();
  return <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && close()}><form ref={dialogRef as React.RefObject<HTMLFormElement>} role="dialog" aria-modal="true" aria-label={t('bookmarkImportTitle')} className="editor bookmark-modal" onSubmit={(event) => { event.preventDefault(); if (selectedId) importFolder(selectedId); }}><header><h2><Bookmark size={20} />{t('bookmarkImportTitle')}</h2><button type="button" onClick={close} aria-label={t('close')}><X size={21} /></button></header><p className="modal-copy">{t('bookmarkImportDescription')}</p><label>{t('bookmarkFolder')}<div className="select-wrap bookmark-select"><select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} aria-label={t('bookmarkFolder')} disabled={loading}>{folders.map((folder) => <option key={folder.id} value={folder.id}>{`${'  '.repeat(folder.depth)}${folder.title || t('bookmarksRoot')} · ${folder.links}`}</option>)}</select><ChevronDown size={17} /></div></label>{selected && <p className="settings-note bookmark-selection"><FolderOpen size={15} />{selected.links ? `${selected.links} ${t('bookmarkLinksFound')}` : t('bookmarksNoLinks')}</p>}<footer><span /><button type="button" className="secondary" onClick={close} disabled={loading}>{t('cancel')}</button><button type="submit" className="primary" disabled={loading || !selectedId}>{loading ? t('importing') : t('importSelected')}</button></footer></form></div>;
}

function ShortcutEditor({ value, collections, collectionsEnabled, t, close, save, remove }: { value: Shortcut | null; collections: Collection[]; collectionsEnabled: boolean; t: Translator; close: () => void; save: (item: Shortcut) => void; remove: (id: string) => void }) {
  const [title, setTitle] = useState(value?.title ?? '');
  const [url, setUrl] = useState(value?.url ?? '');
  const [color, setColor] = useState(value?.color ?? shortcutColors[0]);
  const [collectionId, setCollectionId] = useState(value?.collectionId ?? '');
  const [pinned, setPinned] = useState(value?.pinned ?? false);
  const [error, setError] = useState('');
  const dialogRef = useDialogFocus();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      save({ id: value?.id ?? crypto.randomUUID(), title: title.trim(), url: normalizeUrl(url), color, source: value?.source ?? 'manual', pinned, ...(collectionsEnabled ? (collectionId ? { collectionId } : {}) : (value?.collectionId ? { collectionId: value.collectionId } : {})) });
    } catch { setError(t('invalidUrl')); }
  }

  return <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && close()}><form ref={dialogRef as React.RefObject<HTMLFormElement>} role="dialog" aria-modal="true" aria-label={value ? t('edit') : t('add')} className="editor" onSubmit={submit}><header><h2>{value ? t('edit') : t('add')}</h2><button type="button" onClick={close} aria-label={t('close')}><X size={21} /></button></header><label>{t('title')}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('titlePlaceholder')} required autoFocus /></label><label>{t('url')}<input value={url} onChange={(e) => { setUrl(e.target.value); setError(''); }} placeholder={t('urlPlaceholder')} required inputMode="url" />{error && <small className="error">{error}</small>}</label>{collectionsEnabled && <label>{t('collectionSelect')}<div className="select-wrap"><select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}><option value="">{t('noCollection')}</option>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}</select><ChevronDown size={17} /></div></label>}<div className="editor-toggle"><Toggle label={t('pinShortcut')} checked={pinned} onChange={setPinned} /><small>{t('pinShortcutHint')}</small></div><fieldset><legend>{t('color')}</legend><div className="color-row">{shortcutColors.map((item) => <button type="button" key={item} className={color === item ? 'selected' : ''} style={{ backgroundColor: item }} onClick={() => setColor(item)} aria-label={item}>{color === item && <Check size={15} />}</button>)}</div></fieldset><footer>{value && <button type="button" className="delete" onClick={() => remove(value.id)}>{t('remove')}</button>}<span /><button type="button" className="secondary" onClick={close}>{t('cancel')}</button><button type="submit" className="primary">{t('save')}</button></footer></form></div>;
}
