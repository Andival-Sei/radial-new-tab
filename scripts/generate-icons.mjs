import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const sizes = [16, 32, 48, 128];
await mkdir('public/icons', { recursive: true });

for (const size of sizes) {
  const svg = `<svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g" x1="16" y1="14" x2="112" y2="114"><stop stop-color="#73B7FF"/><stop offset="1" stop-color="#7C6EFF"/></linearGradient></defs>
    <rect width="128" height="128" rx="31" fill="#0B1020"/>
    <circle cx="64" cy="64" r="39" fill="none" stroke="#27385B" stroke-width="4"/>
    <circle cx="64" cy="64" r="13" fill="url(#g)"/>
    <circle cx="89" cy="35" r="9" fill="#67E8F9"/>
    <circle cx="31" cy="71" r="7" fill="#A78BFA"/>
    <circle cx="86" cy="92" r="8" fill="#FB7185"/>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(`public/icons/icon-${size}.png`);
}
