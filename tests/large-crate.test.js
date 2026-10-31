import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/physics.js';
import * as Soft from '../src/world/soft-body.js';
import L from '../src/world/levels.js';
import * as P from '../src/world/physics.js';

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

test('a large crate stands while it overhangs a ledge by up to about two thirds', () => {
  // Ledge edge at x = 6.5; the crate is 0.94 wide, so x = 6.55 hangs out by 0.55 of it.
  const g = scene([large({ x: 6.55, y: 1 })]);
  for (const x of [4, 5, 6]) for (const z of [3, 4, 5]) g.world.heights.set(`${x},${z}`, 1);
  g.step([], 240);
  assert.equal(g.bodies[0].state, 'alive');
  assert.ok(Math.abs(g.bodies[0].y - 1) < 0.05, 'still on the ledge: ' + g.bodies[0].y);
});

test('a large crate overhanging a ledge by more than two thirds slips off it', () => {
  const g = scene([large({ x: 6.72, y: 1 })]);
  for (const x of [4, 5, 6]) for (const z of [3, 4, 5]) g.world.heights.set(`${x},${z}`, 1);
  g.step([], 300);
  assert.ok(g.bodies[0].x > 6.9, 'slid off the edge: ' + g.bodies[0].x);
  assert.ok(Math.abs(g.bodies[0].y) < 0.05, 'landed below: ' + g.bodies[0].y);
  assert.equal(g.bodies[0].state, 'alive');
});

test('a large crate pushed into a one-cell pit fills it and can be walked over', () => {
  const m = L.blank();
  m.size = 10;
  for (let x = 0; x < 10; x++)
    for (let z = 0; z < 7; z++) if (x !== 5 || z !== 3) m.blocks.push({ x, y: 0, z });
  m.blocks.push({ x: 5, y: -1, z: 3 });
  m.crates.push({ x: 3, y: 0, z: 3, large: true });
  m.spawns[0] = { x: 2, y: 0, z: 3 };
  m.goals[0] = { x: 9, y: 0, z: 6 };
  const r = L.instantiate(L.read(m), P, Soft),
    crate = r.crates[0],
    jelly = r.players[0];
  for (let i = 0; i < 420; i++) r.world.step(r.bodies, [{ x: 1, z: 0 }]);
  assert.ok(Math.abs(crate.x - 5) < 0.1 && Math.abs(crate.z - 3) < 0.1, 'centred in the pit');
  assert.ok(Math.abs(crate.y + 1) < 0.05, 'resting on the pit floor: ' + crate.y);
  assert.ok(jelly.x > 6.5 && jelly.state === 'alive', 'the jelly crossed: ' + jelly.x);
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

test('a destroyed crate is teleported back above its spawn and drops into place', () => {
  for (const kind of [{}, { large: true }]) {
    const g = scene([{ kind: 'crate', x: 6, ...kind, spawn: { x: 6, z: 4, y: 0 } }]),
      crate = g.bodies[0];
    g.step([], 60);
    Object.assign(crate, { state: 'dead', respawnTimer: 0 });
    g.step([], 1);
    assert.equal(crate.state, 'falling', 'reappears in the air');
    assert.ok(crate.y > 0.7, 'above its spawn: ' + crate.y);
    g.step([], 200);
    assert.equal(crate.state, 'alive');
    assert.ok(Math.abs(crate.y) < 0.05 && Math.abs(crate.x - 6) < 0.05, 'landed on its spawn');
  }
});

test('a jelly waits for its spawn to clear and then appears exactly on it', () => {
  const g = scene([
      { x: 6, spawn: { x: 6, z: 4, y: 0 } },
      large({ x: 6, spawn: { x: 9, z: 4, y: 0 } }),
    ]),
    [jelly, crate] = g.bodies;
  Object.assign(jelly, { state: 'dead', respawnTimer: 0, x: 6, y: -5 });
  g.step([], 30);
  assert.equal(jelly.state, 'dead', 'a large crate stands on the spawn');
  assert.equal(jelly.respawnBlocked, true, 'the renderer can show a ghost');
  Object.assign(crate, { x: 9 });
  g.soft.get(crate).reset(crate);
  g.step([], 2);
  assert.equal(jelly.state, 'alive');
  assert.equal(jelly.respawnBlocked, false);
  assert.ok(Math.abs(jelly.x - 6) < 0.01 && Math.abs(jelly.z - 4) < 0.01, 'exactly on its spawn');
});
