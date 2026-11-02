import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../src/world/physics.js';
import * as Soft from '../src/world/soft-body.js';
import L from '../src/world/levels.js';
import * as P from '../src/world/physics.js';

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
  assert.ok(Math.abs(p.x - 11) < 0.01, 'knocked back onto the free cell centre: ' + p.x);
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

test('a barrel rolling off a ledge lands on its side and rolls on', () => {
  const g = scene([{ x: 2, z: 4, y: 1 }, barrel({ x: 2.87, z: 4, y: 1 })]);
  for (let x = 0; x <= 6; x++) for (const z of [3, 4, 5]) g.world.heights.set(`${x},${z}`, 1);
  // A wall further along the lower floor.
  for (const z of [3, 4, 5]) g.world.heights.set(`13,${z}`, 1);
  g.step([{ x: 1, z: 0 }], 60);
  g.step([], 600);
  const p = g.bodies[1];
  assert.ok(Math.abs(p.x - 12) < 0.02, 'rolled on to the wall below: ' + p.x);
  assert.ok(Math.abs(p.y) < 0.05, 'on the lower floor: ' + p.y);
  assert.equal(p.state, 'alive');
  assert.ok(!p.upright, 'rolling off sideways, it lands still lying on its side');
  assert.equal(p.barrel, 'z');
});

test('a barrel pushed through a crate starts rolling', () => {
  const g = scene([{ x: 2, z: 4 }, { kind: 'crate', x: 2.8, z: 4 }, barrel({ x: 3.66, z: 4 })]);
  g.step([{ x: 1, z: 0 }], 90);
  assert.ok(g.soft.get(g.bodies[2]).roll, 'the crate passes the push on and it rolls');
});

test('a barrel stopped by a wall still slides along it', () => {
  const g = scene([{ x: 4, z: 4 }, barrel({ x: 4.87, z: 4 })]);
  for (let z = 0; z < 20; z++) g.world.heights.set(`12,${z}`, 1);
  g.step([{ x: 1, z: 0 }], 60);
  g.step([], 400);
  const p = g.bodies[1],
    jelly = g.bodies[0];
  // From the end cap (towards +z), push it along the wall.
  g.soft.translate(jelly, 11 - jelly.x, 0, 3.1 - jelly.z, true);
  g.step([{ x: 0, z: 1 }], 300);
  assert.ok(p.z > 4.8, 'it moves along the wall: ' + p.z);
  assert.ok(Math.abs(p.x - 11) < 0.05, 'and stays off it: ' + p.x);
});

test('a roll speeds up after the push, then eases down', () => {
  const g = scene([{ x: 2, z: 4 }, barrel({ x: 2.87, z: 4 })], 40);
  g.step([{ x: 1, z: 0 }], 30);
  const speeds = [];
  for (let n = 0; n < 360; n++) {
    g.step([]);
    speeds.push(g.bodies[1].vx);
  }
  const peak = Math.max(...speeds);
  assert.ok(peak > 3.3, 'it picks up speed: ' + peak);
  assert.ok(speeds.indexOf(peak) > 5, 'the peak comes after the push');
  assert.ok(speeds.at(-1) < peak * 0.7, 'then it slows down: ' + speeds.at(-1));
  assert.ok(speeds.at(-1) > 1, 'but keeps rolling: ' + speeds.at(-1));
});

test('a rolling barrel hands its roll to a barrel lying across its path', () => {
  const g = scene([{ x: 2, z: 4 }, barrel({ x: 2.87, z: 4 }), barrel({ x: 6, z: 4 })]);
  for (const z of [3, 4, 5]) g.world.heights.set(`12,${z}`, 1);
  g.step([{ x: 1, z: 0 }], 60);
  g.step([], 500);
  assert.ok(
    Math.abs(g.bodies[1].x - 5) < 0.02,
    'the first stops on the cell before: ' + g.bodies[1].x,
  );
  assert.ok(
    Math.abs(g.bodies[2].x - 11) < 0.02,
    'the second rolls on to the wall: ' + g.bodies[2].x,
  );
});

test('a rolling barrel just stops against the end cap of another barrel', () => {
  const g = scene([{ x: 2, z: 4 }, barrel({ x: 2.87, z: 4 }), barrel({ x: 6, z: 4, barrel: 'x' })]);
  g.step([{ x: 1, z: 0 }], 60);
  g.step([], 400);
  assert.ok(Math.abs(g.bodies[1].x - 5) < 0.02, 'stopped on the cell before: ' + g.bodies[1].x);
  assert.ok(Math.abs(g.bodies[2].x - 6) < 0.1, 'the other stays put: ' + g.bodies[2].x);
  assert.equal(g.soft.get(g.bodies[2]).roll, null);
});

test('a standing barrel is a crate, and a second drop lays it on its side again', () => {
  // Three levels of floor: x 0–4 at 2, x 5–8 at 1, everything else (z > 5 too) at 0.
  const g = scene([{ x: 2, z: 4, y: 2 }, barrel({ x: 2.87, z: 4, y: 2, barrel: 'x' })]);
  for (let x = 0; x <= 8; x++)
    for (const z of [3, 4, 5]) g.world.heights.set(`${x},${z}`, x <= 4 ? 2 : 1);
  // Pushed along its axis off the top step, it falls forward onto its head.
  const p = g.bodies[1];
  // Push until it starts to pivot over the edge, then let go.
  for (let n = 0; n < 600 && !p.tipBase; n++) g.step([{ x: 1, z: 0 }]);
  assert.ok(p.tipBase, 'it pivots over the edge');
  g.step([], 300);
  assert.ok(Math.abs(p.y - 1) < 0.05, 'on the middle step: ' + p.y);
  assert.equal(p.upright, true, 'pushed head first over the edge, it pivots onto its head');
  assert.ok(Math.abs(p.x - 5) < 0.05, 'centred on the cell past the edge: ' + p.x);
  // Standing, a push only slides it (no roll); pushed over the step's side edge at z = 5.5 it
  // pivots back onto its side, its axis along the push.
  const jelly = g.bodies[0];
  g.soft.translate(jelly, p.x - jelly.x, p.y - jelly.y, p.z - jelly.z - 0.9, true);
  g.step([{ x: 0, z: 1 }], 30);
  assert.equal(g.soft.get(p).roll, null, 'a standing barrel does not roll');
  for (let n = 0; n < 900 && !p.tipBase; n++) g.step([{ x: 0, z: 1 }]);
  assert.ok(p.tipBase, 'it pivots over the second edge');
  g.step([], 300);
  assert.ok(Math.abs(p.y) < 0.05, 'pushed off the second step: ' + p.y);
  assert.equal(p.upright, false, 'it lies on its side again');
  assert.equal(p.barrel, 'z', 'its axis points the way it fell');
  assert.ok(Math.abs(p.z - 6) < 0.05, 'centred on the cell past the edge: ' + p.z);
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

// A real level: portals, blocks and crates go through the level format.
function portalLevel(crates, jelly = { x: 1, z: 2 }) {
  const m = L.blank();
  m.size = 12;
  for (let x = 0; x < 12; x++) for (let z = 0; z < 8; z++) m.blocks.push({ x, y: 0, z });
  m.spawns[0] = { ...jelly, y: 0 };
  m.goals[0] = { x: 11, y: 0, z: 7 };
  m.portals = [
    { x: 4, y: 0, z: 2, color: 'violet' },
    { x: 4, y: 0, z: 6, color: 'violet' },
  ];
  m.crates = crates;
  const r = L.instantiate(L.read(m), P, Soft);
  return {
    ...r,
    step: (input, count = 1) => {
      const events = [];
      for (let n = 0; n < count; n++) events.push(...r.world.step(r.bodies, input));
      return events;
    },
  };
}

test('portals carry crates, and a rolling barrel leaves the exit still rolling', () => {
  const r = portalLevel([{ x: 2, z: 2, large: true, barrel: 'z' }]);
  const barrel = r.crates[0];
  r.step([{ x: 1, z: 0 }], 60);
  const events = r.step([], 400);
  assert.ok(
    events.some((e) => e.type === 'portal' && e.crate),
    'the barrel went through',
  );
  assert.ok(Math.abs(barrel.z - 6) < 0.05, 'out of the second portal: ' + barrel.z);
  assert.ok(barrel.x > 9, 'and rolled on along +x: ' + barrel.x);
});

test('a pushed crate goes through a portal too', () => {
  const r = portalLevel([{ x: 3, z: 2 }]);
  const crate = r.crates[0];
  r.step([{ x: 1, z: 0 }], 200);
  assert.ok(Math.hypot(crate.x - 4, crate.z - 6) < 0.6, 'at the exit: ' + crate.x + ',' + crate.z);
});
