import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const outputDir = 'docs/edge-store';
const baseURL = 'http://127.0.0.1:4173';
const backgroundPath = `${outputDir}/source-radial-background.png`;

await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

await page.goto(baseURL, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
await page.getByRole('button', { name: /Dark|Тёмная/ }).click();
await page.screenshot({ path: `${outputDir}/screenshot-settings-1280x800.png`, fullPage: false });
await page.getByRole('button', { name: /Close|Закрыть/ }).first().click();
await page.screenshot({ path: `${outputDir}/screenshot-orbit-1280x800.png`, fullPage: false });

await page.getByRole('button', { name: /Settings|Настройки/ }).last().click();
await page.getByRole('button', { name: /Smart tiles|Умная плитка/ }).click();
await page.getByRole('button', { name: /Close|Закрыть/ }).first().click();
await page.screenshot({ path: `${outputDir}/screenshot-smart-tiles-1280x800.png`, fullPage: false });

await browser.close();

const logo = await sharp('public/icons/icon-128.png').resize(128, 128).png().toBuffer();

const makePromo = async ({ width, height, output, title, subtitle, screenshot }) => {
  const image = sharp(backgroundPath).resize(width, height, { fit: 'cover' });
  const screenshotBuffer = screenshot
    ? await sharp(screenshot).resize({ width: Math.round(width * 0.49), height: Math.round(height * 0.82), fit: 'cover', position: 'top' }).png().toBuffer()
    : null;
  const screenshotX = Math.round(width * 0.47);
  const screenshotY = Math.round(height * 0.09);
  const radius = Math.max(12, Math.round(width * 0.018));
  const textSvg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="accent" x1="0" x2="1"><stop stop-color="#70d8ff"/><stop offset="1" stop-color="#b994ff"/></linearGradient></defs>
    <rect width="${width}" height="${height}" fill="#07102c" fill-opacity=".12"/>
    <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.35)}" fill="#f4f7ff" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.07)}" font-weight="700">${title}</text>
    <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.49)}" fill="url(#accent)" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.032)}" font-weight="600">${subtitle}</text>
    <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.78)}" fill="#c6d2f2" fill-opacity=".9" font-family="Segoe UI, Arial, sans-serif" font-size="${Math.round(width * 0.022)}">Private by design · Your links stay in Edge storage</text>
  </svg>`);

  const composites = [{ input: logo, left: Math.round(width * 0.08), top: Math.round(height * 0.11) }, { input: textSvg, left: 0, top: 0 }];
  if (screenshotBuffer) {
    composites.splice(1, 0, { input: screenshotBuffer, left: screenshotX, top: screenshotY });
    composites.push({ input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect x="${screenshotX}" y="${screenshotY}" width="${Math.round(width * 0.49)}" height="${Math.round(height * 0.82)}" rx="${radius}" fill="none" stroke="#b9d8ff" stroke-opacity=".6" stroke-width="2"/></svg>`), left: 0, top: 0 });
  }
  await image.composite(composites).png().toFile(output);
};

await makePromo({
  width: 1400,
  height: 560,
  output: `${outputDir}/large-promotional-tile-1400x560.png`,
  title: 'Radial New Tab',
  subtitle: 'A calmer, more personal start page for Edge',
  screenshot: `${outputDir}/screenshot-orbit-1280x800.png`,
});

await makePromo({
  width: 440,
  height: 280,
  output: `${outputDir}/small-promotional-tile-440x280.png`,
  title: 'Radial',
  subtitle: 'Your calm space',
  screenshot: `${outputDir}/screenshot-orbit-1280x800.png`,
});

console.log(`Store assets written to ${outputDir}`);
