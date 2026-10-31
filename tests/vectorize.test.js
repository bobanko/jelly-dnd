import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { main, parseArgs, request } from '../scripts/vectorize.js';

function withKeys(t) {
  const previous = [process.env.VECTORIZER_API_ID, process.env.VECTORIZER_API_SECRET];
  process.env.VECTORIZER_API_ID = 'test-id';
  process.env.VECTORIZER_API_SECRET = 'test-secret';
  t.after(() => {
    ['VECTORIZER_API_ID', 'VECTORIZER_API_SECRET'].forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key];
      else process.env[key] = previous[i];
    });
  });
}

async function tempImage(t) {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'vectorize-'));
  t.after(() => rm(folder, { recursive: true, force: true }));
  const image = path.join(folder, 'logo.png');
  await writeFile(image, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return { folder, image };
}

test('requests use basic auth on the fixed host without redirects', async (t) => {
  const response = new Response('{}');
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.vectorizer.ai/api/v1/account');
    assert.equal(options.headers.Authorization, 'Basic abc');
    assert.equal(options.redirect, 'error');
    return response;
  });
  assert.equal(await request('/account', 'abc'), response);
});

test('errors report the API message but never credentials', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('{"error":{"status":400,"code":1006,"message":"Bad max_colors"}}', {
        status: 400,
      }),
  );
  await assert.rejects(request('/vectorize', 'secret-auth'), (error) => {
    assert.match(error.message, /HTTP 400\. Bad max_colors/);
    assert.ok(!error.message.includes('secret-auth'));
    return true;
  });
});

test('argument parsing rejects typos and malformed values', () => {
  const options = parseArgs(['a.png', '--preset', 'icon', '--set', 'processing.palette=#fff;']);
  assert.equal(options.input, 'a.png');
  assert.equal(options.set['processing.palette'], '#fff;');
  assert.throws(() => parseArgs(['a.png', '--typo']), /Unknown option/);
  assert.throws(() => parseArgs(['a.png', '--set', 'novalue']), /key=value/);
  assert.throws(() => parseArgs(['a.png', '--out']), /needs a value/);
});

test('dry run merges preset and overrides and defaults to free test mode', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw Error('Dry run must not call the API');
  });
  const log = t.mock.method(console, 'log', () => {});
  const { image } = await tempImage(t);
  await main([image, '--preset', 'icon', '--set', 'processing.max_colors=3', '--dry-run']);
  const { params, output } = JSON.parse(log.mock.calls[0].arguments[0]);
  assert.equal(params.mode, 'test');
  assert.equal(params['processing.max_colors'], '3');
  assert.equal(params['output.group_by'], 'color');
  assert.match(output, /artifacts[\\/]vectorize[\\/]logo\.test\.svg$/);
  await assert.rejects(main([image, '--preset', 'nope', '--dry-run']), /Unknown preset/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('test run uploads the image and saves the SVG', async (t) => {
  withKeys(t);
  t.mock.method(console, 'log', () => {});
  const { folder, image } = await tempImage(t);
  const out = path.join(folder, 'out.svg');
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.vectorizer.ai/api/v1/vectorize');
    assert.equal(options.body.get('mode'), 'test');
    assert.equal(options.body.get('image').type, 'image/png');
    return new Response('<svg/>', { headers: { 'X-Credits-Charged': '0' } });
  });
  await main([image, '--out', out]);
  assert.equal(await readFile(out, 'utf8'), '<svg/>');
});

test('production refuses to overwrite before spending credits', async (t) => {
  withKeys(t);
  const { folder, image } = await tempImage(t);
  const out = path.join(folder, 'existing.svg');
  await writeFile(out, 'keep');
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw Error('Must not call the API');
  });
  await assert.rejects(main([image, '--production', '--out', out]), /Output exists/);
  assert.equal(await readFile(out, 'utf8'), 'keep');
  assert.equal(fetch.mock.callCount(), 0);
});
