import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { createEdgeApi, EdgeApiError, guid } from './edge-api-client.mjs';

export function operationId(location) {
  const value = location?.split('/').filter(Boolean).at(-1);
  if (!value || !guid.test(value))
    throw new EdgeApiError(
      'Microsoft did not return a valid operation ID. Inspect Partner Center before retrying.',
      'INVALID_OPERATION',
    );
  return value;
}

export async function publishEdge({
  apiKey,
  clientId,
  productId,
  packagePath,
  notes = 'Radial New Tab updates the new-tab page. No test account is required. No new permissions or external analytics.',
  fetcher = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  record = async () => {},
}) {
  if (typeof notes !== 'string' || !notes.trim() || notes.length > 2000)
    throw new EdgeApiError('Certification notes must contain 1–2000 characters.', 'CONFIGURATION');
  const request = createEdgeApi({ apiKey, clientId, productId, fetcher, record });
  const wait = async (url, stage, id) => {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const response = await request(url, { stage, operationId: id });
      const result = await response.json();
      if (
        typeof result.id !== 'string' ||
        result.id.toLowerCase() !== id.toLowerCase() ||
        !['InProgress', 'Succeeded', 'Failed'].includes(result.status)
      ) {
        throw new EdgeApiError(
          'Edge API returned an unexpected operation response. Inspect Partner Center before retrying.',
          'INVALID_RESPONSE',
        );
      }
      await record({
        stage,
        operationId: result.id,
        status: result.status,
        errorCode: result.errorCode ?? null,
      });
      if (result.status === 'Succeeded') return;
      if (result.status !== 'InProgress')
        throw new EdgeApiError(
          `Edge ${stage} failed (${String(result.errorCode || result.status || 'unknown')
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .slice(0, 80)}). Check Partner Center.`,
          'OPERATION_FAILED',
        );
      await sleep(10_000);
    }
    throw new EdgeApiError(
      `Edge ${stage} is still pending. Check the recorded operation before retrying.`,
      'OPERATION_PENDING',
    );
  };
  const zip = await readFile(packagePath);
  if (zip[0] !== 0x50 || zip[1] !== 0x4b)
    throw new EdgeApiError('Package is not a ZIP archive.', 'INVALID_PACKAGE');
  const upload = await request('/submissions/draft/package', {
    stage: 'upload',
    method: 'POST',
    headers: { 'Content-Type': 'application/zip' },
    body: zip,
  });
  const uploadId = operationId(upload.headers.get('location'));
  await record({ stage: 'upload', operationId: uploadId, status: 'Accepted' });
  await wait(`/submissions/draft/package/operations/${uploadId}`, 'upload', uploadId);
  const submission = await request('/submissions', {
    stage: 'submission',
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: notes,
  });
  const publishId = operationId(submission.headers.get('location'));
  await record({ stage: 'submission', operationId: publishId, status: 'Accepted' });
  await wait(`/submissions/operations/${publishId}`, 'submission', publishId);
  return { uploadId, publishId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const events = [];
  await mkdir('release', { recursive: true });
  const record = async (event) => {
    events.push({ ...event, at: new Date().toISOString() });
    await writeFile('release/edge-publish-status.json', JSON.stringify(events, null, 2));
    console.log(
      `${event.stage ?? 'publication'}: ${event.status}; operation ${event.operationId ?? 'none'}${event.httpStatus ? `; HTTP ${event.httpStatus}` : ''}`,
    );
  };
  try {
    const { version } = JSON.parse(await readFile('package.json', 'utf8'));
    const notes = (await readFile('docs/edge-store/certification-notes.txt', 'utf8')).replaceAll(
      '{{version}}',
      version,
    );
    await record({ stage: 'publication', status: 'Started', version });
    await publishEdge({
      apiKey: process.env.EDGE_API_KEY,
      clientId: process.env.EDGE_CLIENT_ID,
      productId: process.env.EDGE_PRODUCT_ID,
      packagePath: 'release/radial-new-tab-edge.zip',
      notes,
      record,
    });
    const message =
      'Update submitted to Microsoft certification. This does not mean it is already available in the store.';
    console.log(message);
    if (process.env.GITHUB_STEP_SUMMARY)
      await appendFile(process.env.GITHUB_STEP_SUMMARY, message + '\n');
  } catch (error) {
    const known = error instanceof EdgeApiError;
    await record({
      stage: 'publication',
      status: 'Failed',
      errorCode: known ? error.code : 'INTERNAL',
      httpStatus: known ? error.httpStatus : null,
    });
    console.error(
      known
        ? error.message
        : 'Edge publication failed. Inspect Partner Center and the diagnostic artifact before retrying.',
    );
    process.exitCode = 1;
  }
}
