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
  await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
  await page.getByRole('button', { name: /Smart tiles|Умная плитка/ }).click();
  await page.getByRole('button', { name: /Close|Закрыть/ }).first().click();
  await page.locator('article:has(a[title="Microsoft"])').dragTo(page.locator('article:has(a[title="GitHub"])'));
  await expect(page.locator('.shortcut').first()).toHaveAttribute('title', 'GitHub');

  await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder(/Search the web|Поиск в интернете/)).toBeFocused();
});

test('enables collections and imports a selected bookmark folder into a collection', async ({ page }) => {
  await page.addInitScript(() => {
    const projectFolder = { id: 'projects', title: 'Projects', children: [
      { id: 'bookmark-github', title: 'GitHub', url: 'https://github.com' },
      { id: 'bookmark-docs', title: 'Docs', url: 'https://developer.mozilla.org' },
      { id: 'specs', title: 'Specs', children: [{ id: 'bookmark-vite', title: 'Vite', url: 'https://vite.dev' }] },
    ] };
    (window as unknown as { chrome: unknown }).chrome = {
      permissions: { request: async () => true },
      bookmarks: {
        getTree: async () => [{ id: '0', title: 'Bookmarks', children: [projectFolder] }],
        getSubTree: async (id: string) => id === 'projects' ? [projectFolder] : [],
      },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
  await page.getByRole('checkbox', { name: /Use collections|Использовать коллекции/ }).evaluate((input) => (input as HTMLInputElement).click());
  await page.getByRole('button', { name: /Choose bookmark folder|Выбрать папку закладок/ }).click();
  await expect(page.getByRole('heading', { name: /Import bookmarks|Импорт закладок/ })).toBeVisible();
  await page.locator('.bookmark-select select').selectOption('projects');
  await page.getByRole('button', { name: /Import selected folder|Импортировать выбранную папку/ }).click();
  await expect(page.getByRole('button', { name: /^Projects \d+$/ })).toBeVisible();
  await expect(page.locator('.collection-toolbar button').filter({ hasText: 'Projects / Specs' })).toBeVisible();
  await page.getByRole('button', { name: /Close|Закрыть/ }).first().click();
  await expect(page.locator('.collection-toolbar')).toContainText('Projects');
  await expect(page.getByText('GitHub')).toBeVisible();
});

test('creates a collection from settings without losing links when collections are disabled', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
  await page.getByRole('checkbox', { name: /Use collections|Использовать коллекции/ }).evaluate((input) => (input as HTMLInputElement).click());
  await page.getByRole('button', { name: /Add collection|Добавить коллекцию/ }).click();
  await page.getByLabel(/Collection name|Название коллекции/).fill('Work');
  await page.getByRole('button', { name: /Save|Сохранить/ }).last().click();
  await expect(page.locator('.collection-toolbar')).toContainText('Work');
  await page.getByRole('checkbox', { name: /Use collections|Использовать коллекции/ }).evaluate((input) => (input as HTMLInputElement).click());
  await expect(page.locator('.collection-toolbar')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Microsoft' })).toBeVisible();
});

test('does not restore a deleted automatically added shortcut', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { chrome: unknown }).chrome = {
      permissions: { request: async () => true },
      topSites: { get: async () => [{ title: 'Auto site', url: 'https://auto.example.com' }] },
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
  const autoSites = page.getByRole('checkbox', { name: /Add frequently visited sites|Добавлять часто посещаемые сайты/ });
  await autoSites.evaluate((input) => input.click());
  await page.getByRole('button', { name: /Close|Закрыть/ }).first().click();
  await expect(page.locator('a[title="Auto site"]')).toBeVisible();

  await page.locator('article:has(a[title="Auto site"]) .shortcut-menu').click();
  await page.locator('.editor .delete').click();
  await expect(page.locator('a[title="Auto site"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('a[title="Auto site"]')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('radialData') ?? '{}').dismissedAutoSites)).toContain('auto.example.com');
});

test('places automatically added shortcuts on a second orbit', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('radialData', JSON.stringify({
      shortcuts: [
        { id: 'manual', title: 'Manual', url: 'https://manual.example.com', color: '#6EA8FF' },
        { id: 'top-site', title: 'Frequent site', url: 'https://frequent.example.com', color: '#FB7185', source: 'topSites' },
      ],
      dismissedAutoSites: [],
      settings: { layoutMode: 'orbit' },
    }));
  });
  await page.goto('/');
  await expect(page.locator('.shortcut-space')).toHaveClass(/is-orbit/);
  await expect(page.locator('.is-secondary-orbit')).toHaveCount(1);
  await expect(page.locator('.ring-two')).toBeVisible();
  await expect(page.locator('a[title="Frequent site"]')).toBeVisible();
  await expect(page.locator('.orbit-label')).toHaveCount(0);
});
