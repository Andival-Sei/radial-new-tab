import { useState } from 'react';
import {
  Bookmark,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  History,
  Image as ImageIcon,
  Languages,
  Pencil,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { AppData, Collection, Language, SearchEngine, Shortcut, Theme } from '../types';
import type { Translator } from '../i18n';
import type { BookmarkFolderOption } from '../bookmarks';
import { shortcutColors } from '../data';
import { normalizeUrl } from '../url';
import { hostLabel } from '../shortcut-utils';
import { useDialogFocus } from '../use-dialog-focus';
import { ShortcutMark } from './ShortcutMark';

interface RecentSitesModalProps {
  sites: Shortcut[];
  t: Translator;
  loading: boolean;
  close: () => void;
  addSite: (site: Shortcut) => void;
}

function Segment<T extends string>({
  value,
  values,
  labels,
  onChange,
}: {
  value: T;
  values: readonly T[];
  labels: string[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segment">
      {values.map((item, index) => (
        <button
          key={item}
          className={value === item ? 'selected' : ''}
          aria-pressed={value === item}
          onClick={() => onChange(item)}
        >
          {labels[index]}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel({
  covered,
  syncState,
  data,
  t,
  patchSettings,
  toggleTopSites,
  backgroundImage,
  backgroundRef,
  onBackgroundFile,
  removeBackground,
  close,
  exportData,
  importRef,
  importData,
  reset,
  createCollection,
  renameCollection,
  removeCollection,
  openBookmarkImport,
}: {
  covered: boolean;
  syncState: 'synced' | 'local' | null;
  data: AppData;
  t: Translator;
  patchSettings: (patch: Partial<AppData['settings']>) => void;
  toggleTopSites: (enabled: boolean) => void;
  close: () => void;
  backgroundImage: string | null;
  backgroundRef: React.RefObject<HTMLInputElement | null>;
  onBackgroundFile: (file?: File) => void;
  removeBackground: () => void;
  exportData: () => void;
  importRef: React.RefObject<HTMLInputElement | null>;
  importData: (file?: File) => void;
  reset: () => void;
  createCollection: () => void;
  renameCollection: (collection: Collection) => void;
  removeCollection: (collection: Collection) => void;
  openBookmarkImport: () => void;
}) {
  const dialogRef = useDialogFocus();
  return (
    <div
      className="sheet-layer"
      inert={covered}
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <aside
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        className="settings-panel"
        aria-label={t('settings')}
      >
        <header>
          <h2>{t('settings')}</h2>
          <button onClick={close} aria-label={t('close')}>
            <X size={21} />
          </button>
        </header>
        <div className="settings-content">
          <section>
            <h3>
              <Sun size={18} />
              {t('appearance')}
            </h3>
            <Segment<Theme>
              value={data.settings.theme}
              values={['system', 'light', 'dark']}
              labels={[t('system'), t('light'), t('dark')]}
              onChange={(theme) => patchSettings({ theme })}
            />
          </section>
          <section>
            <h3>
              <Languages size={18} />
              {t('language')}
            </h3>
            <Segment<Language>
              value={data.settings.language}
              values={['auto', 'ru', 'en']}
              labels={[t('auto'), t('russian'), t('english')]}
              onChange={(language) => patchSettings({ language })}
            />
          </section>
          <section>
            <label htmlFor="engine">{t('searchEngine')}</label>
            <div className="select-wrap">
              <select
                id="engine"
                value={data.settings.searchEngine}
                onChange={(e) => patchSettings({ searchEngine: e.target.value as SearchEngine })}
              >
                <option value="browser">{t('browserDefault')}</option>
                <option value="google">Google</option>
                <option value="yandex">Яндекс</option>
                <option value="bing">Microsoft Bing</option>
                <option value="duckduckgo">DuckDuckGo</option>
              </select>
              <ChevronDown size={17} />
            </div>
          </section>
          <section className="collections-settings">
            <h3>
              <FolderOpen size={18} />
              {t('collections')}
            </h3>
            <Toggle
              label={t('enableCollections')}
              checked={data.settings.collectionsEnabled}
              onChange={(collectionsEnabled) => patchSettings({ collectionsEnabled })}
            />
            <p className="settings-note">{t('collectionsHint')}</p>
            {data.settings.collectionsEnabled && (
              <>
                <div className="collection-list">
                  {data.collections.map((collection) => (
                    <div className="collection-row" key={collection.id}>
                      <span
                        className="collection-swatch"
                        style={{ background: collection.color }}
                      />
                      <strong title={collection.title}>{collection.title}</strong>
                      <small>
                        {
                          data.shortcuts.filter((item) => item.collectionId === collection.id)
                            .length
                        }
                      </small>
                      <button
                        onClick={() => renameCollection(collection)}
                        aria-label={`${t('renameCollection')}: ${collection.title}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        className="danger-icon"
                        onClick={() => removeCollection(collection)}
                        aria-label={`${t('deleteCollection')}: ${collection.title}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                {!data.collections.length && <p className="settings-note">{t('noCollections')}</p>}
                <button className="settings-action collection-add" onClick={createCollection}>
                  <Plus size={17} />
                  <span>{t('addCollection')}</span>
                </button>
                <div className="bookmark-import">
                  <div>
                    <strong>{t('bookmarkImport')}</strong>
                    <span>{t('bookmarkImportHint')}</span>
                  </div>
                  <button className="settings-action" onClick={openBookmarkImport}>
                    <Bookmark size={17} />
                    <span>{t('importBookmarks')}</span>
                  </button>
                </div>
              </>
            )}
          </section>
          <section>
            <h3>
              <History size={18} />
              {t('automation')}
            </h3>
            <Toggle
              label={t('autoAddTopSites')}
              checked={data.settings.autoAddTopSites}
              onChange={(enabled) => void toggleTopSites(enabled)}
            />
            <p className="settings-note">{t('autoAddTopSitesHint')}</p>
          </section>
          <section>
            <h3>
              <ImageIcon size={18} />
              {t('background')}
            </h3>
            <div className="background-picker">
              {backgroundImage ? (
                <div
                  className="background-preview"
                  style={{ backgroundImage: `url(${backgroundImage})` }}
                  aria-label={t('backgroundPreview')}
                />
              ) : (
                <div className="background-preview is-empty">
                  <ImageIcon size={22} />
                </div>
              )}
              <div className="background-picker-copy">
                <strong>
                  {backgroundImage ? t('backgroundSelected') : t('backgroundDefault')}
                </strong>
                <span>{t('backgroundHint')}</span>
                <div className="background-picker-actions">
                  <button
                    className="settings-action"
                    onClick={() => backgroundRef.current?.click()}
                  >
                    <Upload size={17} />
                    <span>{t('chooseImage')}</span>
                  </button>
                  {backgroundImage && (
                    <button className="settings-action danger" onClick={removeBackground}>
                      <Trash2 size={17} />
                      <span>{t('removeBackground')}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <input
              ref={backgroundRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onBackgroundFile(e.target.files?.[0])}
            />
          </section>
          <section className="switches">
            <Toggle
              label={t('clock24')}
              checked={data.settings.clock24}
              onChange={(clock24) => patchSettings({ clock24 })}
            />
            <Toggle
              label={t('seconds')}
              checked={data.settings.showSeconds}
              onChange={(showSeconds) => patchSettings({ showSeconds })}
            />
            <Toggle
              label={t('compact')}
              checked={data.settings.compactMode}
              onChange={(compactMode) => patchSettings({ compactMode })}
            />
          </section>
          <section>
            <h3>{t('data')}</h3>
            <p className="settings-note sync-note">
              {t(syncState === 'local' ? 'localSaveHint' : 'syncHint')}
            </p>
            <button className="settings-action" onClick={exportData}>
              <Download size={18} />
              <span>{t('export')}</span>
            </button>
            <button className="settings-action" onClick={() => importRef.current?.click()}>
              <Upload size={18} />
              <span>{t('import')}</span>
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => void importData(e.target.files?.[0])}
            />
            <button className="settings-action danger" onClick={reset}>
              <RotateCcw size={18} />
              <span>{t('reset')}</span>
            </button>
          </section>
          <p className="settings-version">
            Radial New Tab <span>v{__APP_VERSION__}</span>
          </p>
        </div>
      </aside>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <i aria-hidden="true" />
    </label>
  );
}

export function CollectionEditor({
  value,
  t,
  close,
  save,
}: {
  value: Collection | null;
  t: Translator;
  close: () => void;
  save: (title: string) => void;
}) {
  const [title, setTitle] = useState(value?.title ?? '');
  const dialogRef = useDialogFocus();
  return (
    <div
      className="modal-layer"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <form
        ref={dialogRef as React.RefObject<HTMLFormElement>}
        role="dialog"
        aria-modal="true"
        aria-label={t('collections')}
        className="editor collection-editor"
        onSubmit={(event) => {
          event.preventDefault();
          save(title);
        }}
      >
        <header>
          <h2>
            <FolderOpen size={20} />
            {value ? t('renameCollection') : t('addCollection')}
          </h2>
          <button type="button" onClick={close} aria-label={t('close')}>
            <X size={21} />
          </button>
        </header>
        <label>
          {t('collectionName')}
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('collectionNamePlaceholder')}
            maxLength={48}
            required
            autoFocus
          />
        </label>
        <p className="settings-note">{t('collectionNameHint')}</p>
        <footer>
          <span />
          <button type="button" className="secondary" onClick={close}>
            {t('cancel')}
          </button>
          <button type="submit" className="primary">
            {t('save')}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function BookmarkImportModal({
  folders,
  t,
  loading,
  close,
  importFolder,
}: {
  folders: BookmarkFolderOption[];
  t: Translator;
  loading: boolean;
  close: () => void;
  importFolder: (folderId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState(folders[0]?.id ?? '');
  const selected = folders.find((folder) => folder.id === selectedId);
  const dialogRef = useDialogFocus();
  return (
    <div
      className="modal-layer"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <form
        ref={dialogRef as React.RefObject<HTMLFormElement>}
        role="dialog"
        aria-modal="true"
        aria-label={t('bookmarkImportTitle')}
        className="editor bookmark-modal"
        onSubmit={(event) => {
          event.preventDefault();
          if (selectedId) importFolder(selectedId);
        }}
      >
        <header>
          <h2>
            <Bookmark size={20} />
            {t('bookmarkImportTitle')}
          </h2>
          <button type="button" onClick={close} aria-label={t('close')}>
            <X size={21} />
          </button>
        </header>
        <p className="modal-copy">{t('bookmarkImportDescription')}</p>
        <label>
          {t('bookmarkFolder')}
          <div className="select-wrap bookmark-select">
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              aria-label={t('bookmarkFolder')}
              disabled={loading}
            >
              {folders.map((folder) => (
                <option
                  key={folder.id}
                  value={folder.id}
                >{`${'  '.repeat(folder.depth)}${folder.title || t('bookmarksRoot')} · ${folder.links}`}</option>
              ))}
            </select>
            <ChevronDown size={17} />
          </div>
        </label>
        {selected && (
          <p className="settings-note bookmark-selection">
            <FolderOpen size={15} />
            {selected.links
              ? `${selected.links} ${t('bookmarkLinksFound')}`
              : t('bookmarksNoLinks')}
          </p>
        )}
        <footer>
          <span />
          <button type="button" className="secondary" onClick={close} disabled={loading}>
            {t('cancel')}
          </button>
          <button type="submit" className="primary" disabled={loading || !selectedId}>
            {loading ? t('importing') : t('importSelected')}
          </button>
        </footer>
      </form>
    </div>
  );
}

export function RecentSitesModal({ sites, t, loading, close, addSite }: RecentSitesModalProps) {
  const dialogRef = useDialogFocus();
  return (
    <div
      className="modal-layer"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <div
        ref={dialogRef as React.RefObject<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-label={t('recentSitesTitle')}
        className="editor recent-modal"
      >
        <header>
          <h2>
            <History size={20} />
            {t('recentSitesTitle')}
          </h2>
          <button type="button" onClick={close} aria-label={t('close')}>
            <X size={21} />
          </button>
        </header>
        <p className="modal-copy">{t('recentSitesDescription')}</p>
        {sites.length ? (
          <div className="recent-sites-list">
            {sites.map((site) => (
              <button
                key={site.id}
                className="recent-site"
                type="button"
                aria-label={`${t('add')}: ${site.title}`}
                onClick={() => addSite(site)}
                disabled={loading}
              >
                <ShortcutMark item={site} small />
                <span>
                  <strong>{site.title}</strong>
                  <small>{hostLabel(site.url)}</small>
                </span>
                <Plus size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        ) : (
          <p className="recent-empty">{t('recentEmpty')}</p>
        )}
        <footer>
          <span />
          <button type="button" className="secondary" onClick={close}>
            {t('cancel')}
          </button>
        </footer>
      </div>
    </div>
  );
}

export function ShortcutEditor({
  initialCollectionId,
  value,
  collections,
  collectionsEnabled,
  t,
  close,
  save,
  remove,
}: {
  initialCollectionId?: string;
  value: Shortcut | null;
  collections: Collection[];
  collectionsEnabled: boolean;
  t: Translator;
  close: () => void;
  save: (item: Shortcut) => void;
  remove: (id: string) => void;
}) {
  const [title, setTitle] = useState(value?.title ?? '');
  const [url, setUrl] = useState(value?.url ?? '');
  const [color, setColor] = useState(value?.color ?? shortcutColors[0]);
  const [collectionId, setCollectionId] = useState(
    value?.collectionId ?? initialCollectionId ?? '',
  );
  const [pinned, setPinned] = useState(value?.pinned ?? false);
  const [error, setError] = useState('');
  const dialogRef = useDialogFocus();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    try {
      save({
        id: value?.id ?? crypto.randomUUID(),
        title: title.trim() || new URL(normalizeUrl(url)).hostname,
        url: normalizeUrl(url),
        color,
        source: value?.source ?? 'manual',
        pinned,
        ...(collectionsEnabled
          ? collectionId
            ? { collectionId }
            : {}
          : value?.collectionId
            ? { collectionId: value.collectionId }
            : {}),
      });
    } catch {
      setError(t('invalidUrl'));
    }
  }

  return (
    <div
      className="modal-layer"
      onMouseDown={(event) => event.target === event.currentTarget && close()}
    >
      <form
        ref={dialogRef as React.RefObject<HTMLFormElement>}
        role="dialog"
        aria-modal="true"
        aria-label={value ? t('edit') : t('add')}
        className="editor"
        onSubmit={submit}
      >
        <header>
          <h2>{value ? t('edit') : t('add')}</h2>
          <button type="button" onClick={close} aria-label={t('close')}>
            <X size={21} />
          </button>
        </header>
        <label>
          {t('title')}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('titlePlaceholder')}
            maxLength={256}
            required
            autoFocus
          />
        </label>
        <label>
          {t('url')}
          <input
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
            }}
            placeholder={t('urlPlaceholder')}
            required
            inputMode="url"
          />
          {error && <small className="error">{error}</small>}
        </label>
        {collectionsEnabled && (
          <label>
            {t('collectionSelect')}
            <div className="select-wrap">
              <select
                value={collectionId}
                onChange={(event) => setCollectionId(event.target.value)}
              >
                <option value="">{t('noCollection')}</option>
                {collections.map((collection) => (
                  <option key={collection.id} value={collection.id}>
                    {collection.title}
                  </option>
                ))}
              </select>
              <ChevronDown size={17} />
            </div>
          </label>
        )}
        <div className="editor-toggle">
          <Toggle label={t('pinShortcut')} checked={pinned} onChange={setPinned} />
          <small>{t('pinShortcutHint')}</small>
        </div>
        <fieldset>
          <legend>{t('color')}</legend>
          <div className="color-row">
            {shortcutColors.map((item) => (
              <button
                type="button"
                key={item}
                className={color === item ? 'selected' : ''}
                style={{ backgroundColor: item }}
                onClick={() => setColor(item)}
                aria-label={item}
                aria-pressed={color === item}
              >
                {color === item && <Check size={15} />}
              </button>
            ))}
          </div>
        </fieldset>
        <footer>
          {value && (
            <button type="button" className="delete" onClick={() => remove(value.id)}>
              {t('remove')}
            </button>
          )}
          <span />
          <button type="button" className="secondary" onClick={close}>
            {t('cancel')}
          </button>
          <button type="submit" className="primary">
            {t('save')}
          </button>
        </footer>
      </form>
    </div>
  );
}
