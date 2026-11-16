import { chromium, expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test('runs the packaged new-tab override with real extension storage and CSP', async () => {
  const extension = resolve('dist');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const page = await context.newPage();
    await page.goto('chrome://newtab');
    await expect(page.locator('.clock')).toBeVisible();
    const result = await page.evaluate(async () => ({
      protocol: location.protocol,
      version: chrome.runtime.getManifest().version,
      storage: Boolean(chrome.storage?.sync),
    }));
    expect(result.protocol).toBe('chrome-extension:');
    expect(result.storage).toBe(true);
    await page.getByRole('button', { name: /Settings|Настройки/, exact: true }).click();
    await page.getByRole('button', { name: /Dark|Тёмная/, exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(
          async () => (await chrome.storage.local.get('radialData')).radialData?.settings?.theme,
        ),
      )
      .toBe('dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  } finally {
    await context.close();
  }
});
