import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GameAudio,
  JellyCollisionSounds,
  MechanismSounds,
  SpikeSounds,
} from '../src/game/game-audio.js';
import { World } from '../src/world/physics.js';

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

test('same-colour plate group stays silent when pressure moves to an already depressed duplicate', () => {
  const first = { x: 1, y: 0, z: 1, id: 'first', color: 'red' },
    second = { x: 3, y: 0, z: 1, id: 'second', color: 'red' },
    body = { x: 0, y: 0, z: 0, state: 'alive' },
    world = {
      plates: [first, second],
      bridges: [],
      lifts: [],
      held: new Set(),
      heightAt: () => 0,
    },
    sounds = new MechanismSounds();
  sounds.reset(world, [body]);
  Object.assign(body, { x: 1, z: 1 });
  assert.deepEqual(sounds.update(world, [body]), [{ name: 'buttonPress', object: first }]);
  Object.assign(body, { x: 3, z: 1 });
  assert.deepEqual(sounds.update(world, [body]), []);
  Object.assign(body, { x: 0, z: 0 });
  assert.deepEqual(sounds.update(world, [body]), [{ name: 'buttonRelease', object: second }]);
  sounds.reset(world, [body]);
  assert.deepEqual(sounds.update(world, [body]), []);
});

test('lift audio follows each new movement direction once', () => {
  const lift = { x: 2, z: 3, height: 0 },
    world = { plates: [], bridges: [], lifts: [lift], held: new Set() },
    sounds = new MechanismSounds();
  sounds.reset(world, []);
  lift.height = 0.1;
  assert.equal(sounds.update(world, [])[0].name, 'liftUp');
  lift.height = 0.2;
  assert.deepEqual(sounds.update(world, []), []);
  assert.deepEqual(sounds.update(world, []), []);
  lift.height = 0.1;
  assert.equal(sounds.update(world, [])[0].name, 'liftDown');
  lift.height = 0;
  assert.deepEqual(sounds.update(world, []), []);
  sounds.reset(world, []);
  assert.deepEqual(sounds.update(world, []), []);
});

test('jelly collision audio plays once when a new contact begins', () => {
  const players = [
      { x: 0, y: 0, z: 0, state: 'alive' },
      { x: 1, y: 0, z: 0, state: 'alive' },
    ],
    sounds = new JellyCollisionSounds();
  sounds.reset(players);
  players[1].x = 0.8;
  assert.equal(sounds.update(players)[0].name, 'jellyWobble');
  assert.deepEqual(sounds.update(players), []);
  players[1].x = 1;
  assert.deepEqual(sounds.update(players), []);
  players[1].x = 0.78;
  assert.equal(sounds.update(players)[0].name, 'jellyWobble');
  players[1].state = 'dead';
  assert.deepEqual(sounds.update(players), []);
});

test('button spikes play sound once at each animation start, including reversals and undo', () => {
  const world = new World(new Set(['2,2']), [], [{ id: 'trigger', x: 2, z: 2 }]),
    spike = { x: 3, z: 2, plate: 'trigger' },
    body = { x: 2, z: 2, y: 0, kind: 'crate' },
    sounds = new SpikeSounds();
  world.spikes.push(spike);
  sounds.reset(world);
  world.beforeFeatures([body], null, 0.05);
  assert.deepEqual(sounds.update(world), [{ name: 'rise', spike }]);
  world.beforeFeatures([body], null, 0.05);
  assert.deepEqual(sounds.update(world), []);
  const saved = world.featureSnapshot();
  body.x = 3;
  world.beforeFeatures([body], null, 0.025);
  assert.deepEqual(sounds.update(world), [{ name: 'retract', spike }]);
  body.x = 2;
  world.beforeFeatures([body], null, 0.025);
  assert.deepEqual(sounds.update(world), [{ name: 'rise', spike }]);
  world.beforeFeatures([body], null, 0.3);
  assert.deepEqual(sounds.update(world), []);
  body.x = 3;
  world.beforeFeatures([body], null, 0.05);
  assert.deepEqual(sounds.update(world), [{ name: 'retract', spike }]);
  world.beforeFeatures([body], null, 0.3);
  assert.deepEqual(sounds.update(world), []);
  world.restoreFeatures(saved);
  sounds.reset(world);
  assert.deepEqual(sounds.update(world), []);
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
  assert.equal(fetch.mock.callCount(), 24);
  audio.setActive(false);
  assert.ok(started.every((source) => source.stopped));
  assert.equal(audio.play('portal'), null);
  const ui = audio.playUI('uiMove');
  assert.ok(ui);
  audio.setActive(false);
  assert.equal(ui.stopped, undefined, 'menu sounds survive the gameplay pause');
  audio.setEnabled(false);
  assert.equal(ui.stopped, true);
});

test('missing audio files do not prevent gameplay or cause deferred playback', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: false }));
  const warn = t.mock.method(console, 'warn', () => {});
  const audio = new GameAudio(() => ({ resume: async () => {} }));
  audio.setActive(true);
  audio.setEnabled(true);
  await audio.loading;
  assert.equal(audio.play('land'), null);
  assert.equal(warn.mock.callCount(), 24);
});

test('quiet movement loops fade with their level and stop with gameplay', async (t) => {
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
  audio.setLoopLevel('crateSlide', 0.5);
  assert.equal(sources.at(-1).loop, true);
  assert.ok(Math.abs(targets.at(-1).value - 0.08) < 1e-9);
  audio.setLoopLevel('crateSlide', 0);
  assert.equal(targets.at(-1).value, 0);
  assert.equal(targets.at(-1).constant, 0.2);
  audio.setActive(false);
  assert.ok(sources.every((source) => source.stopped));
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
  assert.ok(Math.abs(targets.at(-1).value - 0.68) < 1e-9);
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
