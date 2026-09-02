import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Check, ChevronDown, Download, Focus, Grid2X2, Languages, Moon, MoreHorizontal,
  Plus, RotateCcw, Search, Settings as SettingsIcon, Sun, Upload, X,
} from 'lucide-react';
import { defaultData, shortcutColors } from './data';
import { makeTranslator } from './i18n';
import { loadData, mergeData, saveData } from './storage';
import type { AppData, Language, LayoutMode, SearchEngine, Shortcut, Theme } from './types';

const searchUrls: Record<Exclude<SearchEngine, 'browser'>, string> = {
  bing: 'https://www.bing.com/search?q=',
  google: 'https://www.google.com/search?q=',
  yandex: 'https://yandex.ru/search/?text=',
  duckduckgo: 'https://duckduckgo.com/?q=',
};

function normalizeUrl(value: string) {
  const candidate = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`;
  const parsed = new URL(candidate);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid protocol');
  return parsed.toString();
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

export default function App() {
  const [data, setData] = useState<AppData>(defaultData);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(new Date());
  const [query, setQuery] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editor, setEditor] = useState<Shortcut | null | 'new'>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [toast, setToast] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { locale, t } = useMemo(() => makeTranslator(data.settings.language), [data.settings.language]);

  useEffect(() => {
    loadData().then((loaded) => { setData(loaded); setReady(true); });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), data.settings.showSeconds ? 1000 : 15000);
    return () => window.clearInterval(timer);
  }, [data.settings.showSeconds]);

  useEffect(() => {
    if (ready) void saveData(data);
  }, [data, ready]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = data.settings.theme;
  }, [locale, data.settings.theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2200);
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
        setSettingsOpen(false);
        setEditor(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filtered = query.trim()
    ? data.shortcuts.filter((item) => `${item.title} ${item.url}`.toLowerCase().includes(query.toLowerCase()))
    : [];

  const visibleShortcuts = useMemo(() => {
    const shortcuts = data.settings.layoutMode === 'tiles' ? data.shortcuts : data.shortcuts.slice(0, 12);
    if (data.settings.layoutMode === 'orbit') return shortcuts;
    return shortcuts
      .map((item, index) => ({ item, index, usage: data.usage[item.id]?.count ?? 0, lastOpened: data.usage[item.id]?.lastOpened ?? 0 }))
      .sort((a, b) => b.usage - a.usage || b.lastOpened - a.lastOpened || a.index - b.index)
      .map(({ item }) => item);
  }, [data.settings.layoutMode, data.shortcuts, data.usage]);

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

  function recordVisit(id: string) {
    const update = () => flushSync(() => setData((current) => {
      const previous = current.usage[id] ?? { count: 0, lastOpened: 0 };
      const next = { ...current, usage: { ...current.usage, [id]: { count: previous.count + 1, lastOpened: Date.now() } } };
      void saveData(next);
      return next;
    }));
    const transitions = document as Document & { startViewTransition?: (callback: () => void) => void };
    if (data.settings.layoutMode === 'tiles' && transitions.startViewTransition) transitions.startViewTransition(update);
    else update();
  }

  async function submitSearch() {
    const text = query.trim();
    if (!text) return;
    const exact = data.shortcuts.find((item) => item.title.toLowerCase() === text.toLowerCase());
    if (exact) {
      window.location.assign(exact.url);
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
    setData((current) => ({ ...current, shortcuts: current.shortcuts.filter((item) => item.id !== id) }));
    setEditor(null);
    setToast(t('deleted'));
  }

  function reorder(overId: string) {
    if (!draggedId || draggedId === overId) return;
    setData((current) => {
      const next = [...current.shortcuts];
      const from = next.findIndex((item) => item.id === draggedId);
      const to = next.findIndex((item) => item.id === overId);
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
      const parsed = JSON.parse(await file.text()) as Partial<AppData>;
      if (!Array.isArray(parsed.shortcuts)) throw new Error('missing shortcuts');
      const imported = mergeData(parsed);
      imported.shortcuts = imported.shortcuts.map((item) => ({ ...item, url: normalizeUrl(item.url) }));
      setData(imported);
      setToast(t('imported'));
    } catch {
      setToast(t('importError'));
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }

  return (
    <main className={`app ${focusMode ? 'is-focus' : ''} ${data.settings.compactMode ? 'is-compact' : ''}`}>
      <div className="ambient" aria-hidden="true" />
      <header className="topbar">
        <div className="date-line"><Moon size={17} aria-hidden="true" /><span>{date}</span></div>
        <div className="greeting">{greeting}</div>
      </header>

      <section className="center" aria-label={greeting}>
        <time className="clock" dateTime={now.toISOString()}>{clock}</time>
        <form className="search" onSubmit={(event) => { event.preventDefault(); submitSearch(); }}>
          <Search size={21} aria-hidden="true" />
          <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('search')} aria-label={t('search')} autoFocus />
          <kbd>Enter</kbd>
          {query && <button type="button" className="clear" onClick={() => setQuery('')} aria-label={t('close')}><X size={17} /></button>}
          {query && (
            <div className="search-results" role="listbox">
              {filtered.slice(0, 5).map((item) => (
                <a key={item.id} href={item.url} role="option" aria-selected="false">
                  <ShortcutMark item={item} small /><span><strong>{item.title}</strong><small>{item.url}</small></span>
                </a>
              ))}
              <button type="submit" className="web-result"><Search size={17} /><span>{t('searchFor')} “{query}”</span></button>
              {!filtered.length && <p>{t('noResults')}</p>}
            </div>
          )}
        </form>
      </section>

      <section className={`shortcut-space ${data.settings.layoutMode === 'tiles' ? 'is-tiles' : 'is-orbit'}`} aria-label={t('reorderHint')}>
        <div className="orbit-ring ring-one" aria-hidden="true" />
        <div className="orbit-ring ring-two" aria-hidden="true" />
        {visibleShortcuts.map((item, index) => (
          <article
            className={`shortcut-wrap tile-rank-${index} ${draggedId === item.id ? 'is-dragging' : ''}`}
            style={{ '--index': index, '--total': Math.min(visibleShortcuts.length, 12), viewTransitionName: `shortcut-${item.id.replace(/[^a-zA-Z0-9_-]/g, '')}` } as React.CSSProperties}
            key={item.id}
            draggable
            onDragStart={() => setDraggedId(item.id)}
            onDragEnd={() => setDraggedId(null)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => reorder(item.id)}
          >
            <a className="shortcut" href={item.url} title={item.title} onClick={() => recordVisit(item.id)}>
              <ShortcutMark item={item} />
              <span className="shortcut-title">{item.title}</span>
              {data.settings.layoutMode === 'tiles' && (data.usage[item.id]?.count ?? 0) >= 3 && <small>{t('opened')}: {data.usage[item.id].count}</small>}
            </a>
            <button className="shortcut-menu" onClick={() => setEditor(item)} aria-label={`${t('edit')}: ${item.title}`}><MoreHorizontal size={17} /></button>
          </article>
        ))}
      </section>

      <nav className="dock" aria-label="Actions">
        <button onClick={() => setEditor('new')}><Plus size={20} /><span>{t('add')}</span></button>
        <i />
        <button className={focusMode ? 'active' : ''} onClick={() => setFocusMode((value) => !value)}><Focus size={20} /><span>{t('focus')}</span></button>
        <i />
        <button onClick={() => setSettingsOpen(true)}><SettingsIcon size={20} /><span>{t('settings')}</span></button>
      </nav>

      <button className="settings-fab" onClick={() => setSettingsOpen(true)} aria-label={t('openSettings')}><SettingsIcon size={20} /></button>

      {settingsOpen && <SettingsPanel data={data} t={t} patchSettings={patchSettings} close={() => setSettingsOpen(false)} exportData={exportData} importRef={importRef} importData={importData} reset={() => { setData(defaultData); setToast(t('resetDone')); }} />}
      {editor && <ShortcutEditor value={editor === 'new' ? null : editor} t={t} close={() => setEditor(null)} save={saveShortcut} remove={removeShortcut} />}
      {toast && <div className="toast" role="status"><Check size={17} />{toast}</div>}
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
    <span className={`shortcut-mark ${small ? 'small' : ''}`} style={{ '--shortcut-color': item.color } as React.CSSProperties}>
      {!hasIcon && <b>{initials(item.title)}</b>}
      {source && <img src={source} alt="" onLoad={() => setLoadedFor(item.url)} onError={() => { setLoadedFor(''); setFailure({ url: item.url, index: sourceIndex + 1 }); }} />}
    </span>
  );
}

function Segment<T extends string>({ value, values, labels, onChange }: { value: T; values: readonly T[]; labels: string[]; onChange: (value: T) => void }) {
  return <div className="segment">{values.map((item, index) => <button key={item} className={value === item ? 'selected' : ''} onClick={() => onChange(item)}>{labels[index]}</button>)}</div>;
}

type Translator = ReturnType<typeof makeTranslator>['t'];

function SettingsPanel({ data, t, patchSettings, close, exportData, importRef, importData, reset }: {
  data: AppData; t: Translator; patchSettings: (patch: Partial<AppData['settings']>) => void; close: () => void;
  exportData: () => void; importRef: React.RefObject<HTMLInputElement | null>; importData: (file?: File) => void; reset: () => void;
}) {
  return (
    <div className="sheet-layer" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <aside className="settings-panel" aria-label={t('settings')}>
        <header><h2>{t('settings')}</h2><button onClick={close} aria-label={t('close')}><X size={21} /></button></header>
        <div className="settings-content">
          <section><h3><Sun size={18} />{t('appearance')}</h3><Segment<Theme> value={data.settings.theme} values={['system', 'light', 'dark']} labels={[t('system'), t('light'), t('dark')]} onChange={(theme) => patchSettings({ theme })} /></section>
          <section><h3><Languages size={18} />{t('language')}</h3><Segment<Language> value={data.settings.language} values={['auto', 'ru', 'en']} labels={[t('auto'), t('russian'), t('english')]} onChange={(language) => patchSettings({ language })} /></section>
          <section><label htmlFor="engine">{t('searchEngine')}</label><div className="select-wrap"><select id="engine" value={data.settings.searchEngine} onChange={(e) => patchSettings({ searchEngine: e.target.value as SearchEngine })}><option value="browser">{t('browserDefault')}</option><option value="google">Google</option><option value="yandex">Яндекс</option><option value="bing">Microsoft Bing</option><option value="duckduckgo">DuckDuckGo</option></select><ChevronDown size={17} /></div></section>
          <section><h3><Grid2X2 size={18} />{t('layout')}</h3><Segment<LayoutMode> value={data.settings.layoutMode} values={['orbit', 'tiles']} labels={[t('orbit'), t('smartTiles')]} onChange={(layoutMode) => patchSettings({ layoutMode })} /></section>
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

function ShortcutEditor({ value, t, close, save, remove }: { value: Shortcut | null; t: Translator; close: () => void; save: (item: Shortcut) => void; remove: (id: string) => void }) {
  const [title, setTitle] = useState(value?.title ?? '');
  const [url, setUrl] = useState(value?.url ?? '');
  const [color, setColor] = useState(value?.color ?? shortcutColors[0]);
  const [error, setError] = useState('');

  function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      save({ id: value?.id ?? crypto.randomUUID(), title: title.trim(), url: normalizeUrl(url), color });
    } catch { setError(t('invalidUrl')); }
  }

  return <div className="modal-layer" onMouseDown={(event) => event.target === event.currentTarget && close()}><form className="editor" onSubmit={submit}><header><h2>{value ? t('edit') : t('add')}</h2><button type="button" onClick={close} aria-label={t('close')}><X size={21} /></button></header><label>{t('title')}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('titlePlaceholder')} required autoFocus /></label><label>{t('url')}<input value={url} onChange={(e) => { setUrl(e.target.value); setError(''); }} placeholder={t('urlPlaceholder')} required inputMode="url" />{error && <small className="error">{error}</small>}</label><fieldset><legend>Color</legend><div className="color-row">{shortcutColors.map((item) => <button type="button" key={item} className={color === item ? 'selected' : ''} style={{ backgroundColor: item }} onClick={() => setColor(item)} aria-label={item}>{color === item && <Check size={15} />}</button>)}</div></fieldset><footer>{value && <button type="button" className="delete" onClick={() => remove(value.id)}>{t('remove')}</button>}<span /><button type="button" className="secondary" onClick={close}>{t('cancel')}</button><button type="submit" className="primary">{t('save')}</button></footer></form></div>;
}
