export interface TileLayout {
  columns: number;
  height: number;
  gap: number;
  density: 'regular' | 'compact' | 'dense';
}

/** Fit useful rows, but keep names readable when the library needs to scroll. */
export function calculateTileLayout(
  count: number,
  width: number,
  height: number,
  extraHeight = 0,
): TileLayout {
  const mobile = width <= 620;
  const workspaceWidth = Math.min(1024, width - (mobile ? 32 : width <= 900 ? 48 : 72));
  const gap = mobile ? 10 : 12;
  const maxColumns = Math.max(
    2,
    Math.min(8, Math.floor((workspaceWidth + gap) / (mobile ? 100 : 120))),
  );
  const availableHeight = Math.max(100, height - (mobile ? 380 : 410) - extraHeight);
  const rows = Math.max(1, Math.floor((availableHeight + gap) / (88 + gap)));
  const columns = Math.min(
    maxColumns,
    Math.max(Math.min(mobile ? 3 : 6, maxColumns), Math.ceil(count / rows)),
  );
  const actualRows = Math.max(1, Math.ceil(count / columns));
  const tileHeight = Math.max(
    88,
    Math.min(136, Math.floor((availableHeight - (actualRows - 1) * gap) / actualRows)),
  );
  return {
    columns,
    height: tileHeight,
    gap,
    density: tileHeight >= 120 ? 'regular' : tileHeight >= 96 ? 'compact' : 'dense',
  };
}
