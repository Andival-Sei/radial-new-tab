import type { AppData, Collection, Shortcut } from './types';
import { shortcutColors } from './data';
import { normalizeUrl } from './url';

export type BookmarkNode = chrome.bookmarks.BookmarkTreeNode;
export interface BookmarkFolderOption {
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

function countBookmarkLinks(node: BookmarkNode): number {
  if (node.url) {
    try {
      return /^https?:$/i.test(new URL(node.url).protocol) ? 1 : 0;
    } catch {
      return 0;
    }
  }
  return (node.children ?? []).reduce((total, child) => total + countBookmarkLinks(child), 0);
}

export function getBookmarkFolders(nodes: BookmarkNode[], depth = 0): BookmarkFolderOption[] {
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

export function makeBookmarkImport(data: AppData, root: BookmarkNode): BookmarkImportResult {
  const knownUrls = new Set<string>();
  for (const item of data.shortcuts) {
    try {
      knownUrls.add(normalizeUrl(item.url));
    } catch {
      /* Keep malformed legacy data out of the dedupe set. */
    }
  }
  const importedCollections = new Map<string, { id: string; title: string }>();
  const newShortcuts: Shortcut[] = [];
  let skipped = 0;

  function visit(node: BookmarkNode, folderPath: string[], folderId: string) {
    if (node.url) {
      try {
        const url = normalizeUrl(node.url);
        if (knownUrls.has(url)) {
          skipped += 1;
          return;
        }
        knownUrls.add(url);
        const collectionKey = folderId;
        if (!importedCollections.has(collectionKey)) {
          const generatedId = collectionIdForBookmarkFolder(collectionKey);
          const existing = data.collections.find(
            (collection) =>
              collection.bookmarkFolderId === collectionKey || collection.id === generatedId,
          );
          importedCollections.set(collectionKey, {
            id: existing?.id ?? generatedId,
            title: existing?.title ?? (folderPath.filter(Boolean).join(' / ') || 'Imported'),
          });
        }
        const collectionId =
          importedCollections.get(collectionKey)?.id ??
          collectionIdForBookmarkFolder(collectionKey);
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
  const collections: Collection[] = [...importedCollections.entries()].map(
    ([folderId, item], index) => {
      const existing = data.collections.find(
        (collection) => collection.bookmarkFolderId === folderId || collection.id === item.id,
      );
      return (
        existing ?? {
          id: item.id,
          title: item.title,
          color: shortcutColors[(data.collections.length + index) % shortcutColors.length],
          bookmarkFolderId: folderId,
        }
      );
    },
  );
  const mergedCollectionIds = new Set(data.collections.map((collection) => collection.id));
  const addedCollections = collections.filter(
    (collection) => !mergedCollectionIds.has(collection.id),
  );
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
