import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { operationId, publishEdge } from './publish-edge.mjs';

const id = '5461df96-61e7-440c-9d48-1f967336caa2';
test('operation ID accepts the documented header and rejects untrusted values', () => {
  assert.equal(operationId(id), id);
  assert.equal(operationId('/operations/' + id), id);
  assert.throws(() => operationId(null));
  assert.throws(() => operationId('https://other.example/steal'));
});

test('publishes only after successful upload and records both operations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'radial-publish-test-'));
  try {
    const packagePath = join(directory, 'package.zip');
    await writeFile(packagePath, Buffer.from([0x50, 0x4b, 3, 4]));
    const calls = [], events = [];
    await publishEdge({
      apiKey: 'test-only', clientId: id, productId: id, packagePath,
      fetcher: async (url, options) => {
        calls.push({ url, method: options.method ?? 'GET' });
        if (options.method === 'POST') return new Response(null, { status: 202, headers: { location: id } });
        return Response.json({ id, status: 'Succeeded' });
      },
      record: async (event) => events.push(event),
    });
    assert.deepEqual(calls.map((call) => call.method), ['POST', 'GET', 'POST', 'GET']);
    assert.ok(calls[2].url.endsWith('/submissions'));
    assert.equal(events.at(-1).stage, 'submission');
    let requests = 0;
    await assert.rejects(publishEdge({
      apiKey: 'test-only', clientId: id, productId: id, packagePath,
      fetcher: async () => {
        requests += 1;
        if (requests === 1) return new Response(null, { status: 202, headers: { location: id } });
        return Response.json({ id, status: 'Failed', errorCode: 'InvalidPackage' });
      },
    }), /InvalidPackage/);
    assert.equal(requests, 2);
  } finally { await rm(directory, { recursive: true }); }
});
