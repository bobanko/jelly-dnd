import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/physics.js';
import * as Soft from '../src/world/soft-body.js';
import L from '../src/world/levels.js';

function scene(specs, size = 20) {
  const floor = new Set();
  for (let x = 0; x < size; x++) for (let z = 0; z < size; z++) floor.add(`${x},${z}`);
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
// Axis 'z': the barrel lies along z, so a push along x hits its side and rolls it.
const barrel = (p) => ({ kind: 'crate', large: true, barrel: 'z', ...p });

test('a barrel pushed on its side keeps rolling on its own until a wall stops it', () => {
  const g = scene([{ x: 4, z: 4 }, barrel({ x: 4.87, z: 4 })]);
  // A raised row of floor at x = 12 acts as a wall.
  for (const z of [3, 4, 5]) g.world.heights.set(`12,${z}`, 1);
  g.step([{ x: 1, z: 0 }], 60);
  assert.ok(g.soft.get(g.bodies[1]).roll, 'the push starts a roll');
  // The jelly lets go; the barrel carries on alone.
  g.step([], 400);
  const p = g.bodies[1];
  assert.ok(p.x > 10.9 && p.x < 11.1, 'stopped against the wall: ' + p.x);
  assert.ok(Math.abs(p.z - 4) < 0.05, 'rolled straight: ' + p.z);
  assert.equal(g.soft.get(p).roll, null);
  assert.ok(Math.abs(p.spin) > 10, 'it turned as it rolled: ' + p.spin);
  assert.equal(p.state, 'alive');
});

test('a barrel pushed on its end cap slides like a crate and stops when the push ends', () => {
  const g = scene([{ x: 4, z: 4 }, barrel({ x: 4.87, z: 4, barrel: 'x' })]);
  g.step([{ x: 1, z: 0 }], 60);
  assert.equal(g.soft.get(g.bodies[1]).roll, null, 'no roll along the axis');
  const pushed = g.bodies[1].x;
  assert.ok(pushed > 5.2, 'the jelly moves it: ' + pushed);
  g.step([], 200);
  assert.ok(g.bodies[1].x - pushed < 0.3, 'it does not run away: ' + g.bodies[1].x);
  assert.ok(Math.abs(g.bodies[1].spin || 0) < 0.05, 'no spin when slid along its axis');
});

test('a rolling barrel leaves a ledge and lands below', () => {
  const g = scene([{ x: 2, z: 4, y: 1 }, barrel({ x: 2.87, z: 4, y: 1 })]);
  for (let x = 0; x <= 6; x++) for (const z of [3, 4, 5]) g.world.heights.set(`${x},${z}`, 1);
  g.step([{ x: 1, z: 0 }], 60);
  g.step([], 400);
  const p = g.bodies[1];
  assert.ok(p.x > 6.5, 'beyond the edge: ' + p.x);
  assert.ok(Math.abs(p.y) < 0.05, 'on the lower floor: ' + p.y);
  assert.equal(p.state, 'alive');
  assert.equal(g.soft.get(p).roll, null, 'the fall ends the roll');
});

test('barrels survive the level format with their axis', () => {
  const map = L.blank();
  map.crates.push(
    { x: 2, z: 2, large: true, barrel: 'z' },
    { x: 3, z: 2, large: true, barrel: 'x' },
  );
  const parsed = L.read(JSON.stringify(map));
  assert.deepEqual(
    parsed.crates.map((p) => p.barrel),
    ['z', 'x'],
  );
  assert.ok(parsed.crates.every((p) => p.large));
});
