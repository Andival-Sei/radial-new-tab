import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { getEdgeOperation, EdgeApiError } from './edge-api-client.mjs';

await mkdir('release', { recursive: true });
const events = [];
const record = async (event) => {
  events.push({ ...event, at: new Date().toISOString() });
  await writeFile('release/edge-api-check.json', JSON.stringify(events, null, 2));
};
try {
  const expiry = process.env.EDGE_API_KEY_EXPIRES_AT;
  if (expiry) {
    const days = Math.floor((Date.parse(`${expiry}T00:00:00Z`) - Date.now()) / 86_400_000);
    if (!Number.isFinite(days))
      throw new EdgeApiError('EDGE_API_KEY_EXPIRES_AT must be YYYY-MM-DD.', 'CONFIGURATION');
    if (days < 0)
      throw new EdgeApiError(
        'The configured Publish API key has expired. Renew it in Partner Center and update GitHub Secrets.',
        'KEY_EXPIRED',
      );
    if (days <= 14) console.log(`::warning::Publish API key expires in ${days} days (${expiry}).`);
  }
  const result = await getEdgeOperation({
    apiKey: process.env.EDGE_API_KEY,
    clientId: process.env.EDGE_CLIENT_ID,
    productId: process.env.EDGE_PRODUCT_ID,
    operationId: process.env.EDGE_OPERATION_ID || process.env.EDGE_PROBE_OPERATION_ID,
    stage: process.env.EDGE_OPERATION_STAGE || 'submission',
    record,
  });
  await record({ ...result, check: 'Succeeded' });
  const message = `Edge API access verified with a read-only GET. Operation ${result.operationId}: ${result.status}. No package upload or new submission was made.`;
  console.log(message);
  if (process.env.GITHUB_STEP_SUMMARY)
    await appendFile(process.env.GITHUB_STEP_SUMMARY, message + '\n');
} catch (error) {
  // Unexpected errors may contain request details. Persist only controlled diagnostics.
  const known = error instanceof EdgeApiError;
  await record({
    check: 'Failed',
    errorCode: known ? error.code : 'INTERNAL',
    httpStatus: known ? error.httpStatus : null,
  });
  console.error(known ? error.message : 'Edge API check failed. See the diagnostic artifact.');
  process.exitCode = 1;
}
