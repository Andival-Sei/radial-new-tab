import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const readJson = (relativePath) => JSON.parse(readFileSync(resolve(root, relativePath), 'utf8'));
const packageJson = readJson('package.json');
const manifest = readJson('dist/manifest.json');

const failures = [];
const require = (condition, message) => {
  if (!condition) failures.push(message);
};

require(manifest.manifest_version === 3, 'dist/manifest.json must use Manifest V3');
require(manifest.version === packageJson.version, `package.json (${packageJson.version}) and dist/manifest.json (${manifest.version}) versions differ`);
require(manifest.chrome_url_overrides?.newtab === 'index.html', 'the new tab override must point to index.html');
require(manifest.name === '__MSG_extensionName__', 'manifest name must use the localized message reference');
require(manifest.description === '__MSG_extensionDescription__', 'manifest description must use the localized message reference');

for (const locale of ['en', 'ru']) {
  const messages = readJson(`dist/_locales/${locale}/messages.json`);
  const description = messages.extensionDescription?.message ?? '';
  require(description.length >= 250, `${locale} store description must contain at least 250 characters (found ${description.length})`);
  require(typeof messages.extensionName?.message === 'string', `${locale} locale is missing extensionName`);
}

for (const [size, relativePath] of Object.entries(manifest.icons ?? {})) {
  require(existsSync(resolve(root, 'dist', relativePath)), `missing icon ${size}: ${relativePath}`);
}

require(existsSync(resolve(root, 'dist/index.html')), 'dist/index.html is missing');
require(existsSync(resolve(root, 'PRIVACY.md')), 'PRIVACY.md is missing');

if (failures.length) {
  console.error('Release verification failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release verification passed for Radial New Tab ${manifest.version}.`);
