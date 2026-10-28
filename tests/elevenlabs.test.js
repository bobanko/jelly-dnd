import assert from 'node:assert/strict';
import test from 'node:test';
import { main, request } from '../scripts/elevenlabs.js';

test('authentication uses the fixed ElevenLabs host and disables redirects', async (t) => {
  const response = new Response('{}', { headers: { 'Content-Type': 'application/json' } });
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.elevenlabs.io/v1/user');
    assert.equal(options.headers['xi-api-key'], 'test-key');
    assert.equal(options.redirect, 'error');
    return response;
  });
  assert.equal(await request('/user', 'test-key'), response);
  assert.equal(fetch.mock.callCount(), 1);
});

test('API failures do not expose response bodies or automatically retry', async (t) => {
  const fetch = t.mock.method(
    globalThis,
    'fetch',
    async () => new Response('sensitive-account-details', { status: 401 }),
  );
  await assert.rejects(request('/user', 'test-key'), (error) => {
    assert.match(error.message, /HTTP 401/);
    assert.ok(!error.message.includes('sensitive-account-details'));
    assert.ok(!error.message.includes('test-key'));
    return true;
  });
  assert.equal(fetch.mock.callCount(), 1);
});

test('preset preview validates input without making any API request', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw Error('Preview must not call the API');
  });
  const log = t.mock.method(console, 'log', () => {});
  await main(['dungeon-wind', '--dry-run']);
  const body = JSON.parse(log.mock.calls[0].arguments[0]);
  assert.equal(body.loop, true);
  assert.equal(body.duration_seconds, 20);
  assert.equal(body.model_id, 'eleven_text_to_sound_v2');
  await assert.rejects(main(['unknown', '--dry-run']), /Unknown preset/);
  await assert.rejects(main(['jelly-land', '--typo']), /Unknown or duplicate/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('connection check authenticates without generating or logging account data', async (t) => {
  const previous = process.env.ELEVENLABS_API_KEY;
  process.env.ELEVENLABS_API_KEY = 'test-key';
  t.after(() => {
    if (previous === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = previous;
  });
  const fetch = t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, 'https://api.elevenlabs.io/v1/user');
    return new Response('{"user_id":"private-account"}');
  });
  const log = t.mock.method(console, 'log', () => {});
  await main(['--check']);
  assert.equal(fetch.mock.callCount(), 1);
  assert.match(log.mock.calls[0].arguments[0], /Authentication successful/);
  assert.ok(!log.mock.calls[0].arguments[0].includes('private-account'));
});
