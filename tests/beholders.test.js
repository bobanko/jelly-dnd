import { test } from 'node:test';
import assert from 'node:assert/strict';
import Levels from '../src/world/levels.js';
import * as Physics from '../src/world/physics.js';
import * as Soft from '../src/world/soft-body.js';
import { Model } from '../src/editor/editor-model.js';
import { boxes, pick } from '../src/editor/editor-space.js';
import { System as Effects } from '../src/game/game-effects.js';
import { beholderGeometry } from '../src/renderer/geometry/mobs.js';
import { hashState } from '../src/net/state-hash.js';
import demo from '../levels/beholder-guardians.json' with { type: 'json' };

function scene(dx = 1, dz = 0) {
  const map = Levels.blank();
  map.size = 9;
  for (let x = -8; x < 9; x++) for (let z = -8; z < 9; z++) map.blocks.push({ x, y: 0, z });
  map.beholders = [{ x: 0, y: 0, z: 0, id: 'watcher', color: 'red', dx, dz }];
  const r = Levels.instantiate(Levels.read(map), Physics, Soft);
  // Rigid body bounds make these geometry tests independent of jelly deformation.
  r.world.soft = null;
  return r;
}

test('all four gaze directions detect living players, respect height and ignore players behind the eye', () => {
  for (const [dx, dz] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const { world } = scene(dx, dz),
      b = world.beholders[0];
    const p = { x: dx * 3, y: 0, z: dz * 3, state: 'alive', slot: 2 };
    assert.equal(world.active(0, [p]), true);
    assert.equal(world.beholderSight(b, [p]).detected, true);
    assert.equal(world.active(0, [{ ...p, x: -p.x, z: -p.z }]), false);
    for (const y of [-1, 1]) assert.equal(world.active(0, [{ ...p, y }]), false);
    for (const state of ['dead', 'falling'])
      assert.equal(world.active(0, [{ ...p, state }]), false);
    assert.equal(world.active(0, [{ ...p, kind: 'crate' }]), false);
    // The negative half of the editor grid is playable too.
    assert.ok(Math.abs(world.beholderSight(b, []).to[dx ? 0 : 2]) > 7);
  }
});

test('stone, legacy walls, coloured glass and crates block sight; grates and ceilings above the eye do not', () => {
  for (const kind of ['block', 'glass', 'wall', 'crate', 'grate', 'ceiling']) {
    const { world } = scene(),
      b = world.beholders[0],
      p = { x: 5, y: 0, z: 0, state: 'alive' },
      bodies = [p];
    if (kind === 'block' || kind === 'glass' || kind === 'ceiling')
      world.blocks.push({
        x: 2,
        y: kind === 'ceiling' ? 3 : 1,
        z: 0,
        ...(kind === 'glass' ? { color: 2 } : {}),
      });
    if (kind === 'wall') world.obstacles.push({ x: 2, z: 0, half: 0.5, minY: 0, height: 2 });
    if (kind === 'crate') bodies.push({ kind: 'crate', x: 2, y: 0, z: 0, state: 'alive' });
    if (kind === 'grate') world.grates.push({ x: 2, y: 1, z: 0, axis: 'z' });
    world._blockBoxes = world._collisionCache = null;
    const sight = world.beholderSight(b, bodies);
    assert.equal(sight.detected, kind === 'grate' || kind === 'ceiling', kind);
    assert.ok(sight.to[0] < (sight.detected ? 5 : 3), kind);
  }
});

test('beholders and buttons share groups and drive bridges and spikes by group or ID without phantom buttons', () => {
  const { world } = scene();
  world.plates = [
    { x: 7, y: 0, z: 7, id: 'button', color: 'red' },
    { x: 6, z: 7, id: 'blue', color: 'blue' },
  ];
  world.bridges = [{ plate: 0 }, { plate: 2 }, { plate: 1 }];
  world.spikes = ['watcher', 'red', 'button', 'blue'].map((plate) => ({ plate }));
  const p = { x: 3, y: 0, z: 0, state: 'alive' };
  world.beforeFeatures([p], null, 0.3);
  assert.deepEqual([...world.held], [0, 1]);
  assert.deepEqual(
    world.spikes.map((s) => s.target),
    [1, 1, 1, 0],
  );
  assert.equal(world.beholderBeams[0].detected, true);
  world.beforeFeatures([{ ...p, z: 2 }], null, 0.3);
  assert.equal(world.held.size, 0);
  assert.ok(world.spikes.every((s) => s.target === 0));
  world.refresh([{ ...p, x: 7, z: 7, kind: 'crate' }]);
  assert.equal(world.active(2, world.bodies), true, 'a button can also hold the guardian group');
  const map = Levels.read(demo),
    r = Levels.instantiate(map, Physics, Soft);
  assert.deepEqual(Levels.issues(map), []);
  assert.equal(r.plates.length, 0);
  assert.ok(r.bridges.every((b) => b.plate === 0));
});

test('alert particles burst once per detection, rearm after leaving, expire and clear', () => {
  const { world } = scene(),
    fx = new Effects(),
    p = { x: 3, z: 0, y: 0, state: 'alive' };
  const step = (bodies) => {
    world.beholderBeams = world.traceBeholders(bodies);
    fx.step(0.01, world);
  };
  step([p]);
  assert.equal(fx.particles.filter((p) => p.kind === 'alert').length, 3);
  step([p]);
  assert.equal(fx.particles.length, 3);
  step([]);
  step([p]);
  assert.equal(fx.particles.length, 6);
  step([]);
  for (let i = 0; i < 100; i++) fx.step(0.01, world);
  assert.equal(fx.particles.length, 0);
  fx.clear();
  assert.deepEqual(fx.beholderActive, []);
  const reduced = new Effects({ reducedMotion: true });
  world.beholderBeams = world.traceBeholders([p]);
  reduced.step(0.01, world);
  assert.equal(reduced.particles.length, 1);
});

test('editor placement, direction, group, movement, picking, history and JSON round-trip preserve guardians', () => {
  const m = new Model(Levels.blank());
  m.change(() => m.paint('beholder', 3, 4, { voxel: true, y: 2 }));
  assert.equal(m.map.blocks.length, 0);
  assert.equal(m.map.tiles.length, 0);
  m.change((map) => Object.assign(map.beholders[0], { dx: -1, dz: 0, color: 'blue' }));
  m.move('beholders', 0, 5, 4, 3);
  assert.equal(m.map.blocks.length, 0);
  assert.equal(m.map.tiles.length, 0);
  const b = boxes(m.map).find((b) => b.key === 'beholders');
  assert.equal(pick({ origin: [5, 6, 4], direction: [0, -1, 0] }, [b], null).key, 'beholders');
  assert.deepEqual(Levels.read(JSON.stringify(m.map)), m.map);
  m.undo();
  assert.equal(m.map.beholders[0].x, 3);
  m.redo();
  assert.equal(m.map.beholders[0].x, 5);
  assert.deepEqual(
    [m.map.beholders[0].dx, m.map.beholders[0].dz, m.map.beholders[0].color],
    [-1, 0, 'blue'],
  );
  m.remove('beholders', 0);
  assert.equal(m.map.beholders.length, 0);
  m.undo();
  assert.equal(m.map.beholders.length, 1);
  for (const direction of [
    { dx: 0, dz: 0 },
    { dx: 1, dz: 1 },
    { dx: 0.5, dz: 0.5 },
  ]) {
    const bad = Levels.copy(m.map);
    Object.assign(bad.beholders[0], direction);
    assert.throws(() => Levels.read(bad));
  }
  const legacy = Levels.copy(m.map);
  delete legacy.beholders;
  assert.deepEqual(Levels.read(legacy).beholders, []);
});

test('airborne guardians need no floor, keep their height and trigger in midair', () => {
  const map = Levels.blank();
  map.blocks = [
    { x: 1, y: 0, z: 1 },
    { x: 2, y: 0, z: 1 },
  ];
  map.spawns[0] = { x: 1, y: 0, z: 1 };
  map.goals[0] = { x: 2, y: 0, z: 1 };
  const m = new Model(map);
  m.change(() => m.paint('beholder', 4, 3, { height: 2 }));
  assert.equal(m.map.blocks.length, 2);
  assert.equal(m.map.tiles.length, 0);
  assert.deepEqual(Levels.issues(m.map), []);
  m.move('beholders', 0, 4, 4, 3);
  assert.equal(m.map.blocks.length, 2);
  assert.deepEqual(Levels.issues(m.map), []);
  const r = Levels.instantiate(m.map, Physics, Soft),
    b = r.world.beholders[0];
  assert.equal(r.world.heightAt(b.x, b.z), null);
  const sight = r.world.beholderSight(b, [{ x: 4, y: 3, z: 6, state: 'alive' }], null);
  assert.equal(sight.detected, true);
  assert.equal(sight.from[1], 3.58);
  // Old definitions without Y also move without manufacturing a support tile.
  m.change((map) => {
    delete map.beholders[0].y;
  });
  m.move('beholders', 0, 5, 4, 2);
  assert.equal(m.map.beholders[0].y, 2);
  assert.equal(m.map.blocks.length, 2);
  m.change((map) => map.blocks.push({ x: 5, y: 3, z: 4 }));
  assert.ok(Levels.issues(m.map).some((s) => s.includes('внутри камня')));
});

test('simulation is deterministic and snapshot/reset clears derived sight without changing authored guardians', () => {
  const a = Levels.instantiate(Levels.read(demo), Physics, Soft),
    b = Levels.instantiate(Levels.read(demo), Physics, Soft),
    authored = Levels.copy(a.world.beholders);
  let detected = false;
  for (let i = 0; i < 160; i++) {
    const input = [
      { x: 0, z: 1 },
      { x: 0, z: 0 },
    ];
    a.world.step(a.bodies, input);
    b.world.step(b.bodies, input);
    assert.equal(hashState(a.world, a.bodies), hashState(b.world, b.bodies));
    detected ||= a.world.beholderBeams[0].detected;
  }
  assert.equal(detected, true);
  assert.equal(a.players[0].state, 'alive', 'gaze never damages the player');
  const snapshot = a.world.featureSnapshot();
  a.world.restoreFeatures(snapshot);
  assert.deepEqual(a.world.beholderBeams, []);
  a.world.resetFeatures();
  assert.deepEqual(a.world.beholders, authored);
  const mesh = beholderGeometry();
  assert.ok(mesh.length > 0 && mesh.length % 36 === 0);
  assert.ok(mesh.every(Number.isFinite));
});
