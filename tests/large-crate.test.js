import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/physics.js';
import * as Soft from '../src/world/soft-body.js';
import L from '../src/world/levels.js';

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
const identity = (r) => r.every((v, i) => v === [1, 0, 0, 0, 1, 0, 0, 0, 1][i]);
const large = (p) => ({ kind: 'crate', large: true, ...p });

test('a large crate rests on the floor with its lattice almost a full cell wide', () => {
  const g = scene([large({ x: 6 })]);
  g.step([], 200);
  const b = g.soft.get(g.bodies[0]),
    xs = b.positions.map((n) => n[0]);
  assert.ok(Math.abs(g.bodies[0].y) < 0.03, 'feet stay on the floor: ' + g.bodies[0].y);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.9, 'almost a cell wide');
  assert.equal(g.bodies[0].state, 'alive');
});

test('a pushed large crate slides without turning, even under an off-centre push', () => {
  const g = scene([{ x: 4, z: 4.25 }, large({ x: 4.87 })]);
  let turned = false;
  for (let n = 0; n < 160; n++) {
    g.step([{ x: 1, z: 0.3 }]);
    if (!identity(g.soft.get(g.bodies[1]).r)) turned = true;
  }
  assert.equal(turned, false, 'orientation stays exactly upright');
  assert.ok(g.bodies[1].x > 5.6, 'the jelly moves it: ' + g.bodies[1].x);
  assert.ok(Math.abs(g.bodies[1].y) < 0.05);
});

test('a large crate pushed off a platform drops straight down and lands upright', () => {
  const g = scene([{ x: 5, y: 1 }, large({ x: 5.87, y: 1 })]);
  for (const x of [4, 5, 6]) for (const z of [3, 4, 5]) g.world.heights.set(`${x},${z}`, 1);
  let fell = false,
    turned = false;
  for (let n = 0; n < 260; n++) {
    g.step([{ x: 1, z: 0 }]);
    if (g.bodies[1].state === 'falling') fell = true;
    if (!identity(g.soft.get(g.bodies[1]).r)) turned = true;
  }
  g.step([], 240);
  assert.ok(fell, 'it leaves the platform');
  assert.equal(turned, false);
  assert.ok(g.bodies[1].x > 6.5, 'beyond the edge: ' + g.bodies[1].x);
  assert.ok(Math.abs(g.bodies[1].y) < 0.05, 'on the lower floor: ' + g.bodies[1].y);
  assert.equal(g.bodies[1].state, 'alive');
});

test('a large crate stays on a ledge while its centre is over it', () => {
  const g = scene([large({ x: 6.3, y: 1 })]);
  for (const x of [4, 5, 6]) for (const z of [3, 4, 5]) g.world.heights.set(`${x},${z}`, 1);
  g.step([], 240);
  assert.equal(g.bodies[0].state, 'alive');
  assert.ok(Math.abs(g.bodies[0].y - 1) < 0.05, 'still on the ledge: ' + g.bodies[0].y);
});

test('a jelly can ride on top of a large crate', () => {
  const g = scene([large({ x: 6 }), { x: 6, y: 1.6, state: 'falling' }]);
  g.step([], 400);
  assert.equal(g.bodies[1].state, 'alive');
  assert.equal(g.soft.get(g.bodies[1]).support, g.bodies[0]);
  assert.ok(Math.abs(g.bodies[1].y - 0.98) < 0.1, 'standing on its lid: ' + g.bodies[1].y);
});

test('map files keep the large flag and the small crate stays the default', () => {
  const m = L.blank();
  m.blocks.push({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });
  m.crates.push({ x: 0, z: 0 }, { x: 1, z: 0, large: true });
  const read = L.read(JSON.stringify(m));
  assert.deepEqual(
    read.crates.map((p) => !!p.large),
    [false, true],
  );
  assert.equal('large' in read.crates[0], false);
});
