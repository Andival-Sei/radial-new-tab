import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const origin = 'https://api.addons.microsoftedge.microsoft.com';
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function operationId(location) {
  const value = location?.split('/').filter(Boolean).at(-1);
  if (!value || !guid.test(value)) throw new Error('Microsoft did not return a valid operation ID. Inspect Partner Center before retrying.');
  return value;
}

export async function publishEdge({ apiKey, clientId, productId, packagePath, fetcher = fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), record = async () => {} }) {
  if (!apiKey?.trim() || !guid.test(clientId ?? '') || !guid.test(productId ?? '')) throw new Error('Configure EDGE_API_KEY, EDGE_CLIENT_ID, and EDGE_PRODUCT_ID.');
  const base = `${origin}/v1/products/${productId}`;
  const headers = { Authorization: `ApiKey ${apiKey.trim()}`, 'X-ClientID': clientId };
  const request = async (url, options = {}) => {
    const response = await fetcher(url, { ...options, headers: { ...headers, ...options.headers }, redirect: 'error', signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Edge API returned HTTP ${response.status}. Inspect Partner Center before retrying. No automatic POST retry was performed.`);
    return response;
  };
  const wait = async (url, stage) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await request(url);
      const result = await response.json();
      await record({ stage, operationId: result.id, status: result.status, errorCode: result.errorCode ?? null });
      if (result.status === 'Succeeded') return;
      if (result.status !== 'InProgress') throw new Error(`Edge ${stage} failed (${result.errorCode || result.status || 'unknown'}). Check Partner Center.`);
      await sleep(10_000);
    }
    throw new Error(`Edge ${stage} is still pending. Check the recorded operation before retrying.`);
  };
  const zip = await readFile(packagePath);
  if (zip[0] !== 0x50 || zip[1] !== 0x4b) throw new Error('Package is not a ZIP archive.');
  const upload = await request(`${base}/submissions/draft/package`, { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: zip });
  const uploadId = operationId(upload.headers.get('location'));
  await record({ stage: 'upload', operationId: uploadId, status: 'Accepted' });
  await wait(`${base}/submissions/draft/package/operations/${uploadId}`, 'upload');
  const submission = await request(`${base}/submissions`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' },
    body: 'Radial New Tab: tile-only design, stable saved shortcuts, optional recommendations based on aggregate shortcut opens, keyboard search, and storage recovery. No new permissions, remote code, or external analytics. topSites and bookmarks remain optional.',
  });
  const publishId = operationId(submission.headers.get('location'));
  await record({ stage: 'submission', operationId: publishId, status: 'Accepted' });
  await wait(`${base}/submissions/operations/${publishId}`, 'submission');
  return { uploadId, publishId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const events = [];
  try {
    await publishEdge({
      apiKey: process.env.EDGE_API_KEY,
      clientId: process.env.EDGE_CLIENT_ID,
      productId: process.env.EDGE_PRODUCT_ID,
      packagePath: 'release/radial-new-tab-edge.zip',
      record: async (event) => {
        events.push(event);
        console.log(`${event.stage}: ${event.status}; operation ${event.operationId}`);
        await writeFile('release/edge-publish-status.json', JSON.stringify(events, null, 2));
      },
    });
    const message = 'Update submitted to Microsoft certification. This does not mean it is already available in the store.';
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, message + '\n');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
