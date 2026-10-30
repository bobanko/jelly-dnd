import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as Soft from '../src/world/soft-body.js';
import { World } from '../src/world/physics.js';
function setup(positions = [[3, 3]]) {
  const floor = new Set();
  for (let x = 0; x < 14; x++) for (let z = 0; z < 14; z++) floor.add(`${x},${z}`);
  const world = new World(floor, [], []),
    soft = new Soft.System();
  world.soft = soft;
  const players = positions.map(([x, z]) => ({
    x,
    z,
    y: 0,
    vx: 0,
    vz: 0,
    vy: 0,
    state: 'alive',
    deaths: 0,
  }));
  return {
    world,
    soft,
    players,
    step: (input = [], count = 1) => {
      const events = [];
      for (let i = 0; i < count; i++) events.push(...world.step(players, input));
      return events;
    },
  };
}
function volume(b, t) {
  const [a, c, d, e] = t.ids.map((i) => b.positions[i]),
    u = c.map((v, k) => v - a[k]),
    v = d.map((v, k) => v - a[k]),
    w = e.map((v, k) => v - a[k]);
  return (
    (u[0] * (v[1] * w[2] - v[2] * w[1]) +
      u[1] * (v[2] * w[0] - v[0] * w[2]) +
      u[2] * (v[0] * w[1] - v[1] * w[0])) /
    6
  );
}
function metrics(b) {
  let min = Infinity,
    max = -Infinity,
    total = 0;
  for (const t of Soft.tets) {
    const v = volume(b, t);
    min = Math.min(min, v / t.volume);
    max = Math.max(max, v / t.volume);
    total += v;
  }
  return { min, max, total };
}
test('movement turns the nearest side face toward the requested direction', () => {
  const a = Math.PI / 3,
    r = [Math.cos(a), 0, Math.sin(a), 0, 1, 0, -Math.sin(a), 0, Math.cos(a)],
    face = Soft.nearestMovementFace(r, { x: 1, z: 0 });
  assert.ok(face.normal[0] > 0);
  assert.ok(Math.abs(face.angle) < Math.PI / 4);
  assert.ok(face.normal[1] > 0, 'the nearby +Z face should turn toward +X');
  assert.ok(face.angle > 0);
});
test('tetrahedral solid has consistent positive rest volumes and shared nodes', () => {
  const { soft, players } = setup(),
    b = soft.get(players[0]);
  assert.equal(b.positions.length, 64);
  assert.equal(Soft.tets.length, 162);
  const m = metrics(b);
  assert.ok(m.min > 0.999 && m.max < 1.001);
  assert.ok(m.total > 0.35 && m.total < 0.5);
});
test('poke deforms actual nodes, conserves volume and settles to exact sleep', () => {
  const g = setup();
  g.step([], 300);
  const b = g.soft.get(g.players[0]);
  assert.equal(b.sleeping, true);
  const before = b.positions.map((p) => p.slice()),
    initial = metrics(b).total;
  g.soft.poke(g.players[0]);
  g.step([], 10);
  assert.ok(b.positions.some((p, i) => Math.abs(p[1] - before[i][1]) > 0.002));
  assert.ok(Math.abs(metrics(b).total - initial) / initial < 0.08);
  g.step([], 400);
  assert.equal(b.sleeping, true);
  const sleeping = JSON.stringify(b.positions);
  g.step([], 100);
  assert.equal(JSON.stringify(b.positions), sleeping);
});
test('inverted tetrahedra recover and strain is bounded after a violent local perturbation', () => {
  const g = setup(),
    b = g.soft.get(g.players[0]);
  b.positions[0] = b.positions[21].slice();
  b.positions[1][1] -= 0.4;
  b.velocities[0] = [12, -15, 7];
  g.step([], 160);
  const m = metrics(b);
  assert.ok(m.min > 0, JSON.stringify(m));
  for (const edge of Soft.edges) {
    const a = b.positions[edge.a],
      c = b.positions[edge.b],
      ratio = Math.hypot(...a.map((v, k) => v - c[k])) / edge.length;
    assert.ok(ratio > 0.6 && ratio < 1.4, 'strain ' + ratio);
  }
});
test('heavy landing squashes and settles without a rubber bounce', () => {
  const g = setup();
  g.players[0].y = 1.5;
  const b = g.soft.get(g.players[0]);
  let lowest = Infinity,
    maxRebound = 0,
    contact = false;
  for (let n = 0; n < 480; n++) {
    g.step();
    lowest = Math.min(lowest, g.players[0].y);
    if (g.players[0].y < 0.03) contact = true;
    if (contact) maxRebound = Math.max(maxRebound, g.players[0].y);
  }
  assert.ok(lowest > -0.15);
  assert.ok(maxRebound < 0.14, 'rebound ' + maxRebound);
  assert.equal(b.sleeping, true);
});
test('driving pushes a neighbour through real node contacts and wakes sleeping solids', () => {
  const g = setup([
    [3, 4],
    [4, 4],
  ]);
  g.step([], 300);
  assert.ok(g.players.every((p) => g.soft.get(p).sleeping));
  g.step([{ x: 1, z: 0 }], 100);
  assert.ok(g.players[1].x > 4.15);
  assert.equal(g.soft.get(g.players[1]).sleeping, false);
  assert.ok(g.players.every((p) => p.state === 'alive'));
});
test('snapshots restore the full deformed solid for undo', () => {
  const g = setup();
  g.soft.poke(g.players[0]);
  g.step([], 12);
  const snapshot = g.soft.snapshot(g.players),
    saved = JSON.stringify(snapshot[0].positions);
  g.step([{ x: 1, z: 0 }], 30);
  g.soft.restore(g.players, snapshot);
  assert.equal(JSON.stringify(g.soft.get(g.players[0]).positions), saved);
});
test('a soft cube compresses against a wall without sending nodes through it', () => {
  const g = setup();
  g.world.obstacles.push({ x: 4, z: 3, half: 0.5 });
  g.step([{ x: 1, z: 0 }], 200);
  const b = g.soft.get(g.players[0]);
  for (const node of b.positions)
    if (node[1] < 1.4 && Math.abs(node[2] - 3) < 0.515) assert.ok(node[0] <= 3.485 + 1e-6);
  assert.ok(metrics(b).min > 0);
  assert.equal(g.players[0].state, 'alive');
});
test('internal damping preserves rigid translation in free fall', () => {
  const g = setup();
  g.world.floor.clear();
  Object.assign(g.players[0], { y: -1, state: 'falling', vx: 1, vz: 0.4 });
  g.soft.decay = 1;
  g.step([], 12);
  assert.ok(Math.abs(g.players[0].vx - 1) < 1e-6);
  assert.ok(Math.abs(g.players[0].vz - 0.4) < 1e-6);
  assert.ok(g.players[0].vy < 0);
});
test('movement quickly turns the nearest face toward its travel direction', () => {
  const g = setup(),
    b = g.soft.get(g.players[0]),
    angle = Math.PI / 3,
    c = Math.cos(angle),
    s = Math.sin(angle);
  b.positions.forEach((node) => {
    const x = node[0] - b.center[0],
      z = node[2] - b.center[2];
    node[0] = b.center[0] + x * c + z * s;
    node[2] = b.center[2] - x * s + z * c;
  });
  b.orientation();
  const initialError = Math.abs(Soft.nearestMovementFace(b.r, { x: 1, z: 0 }).angle);
  g.step([{ x: 1, z: 0 }], 75);
  b.orientation();
  const finalError = Math.abs(Soft.nearestMovementFace(b.r, { x: 1, z: 0 }).angle);
  assert.ok(initialError > 0.5, `initial heading error ${initialError}`);
  assert.ok(finalError < 0.18, `final heading error ${finalError}`);
  assert.ok(finalError < initialError * 0.3);
  assert.equal(g.players[0].state, 'alive');
});
