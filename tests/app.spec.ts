import { expect, test } from '@playwright/test';

test('loads and opens settings', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Radial New Tab');
  await expect(page.locator('.clock')).toBeVisible();
  await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
  await expect(page.locator('.settings-panel')).toBeVisible();
  await expect(page.getByText('Appearance')).toBeVisible();
});

test('adds a shortcut', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Add shortcut|Добавить ссылку/ }).first().click();
  await page.getByLabel(/Name|Название/).fill('Example');
  await page.getByLabel(/Web address|Веб-адрес/).fill('example.com');
  await page.getByRole('button', { name: /Save|Сохранить/ }).click();
  await expect(page.getByText('Example')).toBeVisible();
});

test('uses the browser provider by default, supports Yandex, and has no central add button', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.orbit-add')).toHaveCount(0);
  await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
  const engine = page.locator('#engine');
  await expect(engine).toHaveValue('browser');
  await engine.selectOption('yandex');
  await expect(engine).toHaveValue('yandex');
  await expect(engine.locator('option[value="browser"]')).toHaveText(/Browser default|По умолчанию в браузере/);
});

test('switches to smart tiles and hides initials after a favicon loads', async ({ page }) => {
  await page.goto('/');
  const firstMark = page.locator('.shortcut-mark').first();
  await firstMark.locator('img').evaluate((image) => image.dispatchEvent(new Event('load')));
  await expect(firstMark.locator('b')).toHaveCount(0);

  await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
  await page.getByRole('button', { name: /Smart tiles|Умная плитка/ }).click();
  await expect(page.locator('.shortcut-space')).toHaveClass(/is-tiles/);
  await expect(page.locator('.shortcut-space .orbit-ring').first()).toBeHidden();
  await expect(page.locator('.shortcut-space .orbit-ring').last()).toBeHidden();
  await expect(page.locator('.tile-rank-0')).toBeVisible();
});

test('reorders shortcuts and focuses search with Ctrl+K', async ({ page }) => {
  await page.goto('/');
  await page.locator('article:has(a[title="Microsoft"])').dragTo(page.locator('article:has(a[title="GitHub"])'));
  await expect(page.locator('.shortcut').first()).toHaveAttribute('title', 'GitHub');

  await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder(/Search the web|Поиск в интернете/)).toBeFocused();
});
