import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../physics.js';
import * as Soft from '../soft-body.js';
function scene(specs) {
  const floor = new Set();
  for (let x = 0; x < 20; x++) for (let z = 0; z < 20; z++) floor.add(`${x},${z}`);
  const world = new World(floor, [], []),
    soft = (world.soft = new Soft.System());
  const bodies = specs.map((p) => ({
    x: 4,
    z: 4,
    y: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    state: 'alive',
    deaths: 0,
    ...p,
  }));
  return {
    world,
    soft,
    bodies,
    step(input = [], count = 1) {
      for (let n = 0; n < count; n++) world.step(bodies, input);
    },
  };
}
function separation(g, upper, lower) {
  const a = g.soft.get(g.bodies[upper]),
    b = g.soft.get(g.bodies[lower]);
  assert.ok(
    Math.min(...a.positions.map((n) => n[1])) >= Math.max(...b.positions.map((n) => n[1])) - 0.02,
    'stacked bodies must not interpenetrate',
  );
}
test('fast falling jelly lands on another jelly, sleeps and rides with its carrier', () => {
  const g = scene([{}, { y: 2.5, state: 'falling', vy: -9 }]);
  g.step([], 400);
  separation(g, 1, 0);
  assert.equal(g.bodies[1].state, 'alive');
  assert.equal(g.soft.get(g.bodies[1]).support, g.bodies[0]);
  const before = g.bodies.map((p) => p.x);
  g.step([{ x: 1, z: 0 }], 100);
  assert.ok(g.bodies[0].x > before[0] + 1);
  assert.ok(g.bodies[1].x > before[1] + 1);
  assert.ok(Math.abs(g.bodies[1].x - g.bodies[0].x) < 0.1);
  separation(g, 1, 0);
  g.step([], 200);
  assert.ok(g.bodies.every((p) => p.state === 'alive' && p.deaths === 0));
});
test('crate and jelly can each be a passenger, and three bodies form a moving stack', () => {
  for (const kinds of [
    ['crate', undefined, undefined],
    [undefined, 'crate', undefined],
  ]) {
    const g = scene([
      { kind: kinds[0] },
      { kind: kinds[1], y: 1.4, state: 'falling' },
      { kind: kinds[2], y: 2.9, state: 'falling' },
    ]);
    g.step([], 420);
    separation(g, 1, 0);
    separation(g, 2, 1);
    const before = g.bodies[2].z;
    g.step([{ x: 0, z: 1 }], 90);
    separation(g, 1, 0);
    separation(g, 2, 1);
    assert.ok(g.bodies[2].z > before + 1);
    assert.ok(Math.abs(g.bodies[0].z - g.bodies[2].z) < 0.16);
  }
});
test('passenger walks off independently and falls onto the floor without sticking', () => {
  const g = scene([{}, { y: 1.6, state: 'falling' }]);
  g.step([], 280);
  g.step([{}, { x: 1, z: 0 }], 100);
  g.step([], 160);
  assert.ok(g.bodies[1].x > g.bodies[0].x + 1);
  assert.ok(Math.abs(g.bodies[1].y) < 0.08);
  assert.equal(g.bodies[1].state, 'alive');
  assert.equal(g.bodies[1].deaths, 0);
  assert.equal(g.soft.get(g.bodies[1]).support, null);
});
test('wooden crate can be pushed off a raised platform and lands below', () => {
  const g = scene([
    { x: 5.1, y: 1 },
    { x: 6, y: 1, kind: 'crate' },
  ]);
  for (const x of [4, 5, 6]) for (const z of [3, 4, 5]) g.world.heights.set(`${x},${z}`, 1);
  let fell = false,
    airTurn = 0,
    previous = g.soft.get(g.bodies[1]).r.slice();
  for (let n = 0; n < 220; n++) {
    g.step([{ x: 1, z: 0 }]);
    const r = g.soft.get(g.bodies[1]).r;
    if (g.bodies[1].state === 'falling') {
      fell = true;
      airTurn += Math.hypot(...r.map((v, i) => v - previous[i]));
    }
    previous = r.slice();
  }
  g.step([], 220);
  assert.ok(fell);
  assert.ok(g.bodies[1].x > 6.6);
  assert.ok(Math.abs(g.bodies[1].y) < 0.08);
  assert.equal(g.bodies[1].state, 'alive');
  assert.equal(g.bodies[1].deaths, 0);
  assert.ok(airTurn > 0.15, 'crate must rotate physically during the fall');
});

test('a rigid crate preserves angular motion and its shape while in free fall', () => {
  const g = scene([{ kind: 'crate', y: 3, state: 'falling' }]),
    body = g.bodies[0],
    b = g.soft.get(body);
  const before = b.positions.map((p) => p.slice());
  b.positions.forEach((p, i) => {
    const x = p[0] - b.center[0],
      y = p[1] - b.center[1];
    b.velocities[i] = [-y * 2, x * 2, 0];
  });
  g.step([], 30);
  assert.equal(body.state, 'falling');
  assert.ok(Math.abs(b.r[1]) > 0.3, 'airborne angular velocity must not be locked');
  for (const [a, c] of [
    [0, 63],
    [3, 60],
    [12, 51],
  ]) {
    const initial = Math.hypot(...before[a].map((v, k) => v - before[c][k])),
      actual = Math.hypot(...b.positions[a].map((v, k) => v - b.positions[c][k]));
    assert.ok(Math.abs(initial - actual) < 0.002, 'crate must remain rigid while rotating');
  }
});

test('restoring a rotated crate restores orientation immediately and reset returns it upright', () => {
  const g = scene([{ kind: 'crate', y: 3, state: 'falling' }]),
    p = g.bodies[0],
    b = g.soft.get(p);
  b.positions.forEach((node, i) => {
    const x = node[0] - b.center[0],
      y = node[1] - b.center[1];
    b.velocities[i] = [-y * 2, x * 2, 0];
  });
  g.step([], 24);
  const saved = g.soft.snapshot(g.bodies),
    orientation = g.soft.get(p).r.slice();
  g.step([], 20);
  g.soft.restore(g.bodies, saved);
  g.soft.get(p).r.forEach((v, i) => assert.ok(Math.abs(v - orientation[i]) < 1e-10));
  g.soft.reset();
  assert.deepEqual(g.soft.get(p).r, [1, 0, 0, 0, 1, 0, 0, 0, 1]);
});
test('lift carries a two-body stack without leaving the passenger behind', () => {
  const g = scene([{}, { y: 1.6, state: 'falling' }]);
  g.step([], 300);
  g.world.lifts.push({ x: 4, z: 4, base: 0, top: 1, height: 0, target: 0 });
  g.step([], 250);
  assert.equal(g.world.lifts[0].height, 1);
  assert.ok(g.bodies[0].y > 0.85);
  assert.ok(g.bodies[1].y > 1.6);
  separation(g, 1, 0);
  assert.ok(g.bodies.every((p) => p.state === 'alive'));
});
