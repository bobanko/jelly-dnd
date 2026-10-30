import { test } from 'node:test';
import assert from 'node:assert/strict';
import L from '../src/world/levels.js';
import { Model } from '../src/editor/editor-model.js';
import * as P from '../src/world/physics.js';
import * as Soft from '../src/world/soft-body.js';
import * as Features from '../src/world/level-features.js';
const faces = ['top', 'north', 'east', 'south', 'west'];
function map() {
  const m = L.blank();
  m.size = 8;
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) m.blocks.push({ x, y: 0, z });
  m.blocks.push({ x: 3, y: 1, z: 3 });
  m.spawns[2] = { x: 1, y: 0, z: 3 };
  m.goals[2] = { x: 6, y: 0, z: 6 };
  return m;
}
function contact(trap, slot, overrides = {}) {
  const world = new P.World(new Set(), [], []);
  world.spikes = [trap];
  const f = world.spikeFrame(trap),
    center = f.origin.map((v, k) => v + f.n[k] * 0.43);
  const player = {
    x: center[0],
    y: center[1] - 0.42,
    z: center[2],
    slot,
    state: 'alive',
    deaths: 0,
    ...overrides,
  };
  const soft = { get: () => ({ velocities: [] }) };
  return { world, player, step: () => world.afterFeatures([player], soft) };
}
test('old traps remain neutral floor traps; all five mounts and colours roundtrip, invalid settings are rejected', () => {
  const m = map();
  m.spikes = [{ x: 2, y: 0, z: 2, offset: 1.2 }];
  assert.deepEqual(L.read(m).spikes, m.spikes);
  m.spikes = faces.map((face, i) => ({
    x: 3,
    y: 1,
    z: 3,
    offset: i * 0.2,
    ...(face === 'top' ? {} : { face }),
    ...(i === 0 ? {} : { color: i - 1 }),
  }));
  assert.deepEqual(L.read(JSON.stringify(m)).spikes, m.spikes);
  assert.deepEqual(L.issues(L.read(m)), []);
  for (const override of [
    { face: 'bottom' },
    { color: 5 },
    { color: -1 },
    { color: 0.5 },
    { face: 'east', y: undefined },
    { face: 'west', y: 0.5 },
  ])
    assert.throws(() => L.read({ ...m, spikes: [{ x: 3, y: 1, z: 3, ...override }] }));
  assert.throws(() =>
    L.read({
      ...m,
      spikes: [
        { x: 3, y: 1, z: 3 },
        { x: 3, y: 1, z: 3, face: 'top' },
      ],
    }),
  );
  const orphan = L.read({ ...m, blocks: m.blocks.filter((b) => b.y !== 1) });
  assert.ok(L.issues(orphan).some((e) => e.includes('блок крепления')));
});
test('editor preserves independent wall mounts, top mechanisms, colours, delay, move and history', () => {
  const model = new Model(map());
  model.change(() => model.paint('plate', 3, 3, { voxel: true, y: 1 }));
  for (const face of faces.slice(1))
    model.change(() => model.paint('spikes', 3, 3, { voxel: true, y: 1, face, color: 2 }));
  assert.equal(model.map.plates.length, 1);
  assert.equal(model.map.spikes.length, 4);
  model.change((m) => {
    m.spikes[0].offset = 1.5;
  });
  model.change(() => model.paint('spikes', 3, 3, { voxel: true, y: 1, face: 'north', color: 0 }));
  assert.equal(model.map.spikes.find((p) => p.face === 'north').offset, 1.5);
  assert.equal(model.map.spikes.find((p) => p.face === 'north').color, 0);
  model.undo();
  assert.equal(model.map.spikes.find((p) => p.face === 'north').color, 2);
  model.change(() => model.paint('spikes', 3, 3, { voxel: true, y: 1, color: null }));
  assert.equal(model.map.plates.length, 0);
  assert.equal(model.map.spikes.length, 5);
  assert.equal(model.map.spikes.find((p) => !p.face).color, undefined);
  const index = model.map.spikes.findIndex((p) => p.face === 'east');
  model.move('spikes', index, 4, 3, 1);
  assert.equal(model.map.spikes[index].face, 'east');
  assert.ok(model.at('blocks', 4, 3, 1));
  model.undo();
  assert.equal(model.map.spikes[index].x, 3);
  model.change(() => model.erase(3, 3, 1));
  assert.equal(model.map.spikes.length, 0);
  model.undo();
  assert.equal(model.map.spikes.length, 5);
});
test('all five colours are immune only to their own spikes on every mount; neutral spikes kill everyone', () => {
  for (const face of faces)
    for (const color of [undefined, 0, 1, 2, 3, 4])
      for (let slot = 0; slot < L.characters.length; slot++) {
        const trap = {
            x: 3,
            y: 1,
            z: 3,
            ...(face === 'top' ? {} : { face }),
            ...(color === undefined ? {} : { color }),
          },
          g = contact(trap, slot),
          events = g.step();
        assert.equal(
          g.player.state,
          color === slot ? 'alive' : 'dead',
          `${face}, trap ${color}, hero ${slot}`,
        );
        assert.equal(events.length, color === slot ? 0 : 1);
        if (color !== slot) assert.equal(g.player.deathReason, 'spikes');
      }
});
test('side spikes hit only their outward area at the correct height, with four matching debug volumes', () => {
  for (const face of faces) {
    const trap = { x: 3, y: 1, z: 3, ...(face === 'top' ? {} : { face }) },
      g = contact(trap, 2),
      f = g.world.spikeFrame(trap);
    assert.equal(g.world.spikeTouches(g.player, trap), true);
    for (const distance of [-1, 1.4]) {
      const center = f.origin.map((p, k) => p + f.n[k] * distance);
      assert.equal(
        g.world.spikeTouches(
          { ...g.player, x: center[0], y: center[1] - 0.42, z: center[2] },
          trap,
        ),
        false,
      );
    }
    if (face !== 'top') assert.equal(g.world.spikeTouches({ ...g.player, y: 2 }, trap), false);
    const boxes = g.world.debugBoxes().filter((b) => b.kind === 'spikes');
    assert.equal(boxes.length, 4);
    assert.ok(boxes.every((b) => b.maxY > b.minY && b.halfX > 0 && b.halfZ > 0));
    g.world.featureTime = 4.8;
    assert.equal(g.world.spikeState(trap).warning, true);
    assert.equal(g.step().length, 0);
    assert.equal(g.player.state, 'alive');
    assert.equal(g.world.debugBoxes().length, 0);
    g.world.featureTime = 0;
    assert.equal(g.step().length, 1);
  }
});
test('shared mount frames are orthonormal and keep wall roots on their supporting block face', () => {
  for (const face of faces) {
    const f = Features.spikeFrame({ x: 3, z: 4, face }, 2),
      dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
    assert.equal(dot(f.n, f.u), 0);
    assert.equal(dot(f.n, f.v), 0);
    assert.equal(dot(f.u, f.v), 0);
    assert.equal(Math.hypot(...f.n), 1);
    assert.equal(f.origin[1], face === 'top' ? 2 : 1.5);
  }
});
test('a real sparse red hero safely pushes against red wall spikes, while a blue hero dies and respawns', () => {
  for (const slot of [2, 1]) {
    const m = map();
    m.spawns = [null, null, null, null];
    m.goals = [null, null, null, null];
    m.spawns[slot] = { x: 1, y: 0, z: 3 };
    m.goals[slot] = { x: 6, y: 0, z: 6 };
    m.spikes = [{ x: 3, y: 1, z: 3, face: 'west', color: 2, offset: 0 }];
    const r = L.instantiate(L.read(m), P, Soft),
      p = r.players[0];
    let deaths = 0;
    for (let k = 0; k < 120; k++) {
      deaths += r.world.step(r.bodies, [{ x: 1, z: 0 }]).filter((e) => e.type === 'death').length;
      if (deaths) break;
    }
    if (slot === 2) {
      assert.equal(p.state, 'alive');
      assert.equal(deaths, 0);
      assert.ok(p.x > 1.8 && p.x < 2.2);
    } else {
      assert.equal(p.state, 'dead');
      assert.equal(deaths, 1);
      for (let k = 0; k < 130 && p.state !== 'alive'; k++) r.world.step(r.bodies, []);
      assert.equal(p.state, 'alive');
      assert.ok(Math.abs(p.x - 1) < 0.1);
    }
  }
});
