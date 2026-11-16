import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEdgeApi, getEdgeOperation } from './edge-api-client.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const id = '5461df96-61e7-440c-9d48-1f967336caa2';
const config = { apiKey: 'test-only-sensitive-key', clientId: id, productId: id };

test('access check uses only GET with the documented authentication and returns safe operation fields', async () => {
  const calls = [];
  const result = await getEdgeOperation({
    ...config,
    operationId: id,
    fetcher: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ id, status: 'Succeeded', message: 'not logged' });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, undefined);
  assert.ok(calls[0].url.endsWith(`/submissions/operations/${id}`));
  assert.equal(calls[0].options.headers.Authorization, `ApiKey ${config.apiKey}`);
  assert.equal(calls[0].options.headers['X-ClientID'], id);
  assert.equal(calls[0].options.redirect, 'error');
  assert.deepEqual(result, {
    authenticated: true,
    stage: 'submission',
    operationId: id,
    status: 'Succeeded',
    errorCode: null,
  });
  assert.ok(!JSON.stringify(result).includes(config.apiKey));
});

test('401 records a useful diagnostic, does not leak the response body and never retries a POST', async () => {
  const events = [];
  let requests = 0;
  const request = createEdgeApi({
    ...config,
    record: async (event) => events.push(event),
    fetcher: async () => {
      requests += 1;
      return new Response(config.apiKey, { status: 401 });
    },
  });
  await assert.rejects(
    request('/submissions/draft/package', { stage: 'upload', method: 'POST' }),
    (error) => {
      assert.equal(error.code, 'AUTHENTICATION');
      assert.equal(error.httpStatus, 401);
      assert.match(error.message, /expiry/);
      assert.ok(!error.message.includes(config.apiKey));
      return true;
    },
  );
  assert.equal(requests, 1);
  assert.equal(events[0].httpStatus, 401);
  assert.ok(!JSON.stringify(events).includes(config.apiKey));
});

test('network failures cannot expose credentials through error messages', async () => {
  const request = createEdgeApi({
    ...config,
    fetcher: async () => {
      throw new Error(config.apiKey);
    },
  });
  await assert.rejects(
    request('/submissions', { stage: 'submission', method: 'POST' }),
    (error) => {
      assert.equal(error.code, 'NETWORK');
      assert.ok(!error.message.includes(config.apiKey));
      return true;
    },
  );
});

test('invalid operation IDs and stages fail before contacting Microsoft', async () => {
  let requests = 0;
  const fetcher = async () => {
    requests += 1;
    throw new Error('must not run');
  };
  await assert.rejects(
    getEdgeOperation({ ...config, operationId: '../other', fetcher }),
    /valid operation/,
  );
  await assert.rejects(
    getEdgeOperation({ ...config, operationId: id, stage: 'publish', fetcher }),
    /valid operation/,
  );
  assert.equal(requests, 0);
});

test('an operation failure still verifies access, and upload status uses the upload endpoint', async () => {
  const result = await getEdgeOperation({
    ...config,
    stage: 'upload',
    operationId: id,
    fetcher: async (url) => {
      assert.ok(url.endsWith(`/submissions/draft/package/operations/${id}`));
      return Response.json({ id, status: 'Failed', errorCode: 'InvalidPackage' });
    },
  });
  assert.equal(result.authenticated, true);
  assert.equal(result.status, 'Failed');
});

test('the CLI writes an artifact even when credentials are missing, without exposing a supplied key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'radial-api-check-'));
  try {
    const child = spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./check-edge-api.mjs', import.meta.url))],
      {
        cwd: directory,
        encoding: 'utf8',
        env: {
          ...process.env,
          EDGE_API_KEY: config.apiKey,
          EDGE_CLIENT_ID: '',
          EDGE_PRODUCT_ID: '',
          EDGE_OPERATION_ID: id,
          EDGE_API_KEY_EXPIRES_AT: '',
        },
      },
    );
    assert.equal(child.status, 1);
    const artifact = await readFile(join(directory, 'release/edge-api-check.json'), 'utf8');
    assert.equal(JSON.parse(artifact).at(-1).errorCode, 'CONFIGURATION');
    assert.ok(!`${child.stdout}${child.stderr}${artifact}`.includes(config.apiKey));
  } finally {
    await rm(directory, { recursive: true });
  }
});
