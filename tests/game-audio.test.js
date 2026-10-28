import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio, SpikeSounds } from '../game-audio.js';

test('spike audio follows motion phases once and resets silently', () => {
  let stage = 'raised';
  const world = { spikes: [{}], spikeState: () => ({ stage }) };
  const sounds = new SpikeSounds();
  assert.deepEqual(sounds.update(world), []);
  stage = 'retracting';
  assert.equal(sounds.update(world)[0].name, 'retract');
  assert.deepEqual(sounds.update(world), []);
  stage = 'hidden';
  assert.deepEqual(sounds.update(world), []);
  stage = 'peeking';
  assert.deepEqual(sounds.update(world), []);
  stage = 'rising';
  assert.equal(sounds.update(world)[0].name, 'rise');
  stage = 'raised';
  assert.deepEqual(sounds.update(world), []);
  stage = 'hidden';
  sounds.reset(world);
  assert.deepEqual(sounds.update(world), []);
  stage = 'raised';
  assert.equal(sounds.update(world)[0].name, 'rise');
  stage = 'hidden';
  assert.equal(sounds.update(world)[0].name, 'retract');
});

test('samples preload once, deduplicate simultaneous traps, and stop on mute or pause', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  }));
  const started = [];
  const context = {
    currentTime: 1,
    destination: {},
    resume: async () => {},
    decodeAudioData: async () => ({}),
    createBufferSource() {
      return {
        connect(gain) {
          return gain;
        },
        disconnect() {},
        start() {
          started.push(this);
        },
        stop() {
          this.stopped = true;
        },
      };
    },
    createGain: () => ({ gain: {}, connect() {}, disconnect() {} }),
  };
  const audio = new GameAudio(() => context);
  audio.setActive(true);
  assert.equal(audio.play('portal'), null);
  audio.setEnabled(true);
  // Events during loading are discarded, never played later.
  assert.equal(audio.play('portal'), null);
  await audio.loading;
  assert.equal(started.length, 1);
  assert.equal(started[0].loop, true);
  audio.play('rise');
  audio.play('rise');
  assert.equal(started.length, 2);
  audio.setEnabled(false);
  assert.ok(started.every((source) => source.stopped));
  assert.equal(audio.play('land'), null);
  audio.setEnabled(true);
  await audio.loading;
  assert.equal(fetch.mock.callCount(), 5);
  audio.setActive(false);
  assert.ok(started.every((source) => source.stopped));
  assert.equal(audio.play('portal'), null);
});

test('missing audio files do not prevent gameplay or cause deferred playback', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false }));
  const warn = t.mock.method(console, 'warn', () => {});
  const audio = new GameAudio(() => ({ resume: async () => {} }));
  audio.setActive(true);
  audio.setEnabled(true);
  await audio.loading;
  assert.equal(audio.play('land'), null);
  assert.equal(warn.mock.callCount(), 5);
});
