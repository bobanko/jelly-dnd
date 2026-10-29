import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameAudio, MechanismSounds, SpikeSounds } from '../game-audio.js';

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

test('mechanism audio follows physical button transitions and bridge extension once', () => {
  const plate = { x: 1, y: 0, z: 1 },
    bridge = { x: 4, z: 4 },
    body = { x: 0, y: 0, z: 0, state: 'alive' },
    world = {
      plates: [plate],
      bridges: [bridge],
      held: new Set(),
      heightAt: () => 0,
    },
    sounds = new MechanismSounds();
  sounds.reset(world, [body]);
  body.x = body.z = 1;
  assert.equal(sounds.update(world, [body])[0].name, 'buttonPress');
  assert.deepEqual(sounds.update(world, [body]), []);
  world.held.add(0);
  assert.equal(sounds.update(world, [body])[0].name, 'bridge');
  assert.deepEqual(sounds.update(world, [body]), []);
  body.x = body.z = 0;
  world.held.clear();
  assert.deepEqual(
    sounds.update(world, [body]).map((event) => event.name),
    ['buttonRelease', 'bridgeRetract'],
  );
  sounds.reset(world, [body]);
  assert.deepEqual(sounds.update(world, [body]), []);
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
        start(when) {
          this.when = when;
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
  context.state = 'suspended';
  assert.equal(audio.play('death'), null);
  assert.equal(started.length, 1);
  context.state = 'running';
  audio.play('rise');
  audio.play('rise');
  assert.equal(started.length, 2);
  audio.play('bridge', 1, 0.14);
  assert.equal(started.length, 3);
  assert.ok(Math.abs(started[2].when - 1.14) < 1e-9);
  audio.setEnabled(false);
  assert.ok(started.every((source) => source.stopped));
  assert.equal(audio.play('land'), null);
  audio.setEnabled(true);
  await audio.loading;
  assert.equal(fetch.mock.callCount(), 12);
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
  assert.equal(warn.mock.callCount(), 12);
});

test('rune ambience fades toward charge and stops with the game audio', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4),
  }));
  const sources = [],
    targets = [],
    context = {
      currentTime: 2,
      state: 'running',
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
            sources.push(this);
          },
          stop() {
            this.stopped = true;
          },
        };
      },
      createGain: () => ({
        gain: {
          value: 0,
          cancelScheduledValues() {},
          setTargetAtTime(value, time, constant) {
            targets.push({ value, time, constant });
            this.value = value;
          },
        },
        connect() {},
        disconnect() {},
      }),
    };
  const audio = new GameAudio(() => context);
  audio.setActive(true);
  audio.setEnabled(true);
  await audio.loading;
  assert.equal(sources.length, 1);
  audio.setRuneLevel(0.75);
  assert.equal(sources.length, 2);
  assert.ok(Math.abs(targets.at(-1).value - 0.48) < 1e-9);
  assert.equal(targets.at(-1).constant, 0.18);
  const targetCount = targets.length;
  audio.setRuneLevel(0.75);
  assert.equal(targets.length, targetCount);
  audio.setRuneLevel(0);
  assert.equal(targets.at(-1).value, 0);
  assert.equal(targets.at(-1).constant, 0.32);
  audio.setActive(false);
  assert.ok(sources.every((source) => source.stopped));
});
