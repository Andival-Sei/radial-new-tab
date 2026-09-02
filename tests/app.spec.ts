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
  const autoSites = page.getByRole('checkbox', { name: /Add frequently visited sites|Добавлять часто посещаемые сайты/ });
  await expect(autoSites).not.toBeChecked();
  await autoSites.evaluate((input) => input.click());
  await expect(autoSites).toBeChecked();
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

test('uploads and removes a local background image', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
  const input = page.locator('input[type="file"][accept="image/*"]');
  await input.setInputFiles({
    name: 'background.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#18233b"/></svg>'),
  });
  await expect(page.locator('.app')).toHaveClass(/has-background/);
  await expect(page.getByText(/Custom image|Своё изображение/)).toBeVisible();
  await page.getByRole('button', { name: /Remove image|Убрать изображение/ }).click();
  await expect(page.locator('.app')).not.toHaveClass(/has-background/);
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
