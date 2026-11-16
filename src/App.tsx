import { useEffect, useMemo, useRef, useState } from 'react';
import {
  SettingsPanel,
  CollectionEditor,
  BookmarkImportModal,
  RecentSitesModal,
  ShortcutEditor,
} from './components/dialogs';
import { Clock } from './components/Clock';
import { useStoredData } from './use-stored-data';
import { DialogFocusContext } from './use-dialog-focus';
import { ShortcutMark } from './components/ShortcutMark';
import { calculateTileLayout } from './tile-layout';
import {
  hostLabel,
  isAutoShortcut,
  asTopSiteShortcut,
  recordShortcutVisit,
} from './shortcut-utils';
import { getBookmarkFolders, makeBookmarkImport, type BookmarkFolderOption } from './bookmarks';
import { normalizeUrl } from './url';
import {
  Check,
  Focus,
  History,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from 'lucide-react';
import { defaultData, shortcutColors } from './data';
import { makeTranslator } from './i18n';
import { loadBackgroundImage, mergeData, saveBackgroundImage, saveData } from './storage';
import { rankShortcuts, type SmartReason } from './smart-ranking';
import type { AppData, Collection, SearchEngine, Shortcut } from './types';

const searchUrls: Record<Exclude<SearchEngine, 'browser'>, string> = {
  bing: 'https://www.bing.com/search?q=',
  google: 'https://www.google.com/search?q=',
  yandex: 'https://yandex.ru/search/?text=',
  duckduckgo: 'https://duckduckgo.com/?q=',
};
const MAX_BACKGROUND_BYTES = 5 * 1024 * 1024;

export default function App() {
  const [rankingUsage, setRankingUsage] = useState<AppData['usage']>({});
  const { data, setData, ready, loadError, saveError, syncState, restore } =
    useStoredData(setRankingUsage);
  const [undo, setUndo] = useState<{ item: Shortcut; index: number } | null>(null);
  const [selectedResult, setSelectedResult] = useState(-1);
  const [searchActive, setSearchActive] = useState(false);
  const [rankingTime] = useState(() => new Date());
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editor, setEditor] = useState<Shortcut | null | 'new'>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [toast, setToast] = useState('');
  const addMenuRef = useRef<HTMLDivElement>(null);
  const dialogOpenerRef = useRef<HTMLElement | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [collectionEditor, setCollectionEditor] = useState<Collection | 'new' | null>(null);
  const [bookmarkFolders, setBookmarkFolders] = useState<BookmarkFolderOption[]>([]);
  const [bookmarkModalOpen, setBookmarkModalOpen] = useState(false);
  const [bookmarkLoading, setBookmarkLoading] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [recentSites, setRecentSites] = useState<Shortcut[]>([]);
  const [recentModalOpen, setRecentModalOpen] = useState(false);
  const [recentLoading, setRecentLoading] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const importRef = useRef<HTMLInputElement>(null);
  const backgroundRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { locale, t } = useMemo(
    () => makeTranslator(data.settings.language),
    [data.settings.language],
  );

  useEffect(() => {
    void loadBackgroundImage()
      .then(setBackgroundImage)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (
      !ready ||
      !data.settings.autoAddTopSites ||
      typeof chrome === 'undefined' ||
      !chrome.topSites?.get
    )
      return;
    let cancelled = false;
    void chrome.topSites
      .get()
      .then((sites) => {
        if (cancelled) return;
        setData((current) => {
          const existingHosts = new Set(
            current.shortcuts.flatMap((item) => {
              try {
                return [new URL(item.url).hostname.replace(/^www\./, '')];
              } catch {
                return [];
              }
            }),
          );
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
          return additions.length
            ? { ...current, shortcuts: [...current.shortcuts, ...additions] }
            : current;
        });
      })
      .catch(() => {
        // Permission can be revoked or the browser can omit this optional API.
      });
    return () => {
      cancelled = true;
    };
  }, [ready, data.settings.autoAddTopSites, setData]);

  useEffect(() => {
    const updateViewport = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = data.settings.theme;
  }, [locale, data.settings.theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleToast = saveError ? t('storageError') : toast;
  const hasDialog =
    settingsOpen ||
    Boolean(editor) ||
    Boolean(collectionEditor) ||
    bookmarkModalOpen ||
    recentModalOpen;

  useEffect(() => {
    if (!addMenuOpen) return;
    addMenuRef.current?.querySelector<HTMLButtonElement>('[role=menuitem]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!addMenuRef.current?.contains(event.target as Node)) setAddMenuOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [addMenuOpen]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (
        !hasDialog &&
        (event.key === '/' ||
          ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) &&
        !isTyping
      ) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setQuery('');
        setSearchActive(false);
        if (editor) setEditor(null);
        else if (collectionEditor) setCollectionEditor(null);
        else if (bookmarkModalOpen) setBookmarkModalOpen(false);
        else if (recentModalOpen) setRecentModalOpen(false);
        else if (addMenuOpen) {
          setAddMenuOpen(false);
          addMenuRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus();
        } else setSettingsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addMenuOpen, editor, collectionEditor, bookmarkModalOpen, recentModalOpen, hasDialog]);

  const filtered = query.trim()
    ? data.shortcuts.filter((item) =>
        `${item.title} ${item.url}`.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : [];

  const activeCollectionFilter =
    data.settings.collectionsEnabled &&
    (collectionFilter === 'all' ||
      collectionFilter === 'ungrouped' ||
      data.collections.some((collection) => collection.id === collectionFilter))
      ? collectionFilter
      : 'all';

  const collectionShortcuts = useMemo(() => {
    if (!data.settings.collectionsEnabled || activeCollectionFilter === 'all')
      return data.shortcuts;
    if (activeCollectionFilter === 'ungrouped')
      return data.shortcuts.filter((item) => !item.collectionId);
    return data.shortcuts.filter((item) => item.collectionId === activeCollectionFilter);
  }, [activeCollectionFilter, data.settings.collectionsEnabled, data.shortcuts]);

  const visibleShortcuts = useMemo(
    () =>
      [...collectionShortcuts].sort(
        (a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)),
      ),
    [collectionShortcuts],
  );
  const suggestions = useMemo(
    () =>
      rankShortcuts(
        collectionShortcuts.filter((item) => !item.pinned),
        rankingUsage,
        rankingTime,
      )
        .filter(({ item, score }) => score > 8 && (rankingUsage[item.id]?.count ?? 0) >= 2)
        .slice(0, 3),
    [collectionShortcuts, rankingUsage, rankingTime],
  );
  const tileLayout = useMemo(
    () =>
      calculateTileLayout(
        visibleShortcuts.length,
        viewport.width,
        viewport.height,
        (suggestions.length ? 154 : 0) + (data.settings.collectionsEnabled ? 48 : 0),
      ),
    [
      data.settings.collectionsEnabled,
      suggestions.length,
      viewport.height,
      viewport.width,
      visibleShortcuts.length,
    ],
  );

  const collectionChips = useMemo(() => {
    return [
      { id: 'all', title: t('allLinks'), count: data.shortcuts.length },
      ...data.collections.map((collection) => ({
        id: collection.id,
        title: collection.title,
        count: data.shortcuts.filter((item) => item.collectionId === collection.id).length,
      })),
      ...(data.shortcuts.some((item) => !item.collectionId)
        ? [
            {
              id: 'ungrouped',
              title: t('ungrouped'),
              count: data.shortcuts.filter((item) => !item.collectionId).length,
            },
          ]
        : []),
    ];
  }, [data.collections, data.shortcuts, t]);

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
      const image = reader.result;
      void (async () => {
        try {
          const preview = new Image();
          preview.src = image;
          await preview.decode();
          await saveBackgroundImage(image);
          setBackgroundImage(image);
          setToast(t('backgroundSaved'));
        } catch {
          setToast(t('backgroundError'));
        }
      })();
    };
    reader.onerror = () => setToast(t('backgroundError'));
    reader.readAsDataURL(file);
    if (backgroundRef.current) backgroundRef.current.value = '';
  }

  function removeBackground() {
    void saveBackgroundImage(null)
      .then(() => {
        setBackgroundImage(null);
        setToast(t('backgroundRemoved'));
      })
      .catch(() => setToast(t('backgroundError')));
  }

  function resetAll() {
    if (!window.confirm(t('resetConfirm'))) return;
    setRankingUsage({});
    setUndo(null);
    restore(structuredClone(defaultData));
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

  function openManualShortcutEditor() {
    setAddMenuOpen(false);
    setEditor('new');
  }

  async function openRecentSites() {
    setAddMenuOpen(false);
    if (typeof chrome === 'undefined' || !chrome.topSites?.get) {
      setToast(t('recentSitesUnavailable'));
      return;
    }
    if (chrome.permissions?.request) {
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
    setRecentLoading(true);
    try {
      const sites = await chrome.topSites.get();
      const existingHosts = new Set(data.shortcuts.map((item) => hostLabel(item.url)));
      const options = sites.flatMap((site, index) => {
        const shortcut = asTopSiteShortcut(site, index);
        if (!shortcut || existingHosts.has(hostLabel(shortcut.url))) return [];
        existingHosts.add(hostLabel(shortcut.url));
        return [shortcut];
      });
      setRecentSites(options);
      setRecentModalOpen(true);
    } catch {
      setToast(t('recentSitesUnavailable'));
    } finally {
      setRecentLoading(false);
    }
  }

  function addRecentSite(site: Shortcut) {
    const host = hostLabel(site.url);
    const alreadyAdded = data.shortcuts.some((item) => hostLabel(item.url) === host);
    if (!alreadyAdded)
      setData((current) =>
        current.shortcuts.some((item) => hostLabel(item.url) === host)
          ? current
          : {
              ...current,
              shortcuts: [...current.shortcuts, site],
              dismissedAutoSites: current.dismissedAutoSites.filter((item) => item !== host),
            },
      );
    setRecentModalOpen(false);
    setRecentSites([]);
    setToast(alreadyAdded ? t('recentAlreadyAdded') : t('recentAdded'));
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
    if (
      data.collections.some(
        (item) => item.id !== editing?.id && item.title.toLowerCase() === normalized.toLowerCase(),
      )
    ) {
      setToast(t('collectionExists'));
      return;
    }
    if (editing) {
      setData((current) => ({
        ...current,
        collections: current.collections.map((item) =>
          item.id === editing.id ? { ...item, title: normalized } : item,
        ),
      }));
      setToast(t('collectionRenamed'));
    } else {
      setData((current) => ({
        ...current,
        collections: [
          ...current.collections,
          {
            id: `collection-${crypto.randomUUID()}`,
            title: normalized,
            color: shortcutColors[current.collections.length % shortcutColors.length],
          },
        ],
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
      shortcuts: current.shortcuts.map((item) =>
        item.collectionId === collection.id ? { ...item, collectionId: undefined } : item,
      ),
    }));
    if (collectionFilter === collection.id) setCollectionFilter('all');
    setToast(t('collectionDeleted'));
  }

  function assignDraggedShortcut(collectionId: string) {
    if (!draggedId || collectionId === 'all') return;
    setData((current) => ({
      ...current,
      shortcuts: current.shortcuts.map((item) =>
        item.id === draggedId
          ? collectionId === 'ungrouped'
            ? { ...item, collectionId: undefined }
            : { ...item, collectionId }
          : item,
      ),
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
        if (!granted) {
          setToast(t('bookmarksPermission'));
          return;
        }
      } catch {
        setToast(t('bookmarksPermission'));
        return;
      }
    }
    try {
      const tree = await chrome.bookmarks.getTree();
      const folders = getBookmarkFolders(tree);
      if (!folders.length) {
        setToast(t('bookmarksNoFolders'));
        return;
      }
      setBookmarkFolders(folders);
      setBookmarkModalOpen(true);
    } catch {
      setToast(t('bookmarksImportError'));
    }
  }

  async function importBookmarks(folderId: string) {
    if (typeof chrome === 'undefined' || !chrome.bookmarks?.getSubTree) return;
    setBookmarkLoading(true);
    try {
      const tree = await chrome.bookmarks.getSubTree(folderId);
      const root = tree[0];
      if (!root) {
        setToast(t('bookmarksImportError'));
        return;
      }
      const result = makeBookmarkImport(data, root);
      if (!result.imported) {
        setToast(
          result.skipped
            ? `${t('bookmarksNoNewLinks')} · ${result.skipped} ${t('bookmarksSkipped')}`
            : t('bookmarksNoLinks'),
        );
        return;
      }
      setData(result.data);
      setBookmarkModalOpen(false);
      setToast(
        `${t('bookmarksImported')}: ${result.imported}${result.skipped ? ` · ${result.skipped} ${t('bookmarksSkipped')}` : ''}`,
      );
    } catch {
      setToast(t('bookmarksImportError'));
    } finally {
      setBookmarkLoading(false);
    }
  }

  function recordVisit(id: string) {
    if (typeof chrome !== 'undefined' && chrome.extension?.inIncognitoContext) return;
    setData((current) => recordShortcutVisit(current, id));
  }

  async function openShortcut(item: Shortcut) {
    if (!(typeof chrome !== 'undefined' && chrome.extension?.inIncognitoContext)) {
      const next = recordShortcutVisit(data, item.id);
      try {
        await saveData(next);
      } catch {
        setToast(t('storageError'));
      }
    }
    window.location.assign(item.url);
  }

  function linkClick(event: React.MouseEvent<HTMLAnchorElement>, item: Shortcut) {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
      recordVisit(item.id);
      return;
    }
    event.preventDefault();
    void openShortcut(item);
  }

  async function submitSearch(forceWeb = false) {
    const text = query.trim();
    if (!text) return;
    const selected =
      !forceWeb && selectedResult >= 0 ? filtered.slice(0, 5)[selectedResult] : undefined;
    if (selected) {
      await openShortcut(selected);
      return;
    }
    const exact = data.shortcuts.find((item) => item.title.toLowerCase() === text.toLowerCase());
    if (exact && !forceWeb && selectedResult < 0) {
      await openShortcut(exact);
      return;
    }
    if (
      data.settings.searchEngine === 'browser' &&
      typeof chrome !== 'undefined' &&
      chrome.search?.query
    ) {
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
    if (!ready) return;
    setData((current) => ({
      ...current,
      shortcuts: current.shortcuts.some((item) => item.id === shortcut.id)
        ? current.shortcuts.map((item) => (item.id === shortcut.id ? shortcut : item))
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
      if (!shortcuts.some((item) => item.id === undo.item.id))
        shortcuts.splice(Math.min(undo.index, shortcuts.length), 0, undo.item);
      return {
        ...current,
        shortcuts,
        dismissedAutoSites: current.dismissedAutoSites.filter(
          (host) => host !== hostLabel(undo.item.url),
        ),
      };
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
      next.splice(to, 0, moved);
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
      if (file.size > 2 * 1024 * 1024) throw new Error('File too large');
      const parsed = JSON.parse(await file.text()) as Partial<AppData>;
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup');
      if (!Array.isArray(parsed.shortcuts)) throw new Error('missing shortcuts');
      if (
        parsed.shortcuts.some(
          (item) =>
            !item ||
            typeof item.id !== 'string' ||
            typeof item.title !== 'string' ||
            typeof item.url !== 'string',
        )
      )
        throw new Error('invalid shortcuts');
      parsed.shortcuts.forEach((item) => normalizeUrl(item.url));
      const imported = mergeData(parsed);
      imported.shortcuts = imported.shortcuts.map((item) => ({
        ...item,
        url: normalizeUrl(item.url),
      }));
      if (!window.confirm(t('importConfirm'))) return;
      setUndo(null);
      restore(imported);
      setToast(t('imported'));
    } catch {
      setToast(t('importError'));
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  function renderShortcut(
    item: Shortcut,
    index: number,
    reason: SmartReason = item.pinned ? 'pinned' : null,
  ) {
    const reasonKey =
      reason &&
      (
        {
          pinned: 'smartPinned',
          rightNow: 'smartRightNow',
          today: 'smartToday',
          recent: 'smartRecent',
          frequent: 'smartFrequent',
          suggested: 'smartSuggested',
        } as const
      )[reason];
    return (
      <article
        className={`shortcut-wrap tile-rank-${index} ${draggedId === item.id ? 'is-dragging' : ''}`}
        style={{ '--index': index, '--shortcut-color': item.color } as React.CSSProperties}
        key={item.id}
        onKeyDown={(event) => {
          if (
            !event.altKey ||
            !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
          )
            return;
          event.preventDefault();
          const step =
            event.key === 'ArrowLeft'
              ? -1
              : event.key === 'ArrowRight'
                ? 1
                : event.key === 'ArrowUp'
                  ? -tileLayout.columns
                  : tileLayout.columns;
          const peers = visibleShortcuts.filter(
            (peer) => Boolean(peer.pinned) === Boolean(item.pinned),
          );
          const target = peers[peers.findIndex((peer) => peer.id === item.id) + step];
          if (!target) return;
          setData((current) => {
            const shortcuts = [...current.shortcuts];
            const from = shortcuts.findIndex((peer) => peer.id === item.id);
            const to = shortcuts.findIndex((peer) => peer.id === target.id);
            shortcuts.splice(from, 1);
            shortcuts.splice(to, 0, item);
            return { ...current, shortcuts };
          });
        }}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData('text/plain', item.id);
          event.dataTransfer.effectAllowed = 'move';
          setDraggedId(item.id);
        }}
        onDragEnd={() => setDraggedId(null)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => reorder(item.id)}
      >
        <a
          className="shortcut"
          href={item.url}
          title={item.title}
          onClick={(event) => linkClick(event, item)}
          onAuxClick={(event) => {
            if (event.button === 1) recordVisit(item.id);
          }}
        >
          <span className="shortcut-topline">
            <ShortcutMark item={item} />
          </span>
          <span className="shortcut-title">{item.title}</span>
          <small className="shortcut-host">{hostLabel(item.url)}</small>
          {reasonKey && (
            <small className="shortcut-meta">
              {reason === 'pinned' && <Pin size={12} />}
              <span>{t(reasonKey)}</span>
            </small>
          )}
        </a>
        <button
          className="shortcut-menu"
          onClick={() => setEditor(item)}
          aria-label={`${t('edit')}: ${item.title}`}
        >
          <MoreHorizontal size={17} />
        </button>
      </article>
    );
  }

  return (
    <DialogFocusContext.Provider value={dialogOpenerRef}>
      <main
        onClickCapture={(event) => {
          const target = (event.target as Element).closest<HTMLElement>('button, a');
          if (target)
            dialogOpenerRef.current = target.closest('[role="menu"]')
              ? (addMenuRef.current?.querySelector('button') ?? target)
              : target;
        }}
        className={`app ${focusMode ? 'is-focus' : ''} ${data.settings.compactMode ? 'is-compact' : ''} ${backgroundImage ? 'has-background' : ''} ${draggedId ? 'is-dragging-shortcut' : ''}`}
      >
        <div
          className="background-image"
          aria-hidden="true"
          style={
            {
              '--background-image': backgroundImage ? `url(${backgroundImage})` : 'none',
            } as React.CSSProperties
          }
        />
        <div className="ambient" aria-hidden="true" />
        <div className="page-content" inert={hasDialog}>
          <header className="topbar">
            <div className="brand">
              <span className="brand-symbol" aria-hidden="true" />
              Radial<span className="brand-caption">New Tab</span>
            </div>
          </header>

          <section className="center" aria-label={t('yourLinks')}>
            <Clock locale={locale} settings={data.settings} />
            <form
              className="search"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setSearchActive(false);
              }}
              onSubmit={(event) => {
                event.preventDefault();
                submitSearch();
              }}
            >
              <Search size={21} aria-hidden="true" />
              <input
                ref={searchInputRef}
                value={query}
                onFocus={() => setSearchActive(true)}
                onBlur={(event) => {
                  if (!event.currentTarget.closest('form')?.contains(event.relatedTarget as Node))
                    setSearchActive(false);
                }}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSelectedResult(-1);
                  setSearchActive(true);
                }}
                role="combobox"
                aria-expanded={Boolean(query.trim() && searchActive)}
                aria-controls="search-results"
                aria-autocomplete="list"
                aria-activedescendant={
                  query.trim() && searchActive && selectedResult >= 0
                    ? `result-${selectedResult}`
                    : undefined
                }
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    setSearchActive(true);
                    const length = Math.min(filtered.length, 5);
                    setSelectedResult((current) =>
                      event.key === 'ArrowDown'
                        ? Math.min(length, current + 1)
                        : Math.max(-1, current - 1),
                    );
                  }
                }}
                placeholder={t('search')}
                aria-label={t('search')}
                autoFocus
              />
              <kbd>Enter</kbd>
              {query && (
                <button
                  type="button"
                  className="clear"
                  onClick={() => {
                    setQuery('');
                    setSelectedResult(-1);
                    searchInputRef.current?.focus();
                  }}
                  aria-label={t('close')}
                >
                  <X size={17} />
                </button>
              )}
              {query.trim() && searchActive && (
                <div
                  className="search-results"
                  id="search-results"
                  role="listbox"
                  aria-label={t('search')}
                >
                  {filtered.slice(0, 5).map((item, index) => (
                    <a
                      id={`result-${index}`}
                      key={item.id}
                      href={item.url}
                      role="option"
                      aria-selected={selectedResult === index}
                      onClick={(event) => linkClick(event, item)}
                      onAuxClick={(event) => {
                        if (event.button === 1) recordVisit(item.id);
                      }}
                    >
                      <ShortcutMark item={item} small />
                      <span>
                        <strong>{item.title}</strong>
                        <small>{item.url}</small>
                      </span>
                    </a>
                  ))}
                  <button
                    id={`result-${Math.min(filtered.length, 5)}`}
                    type="button"
                    role="option"
                    aria-selected={selectedResult === Math.min(filtered.length, 5)}
                    className="web-result"
                    onClick={() => void submitSearch(true)}
                  >
                    <Search size={17} />
                    <span>
                      {t('searchFor')} “{query}”
                    </span>
                  </button>
                  {!filtered.length && <p>{t('noResults')}</p>}
                </div>
              )}
            </form>
          </section>

          <div className="workspace" inert={focusMode}>
            {data.settings.collectionsEnabled && (
              <nav className="collection-toolbar" aria-label={t('collections')}>
                {collectionChips.map((collection) => (
                  <button
                    key={collection.id}
                    className={activeCollectionFilter === collection.id ? 'selected' : ''}
                    aria-pressed={activeCollectionFilter === collection.id}
                    onClick={() => setCollectionFilter(collection.id)}
                    onDragOver={(event) => {
                      if (draggedId && collection.id !== 'all') event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      assignDraggedShortcut(collection.id);
                    }}
                  >
                    <span>{collection.title}</span>
                    <small>{collection.count}</small>
                  </button>
                ))}
              </nav>
            )}

            {suggestions.length > 0 && (
              <section className="suggestions" aria-label={t('smartForYou')}>
                <header className="section-heading">
                  <h2>
                    <Sparkles size={16} />
                    {t('smartForYou')}
                  </h2>
                  <span>{t('smartGridHint')}</span>
                </header>
                <div className="suggestion-grid">
                  {suggestions.map(({ item, reason }) => (
                    <a
                      key={item.id}
                      href={item.url}
                      onClick={(event) => linkClick(event, item)}
                      onAuxClick={(event) => {
                        if (event.button === 1) recordVisit(item.id);
                      }}
                      className="suggestion"
                      style={{ '--shortcut-color': item.color } as React.CSSProperties}
                    >
                      <ShortcutMark item={item} />
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {t(
                            reason === 'rightNow'
                              ? 'smartRightNow'
                              : reason === 'today'
                                ? 'smartToday'
                                : reason === 'recent'
                                  ? 'smartRecent'
                                  : 'smartFrequent',
                          )}
                        </small>
                      </span>
                    </a>
                  ))}
                </div>
              </section>
            )}
            <section className="library">
              <header className="section-heading">
                <h2>
                  {t('yourLinks')}
                  <span className="link-count">{visibleShortcuts.length}</span>
                </h2>
                <span className="library-hint">{t('reorderHint')}</span>
              </header>
              {loadError && <p role="alert">{t('loadError')}</p>}
              <div
                className={`shortcut-space is-tiles density-${tileLayout.density}`}
                style={
                  {
                    '--tile-columns': tileLayout.columns,
                    '--tile-height': `${tileLayout.height}px`,
                    '--tile-gap': `${tileLayout.gap}px`,
                  } as React.CSSProperties
                }
                aria-label={t('reorderHint')}
              >
                {ready && visibleShortcuts.map((item, index) => renderShortcut(item, index))}
                {ready && !visibleShortcuts.length && (
                  <button className="collection-empty" onClick={() => setEditor('new')}>
                    <Plus size={24} />
                    <span>{t('collectionEmpty')}</span>
                    <strong>{t('add')}</strong>
                  </button>
                )}
              </div>
            </section>
          </div>

          <nav className="dock" aria-label={t('actions')}>
            <div className="dock-add" ref={addMenuRef}>
              <button
                disabled={!ready}
                aria-controls={addMenuOpen ? 'add-menu' : undefined}
                aria-expanded={addMenuOpen}
                aria-haspopup="menu"
                onClick={() => setAddMenuOpen((value) => !value)}
              >
                <Plus size={20} />
                <span>{t('add')}</span>
              </button>
              {addMenuOpen && (
                <div
                  className="add-menu"
                  role="menu"
                  id="add-menu"
                  onKeyDown={(event) => {
                    if (
                      event.key === 'ArrowDown' ||
                      event.key === 'ArrowUp' ||
                      event.key === 'Home' ||
                      event.key === 'End'
                    ) {
                      event.preventDefault();
                      const buttons = Array.from(
                        event.currentTarget.querySelectorAll<HTMLButtonElement>(
                          'button:not(:disabled)',
                        ),
                      );
                      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                      buttons[
                        event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? buttons.length - 1
                            : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                              buttons.length
                      ]?.focus();
                    }
                    if (event.key === 'Tab') setAddMenuOpen(false);
                  }}
                >
                  <button role="menuitem" onClick={openManualShortcutEditor}>
                    <Plus size={17} />
                    <span>
                      <strong>{t('addManually')}</strong>
                      <small>{t('addManuallyHint')}</small>
                    </span>
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => void openRecentSites()}
                    disabled={recentLoading}
                  >
                    <History size={17} />
                    <span>
                      <strong>{t('addFromRecent')}</strong>
                      <small>{recentLoading ? t('loadingRecent') : t('addFromRecentHint')}</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
            <i />
            <button
              aria-pressed={focusMode}
              className={focusMode ? 'active' : ''}
              onClick={() => setFocusMode((value) => !value)}
            >
              <Focus size={20} />
              <span>{t('focus')}</span>
            </button>
            <i />
            <button onClick={() => setSettingsOpen(true)}>
              <SettingsIcon size={20} />
              <span>{t('settings')}</span>
            </button>
          </nav>

          <button
            className="settings-fab"
            onClick={() => setSettingsOpen(true)}
            aria-label={t('openSettings')}
          >
            <SettingsIcon size={20} />
          </button>
        </div>

        {settingsOpen && (
          <SettingsPanel
            covered={
              Boolean(editor) || Boolean(collectionEditor) || bookmarkModalOpen || recentModalOpen
            }
            syncState={syncState}
            data={data}
            t={t}
            patchSettings={patchSettings}
            toggleTopSites={toggleTopSites}
            backgroundImage={backgroundImage}
            backgroundRef={backgroundRef}
            onBackgroundFile={handleBackgroundFile}
            removeBackground={removeBackground}
            close={() => setSettingsOpen(false)}
            exportData={exportData}
            importRef={importRef}
            importData={importData}
            reset={resetAll}
            createCollection={createCollection}
            renameCollection={renameCollection}
            removeCollection={removeCollection}
            openBookmarkImport={() => void openBookmarkImport()}
          />
        )}
        {recentModalOpen && (
          <RecentSitesModal
            sites={recentSites}
            t={t}
            loading={recentLoading}
            close={() => setRecentModalOpen(false)}
            addSite={addRecentSite}
          />
        )}
        {bookmarkModalOpen && (
          <BookmarkImportModal
            folders={bookmarkFolders}
            t={t}
            loading={bookmarkLoading}
            close={() => setBookmarkModalOpen(false)}
            importFolder={(folderId) => void importBookmarks(folderId)}
          />
        )}
        {collectionEditor && (
          <CollectionEditor
            value={collectionEditor === 'new' ? null : collectionEditor}
            t={t}
            close={() => setCollectionEditor(null)}
            save={saveCollection}
          />
        )}
        {editor && (
          <ShortcutEditor
            initialCollectionId={
              activeCollectionFilter === 'all' || activeCollectionFilter === 'ungrouped'
                ? undefined
                : activeCollectionFilter
            }
            value={editor === 'new' ? null : editor}
            collections={data.collections}
            collectionsEnabled={data.settings.collectionsEnabled}
            t={t}
            close={() => setEditor(null)}
            save={saveShortcut}
            remove={removeShortcut}
          />
        )}
        {visibleToast && (
          <div className="toast" role="status">
            <Check size={17} />
            {visibleToast}
            {undo && toast === t('deleted') && (
              <button onClick={restoreShortcut}>{t('undo')}</button>
            )}
          </div>
        )}
      </main>
    </DialogFocusContext.Provider>
  );
}
