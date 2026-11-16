import { useMemo, useState } from 'react';
import type { Shortcut } from '../types';

function faviconSources(url: string) {
  const site = new URL(url);
  const directSources = [
    `${site.origin}/favicon.ico`,
    `${site.origin}/apple-touch-icon.png`,
    `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(site.origin)}&sz=128`,
  ];
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    return [
      chrome.runtime.getURL(`/_favicon/?pageUrl=${encodeURIComponent(url)}&size=64`),
      ...directSources,
    ];
  }
  return directSources;
}

function initials(title: string) {
  return title.trim().slice(0, 2).toUpperCase();
}

export function ShortcutMark({ item, small = false }: { item: Shortcut; small?: boolean }) {
  const sources = useMemo(() => faviconSources(item.url), [item.url]);
  const [failure, setFailure] = useState({ url: item.url, index: 0 });
  const [loadedFor, setLoadedFor] = useState('');
  const sourceIndex = failure.url === item.url ? failure.index : 0;
  const source = sources[sourceIndex];
  const hasIcon = loadedFor === item.url;
  return (
    <span
      aria-hidden="true"
      className={`shortcut-mark ${small ? 'small' : ''}`}
      style={{ '--shortcut-color': item.color } as React.CSSProperties}
    >
      {!hasIcon && <b>{initials(item.title)}</b>}
      {source && (
        <img
          src={source}
          alt=""
          onLoad={() => setLoadedFor(item.url)}
          onError={() => {
            setLoadedFor('');
            setFailure({ url: item.url, index: sourceIndex + 1 });
          }}
        />
      )}
    </span>
  );
}
