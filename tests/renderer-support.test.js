import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestAdapter } from '../src/renderer/support.js';

test('local HTTP is diagnosed before missing WebGPU or adapter access', async () => {
  for (const gpu of [undefined, { requestAdapter: () => assert.fail('insecure GPU access') }])
    await assert.rejects(
      requestAdapter({ isSecureContext: false, navigator: { gpu } }),
      (error) => {
        assert.match(error.message, /HTTPS/);
        assert.match(error.message, /локальной сети/);
        assert.doesNotMatch(error.message, /аппаратное ускорение/);
        return true;
      },
    );
});

test('iPhone and desktop-mode iPad get system requirements for missing API and adapter', async () => {
  for (const identity of [
    { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)' },
    { userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_7 like Mac OS X)' },
    {
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    },
  ])
    for (const gpu of [undefined, { requestAdapter: async () => null }])
      await assert.rejects(
        requestAdapter({ isSecureContext: true, navigator: { ...identity, gpu } }),
        (error) => {
          assert.match(error.message, /iOS\/iPadOS 26/);
          assert.match(error.message, /Safari по HTTPS/);
          assert.doesNotMatch(error.message, /аппаратное ускорение/);
          return true;
        },
      );
});

test('desktop missing API and adapter retain browser and acceleration guidance', async () => {
  for (const gpu of [undefined, { requestAdapter: async () => null }])
    await assert.rejects(
      requestAdapter({ isSecureContext: true, navigator: { userAgent: 'desktop', gpu } }),
      /аппаратное ускорение/,
    );
});

test('secure pages request the default adapter without extra feature requirements', async () => {
  const adapter = {};
  const gpu = {
    async requestAdapter(...args) {
      assert.equal(this, gpu);
      assert.deepEqual(args, []);
      return adapter;
    },
  };
  assert.equal(await requestAdapter({ isSecureContext: true, navigator: { gpu } }), adapter);
});
