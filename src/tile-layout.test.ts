import { expect, it } from 'vitest';
import { calculateTileLayout } from './tile-layout';

it('keeps a large mobile library readable instead of shrinking every tile', () => {
  const layout = calculateTileLayout(100, 360, 640);
  expect(layout.columns).toBe(3);
  expect(layout.height).toBeGreaterThanOrEqual(88);
  expect((328 - (layout.columns - 1) * layout.gap) / layout.columns).toBeGreaterThan(90);
});

it('fits 24 readable desktop tiles in the available height', () => {
  const layout = calculateTileLayout(24, 1280, 720);
  const rows = Math.ceil(24 / layout.columns);
  expect(rows * layout.height + (rows - 1) * layout.gap).toBeLessThanOrEqual(310);
  expect(layout.height).toBeGreaterThanOrEqual(88);
});
