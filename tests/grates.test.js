import { test } from 'node:test';
import assert from 'node:assert/strict';
import L from '../src/world/levels.js';
import * as P from '../src/world/physics.js';
import * as Soft from '../src/world/soft-body.js';
import { Model } from '../src/editor/editor-model.js';
import { boxes, pick } from '../src/editor/editor-space.js';
import { grate } from '../src/renderer/geometry/grate.js';

function room(axis = 'z', sign = 1, slot = 0) {
  const m = L.blank(),
    direction = axis === 'z' ? 'x' : 'z';
  m.size = 8;
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) m.blocks.push({ x, y: 0, z });
  m.spawns[slot] = { x: 3, y: 0, z: 3, [direction]: 3 - sign * 2 };
  m.goals[slot] = { x: 3, y: 0, z: 3, [direction]: 3 + sign * 2 };
  for (let along = 0; along < 8; along++) m.grates.push({ x: 3, y: 1, z: 3, [axis]: along, axis });
  return m;
}
const runtime = (m) => L.instantiate(L.read(m), P, Soft);
function step(r, n, inputs = []) {
  for (let i = 0; i < n; i++) r.world.step(r.bodies, inputs);
}

test('grates export, import, rotate, replace stone, move, erase and undo independently', () => {
  const m = new Model(room());
  m.change(() => m.paint('grate', 2, 2, { y: 1, axis: 'x' }));
  assert.equal(m.at('blocks', 2, 2, 1), undefined, 'no stone inside the grate');
  assert.equal(m.at('grates', 2, 2, 1).axis, 'x');
  m.change(() => m.paint('grate', 2, 2, { y: 1, axis: 'x' }));
  m.change(() => {
    m.at('grates', 2, 2, 1).axis = 'z';
  });
  assert.equal(m.map.grates.filter((p) => p.x === 2 && p.y === 1 && p.z === 2).length, 1);
  assert.deepEqual(L.read(JSON.stringify(m.map)), m.map);
  assert.deepEqual(L.voxelize(m.map), m.map);
  assert.deepEqual(L.issues(m.map), []);
  m.move(
    'grates',
    m.map.grates.findIndex((p) => p.x === 2),
    4,
    2,
    2,
  );
  assert.equal(m.at('grates', 4, 2, 2).axis, 'z');
  assert.equal(m.at('blocks', 4, 2, 2), undefined, 'moving does not create stone');
  m.undo();
  assert.ok(m.at('grates', 2, 2, 1));
  m.change(() => m.paint('cube', 2, 2, { y: 1 }));
  assert.equal(m.at('grates', 2, 2, 1), undefined);
  m.change(() => m.paint('grate', 2, 2, { y: 1 }));
  assert.equal(m.at('blocks', 2, 2, 1), undefined);
  m.change(() => m.erase(2, 2, 1));
  assert.equal(m.at('grates', 2, 2, 1), undefined);
  m.undo();
  assert.ok(m.at('grates', 2, 2, 1));
  m.redo();
  assert.equal(m.at('grates', 2, 2, 1), undefined);
  for (const p of [
    { y: 0.5 },
    { y: undefined },
    { axis: 'y' },
    { plane: 'diagonal' },
    { offset: 0.25 },
    { offset: '0.5' },
  ])
    assert.throws(() => L.read({ ...room(), grates: [{ x: 3, y: 1, z: 3, ...p }] }));
  assert.throws(() => L.read({ ...room(), grates: [{ x: 3, y: 0, z: 3 }] }));
});

test('all five slimes cross both grate orientations from either side', () => {
  for (let slot = 0; slot < 5; slot++)
    for (const axis of ['x', 'z'])
      for (const sign of [-1, 1]) {
        const r = runtime(room(axis, sign, slot)),
          direction = axis === 'z' ? 'x' : 'z';
        step(r, 210, [{ x: 0, z: 0, [direction]: sign }]);
        assert.equal(r.players[0].state, 'alive');
        assert.ok(
          (r.players[0][direction] - 3) * sign > 1,
          `slot ${slot}, axis ${axis}, sign ${sign}`,
        );
        assert.ok(Math.abs(r.players[0].y) < 0.1);
        assert.equal(
          r.world.heightAt(3, 3, Infinity, r.players[0]),
          0,
          'bars do not support slime',
        );
      }
});

test('small crates, large cubes and barrels pushed by slime stop against either face', () => {
  for (const spec of [
    {},
    { large: true },
    { large: true, barrel: 'x' },
    { large: true, barrel: 'z' },
  ])
    for (const axis of ['x', 'z'])
      for (const sign of [-1, 1]) {
        const m = room(axis, sign),
          direction = axis === 'z' ? 'x' : 'z';
        m.crates = [{ x: 3, y: 0, z: 3, [direction]: 3 - sign, ...spec }];
        const r = runtime(m),
          c = r.crates[0];
        step(r, 300, [{ x: 0, z: 0, [direction]: sign }]);
        assert.equal(c.state, 'alive');
        assert.ok(
          (c[direction] - 3) * sign < -0.35,
          `${JSON.stringify(spec)}, ${axis}, ${sign}: ${c[direction]}`,
        );
        assert.equal(
          r.world.blockSolid(
            c,
            r.world.collisionBoxes().find((b) => b.kind === 'grate'),
          ),
          true,
        );
        assert.equal(
          r.world.blockSolid(
            { kind: 'pickup' },
            r.world.collisionBoxes().find((b) => b.kind === 'grate'),
          ),
          true,
        );
      }
});

test('rigid movement and support use thin bounds while beams and arrows pass through', () => {
  for (const axis of ['x', 'z']) {
    const r = runtime(room(axis)),
      direction = axis === 'z' ? 'x' : 'z';
    r.world.soft = null;
    step(r, 210, [{ x: 0, z: 0, [direction]: 1 }]);
    assert.ok(r.players[0][direction] > 4);
    const from = [3, 0.42, 3],
      to = [3, 0.42, 3];
    from[direction === 'x' ? 0 : 2] = 1;
    to[direction === 'x' ? 0 : 2] = 5;
    r.world.drones = [
      {
        x: from[0],
        y: 0,
        z: from[2],
        color: 4,
        target: 0,
        hover: 0,
      },
    ];
    r.players[0].x = to[0];
    r.players[0].z = to[2];
    assert.equal(r.world.traceDrones(r.bodies, null)[0].hit, 0, 'grate does not stop the beam');
    r.world.drones = [];
    r.players[0].state = 'alive';
    r.world.arrows = [
      {
        x: from[0],
        y: from[1],
        z: from[2],
        dx: direction === 'x' ? 1 : 0,
        dz: direction === 'z' ? 1 : 0,
        speed: 5.5,
        life: 4,
      },
    ];
    r.world._collisionCache = null;
    r.world.afterCombat(r.bodies, null, 0.7);
    assert.equal(r.players[0].deathReason, 'arrow', 'arrow crosses the grate and hits the jelly');
    assert.equal(r.world.heightAt(3, 3, Infinity, { kind: 'crate' }), 1);
    assert.equal(
      r.world.heightAt(3.3, 3.3, Infinity, { kind: 'crate' }),
      0,
      'only the rail supports rigid bodies',
    );
  }
});

test('editor picking matches a standalone grate and skips its empty sides', () => {
  for (const axis of ['x', 'z']) {
    const m = L.blank();
    m.grates = [{ x: 3, y: 1, z: 3, axis }];
    const bounds = boxes(m),
      direction = axis === 'z' ? 0 : 2;
    const origin = [3, 0.5, 3],
      ray = [0, 0, 0];
    origin[direction] = 1;
    ray[direction] = 1;
    assert.equal(pick({ origin, direction: ray }, bounds, null)?.key, 'grates');
    assert.equal(pick({ origin: [3.3, 2, 3.3], direction: [0, -1, 0] }, bounds, null)?.key, null);
    const mesh = [];
    grate(mesh, m.grates[0]);
    assert.ok(mesh.length > 0);
    assert.ok(mesh.every(Number.isFinite));
    for (let i = 0; i < mesh.length; i += 12) {
      assert.ok(Math.abs(mesh[i + direction] - 3) < 0.12, 'no stone or side posts');
      assert.ok(mesh[i + 1] >= 0 && mesh[i + 1] <= 1);
    }
  }
});

test('respawning slime can emerge through a grate while a rigid object waits for clearance', () => {
  const m = room();
  m.spawns[0] = { x: 3, y: 0, z: 3 };
  const r = runtime(m),
    p = r.players[0];
  assert.deepEqual(r.world.respawnPosition(p, []), { x: 3, y: 0, z: 3 });
  const c = { kind: 'crate', spawn: { x: 3, y: 0, z: 3 } };
  assert.equal(r.world.respawnPosition(c, []), undefined);
  c.spawn.x = 2;
  assert.deepEqual(r.world.respawnPosition(c, []), { x: 2, y: 0, z: 3 });
});

test('boundary sections coexist inside their own cells and edits preserve their position', () => {
  const m = new Model(room());
  m.change(() => {
    for (const axis of ['x', 'z'])
      for (const offset of [-0.5, 0.5]) m.paint('grate', 1, 1, { y: 1, axis, offset });
    m.paint('grate', 1, 1, { y: 1, plane: 'horizontal', offset: 0.5 });
  });
  const at = () => m.map.grates.filter((g) => g.x === 1 && g.y === 1 && g.z === 1);
  assert.equal(at().length, 5, 'four walls and a lid fit in one voxel');
  const count = m.map.grates.length;
  m.change(() => m.paint('grate', 2, 1, { y: 1, axis: 'z', offset: -0.5 }));
  assert.equal(m.map.grates.length, count + 1, 'each neighbour keeps its own inset section');
  m.change(() => m.paint('grate', 2, 1, { y: 1, axis: 'z', offset: -0.5 }));
  assert.equal(m.map.grates.length, count + 1, 'repainting the same section does not duplicate it');
  assert.deepEqual(L.read(JSON.stringify(m.map)), m.map);
  const index = m.map.grates.findIndex((g) => g.x === 1 && g.z === 1 && g.axis === 'x');
  m.move('grates', index, 2, 2, 2);
  assert.equal(m.map.grates[index].offset, -0.5);
  m.undo();
  assert.equal(at().length, 5);
  m.remove('grates', index);
  assert.equal(at().length, 4, 'erase only the selected face');
  m.undo();
  assert.equal(at().length, 5);
  m.change(() => m.paint('grate', 4, 4, { y: 0, plane: 'horizontal', offset: 0.5 }));
  assert.ok(m.at('blocks', 4, 4, 0), 'a boundary grate can mount on existing stone');
  assert.throws(
    () =>
      L.read({
        ...room(),
        grates: [
          { x: 1, y: 1, z: 1, axis: 'z', offset: 0.5 },
          { x: 1, y: 1, z: 1, axis: 'z', offset: 0.5 },
        ],
      }),
    /Два объекта/,
  );
});

test('both boundary positions block crates but allow slimes in both vertical directions', () => {
  for (const axis of ['x', 'z'])
    for (const offset of [-0.5, 0.5])
      for (const sign of [-1, 1]) {
        const m = room(axis, sign),
          direction = axis === 'z' ? 'x' : 'z';
        m.grates.forEach((g) => {
          g.offset = offset;
        });
        const r = runtime(m);
        step(r, 210, [{ x: 0, z: 0, [direction]: sign }]);
        assert.ok((r.players[0][direction] - 3) * sign > 1);
        m.crates = [{ x: 3, y: 0, z: 3, [direction]: 3 - sign }];
        const c = runtime(m),
          plane = 3 + offset * 0.8;
        step(c, 300, [{ x: 0, z: 0, [direction]: sign }]);
        assert.ok((c.crates[0][direction] - plane) * sign < -0.35);
      }
});

function gratePit(axis, offset, slot = 0) {
  const m = room();
  m.grates = [{ x: 3, y: 0, z: 3, axis, plane: 'horizontal', ...(offset ? { offset } : {}) }];
  m.blocks.find((b) => b.x === 3 && b.z === 3).y = -2;
  m.spawns = L.characters.map(() => null);
  m.goals = L.characters.map(() => null);
  m.spawns[slot] = { x: 3, y: 1, z: 3 };
  m.goals[slot] = { x: 6, y: 0, z: 3 };
  return m;
}

test('horizontal grates at all three heights pass falling slime and support every rigid prop', () => {
  for (const axis of ['x', 'z'])
    for (const offset of [-0.5, 0, 0.5]) {
      for (let slot = 0; slot < 5; slot++) {
        const r = runtime(gratePit(axis, offset, slot));
        step(r, 160);
        assert.equal(r.players[0].state, 'alive');
        assert.ok(Math.abs(r.players[0].y + 2) < 0.12, 'slime passes down through a flat grate');
      }
      for (const spec of [
        {},
        { large: true },
        { large: true, barrel: 'x' },
        { large: true, barrel: 'z' },
      ]) {
        const m = gratePit(axis, offset);
        m.spawns[0] = { x: 1, y: 0, z: 1 };
        m.crates = [{ x: 3, y: 1, z: 3, ...spec }];
        const r = runtime(m);
        step(r, 200);
        assert.equal(r.crates[0].state, 'alive');
        assert.ok(
          Math.abs(r.crates[0].y - (-0.5 + offset * 0.8 + 0.1)) < 0.12,
          JSON.stringify({ spec, axis, offset, y: r.crates[0].y }),
        );
      }
    }
});

test('all grate vertices, picking and colliders stay inside the authored voxel in every orientation', () => {
  for (const plane of ['vertical', 'horizontal'])
    for (const axis of ['x', 'z'])
      for (const offset of [-0.5, 0, 0.5]) {
        const m = L.blank();
        m.grates = [{ x: -3, y: 2, z: -4, plane, axis, offset }];
        const b = boxes(m)[0],
          mesh = [],
          cellMin = [-3.5, 1, -4.5],
          cellMax = [-2.5, 2, -3.5];
        grate(mesh, m.grates[0]);
        for (let k = 0; k < 3; k++) {
          assert.ok(
            b.min[k] >= cellMin[k] - 1e-10 && b.max[k] <= cellMax[k] + 1e-10,
            'collider remains within its cell',
          );
        }
        for (let i = 0; i < mesh.length; i += 12)
          for (let k = 0; k < 3; k++) {
            assert.ok(
              mesh[i + k] >= cellMin[k] - 1e-10 && mesh[i + k] <= cellMax[k] + 1e-10,
              `metal protrudes: ${plane}, ${axis}, ${offset}, dimension ${k}: ${mesh[i + k]}`,
            );
            assert.ok(
              mesh[i + k] >= b.min[k] - 1e-10 && mesh[i + k] <= b.max[k] + 1e-10,
              'collider encloses rails, bars, lips and rivets',
            );
          }
        const normal = plane === 'horizontal' ? 1 : axis === 'z' ? 0 : 2,
          origin = b.min.map((v, k) => (v + b.max[k]) / 2),
          direction = [0, 0, 0];
        if (offset < 0) assert.ok(Math.abs(b.min[normal] - cellMin[normal]) < 1e-10);
        if (offset > 0) assert.ok(Math.abs(b.max[normal] - cellMax[normal]) < 1e-10);
        origin[normal] -= 2;
        direction[normal] = 1;
        assert.equal(pick({ origin, direction }, [b], null).key, 'grates');
      }
});

test('a horizontal grate lets launched slime rise through it but stops a crate underneath', () => {
  for (const rigid of [false, true]) {
    const m = gratePit('x', 0.5);
    m.spawns[0] = rigid ? { x: 1, y: 0, z: 1 } : { x: 3, y: -2, z: 3 };
    if (rigid) m.crates = [{ x: 3, y: -2, z: 3 }];
    const r = runtime(m),
      p = rigid ? r.crates[0] : r.players[0],
      b = r.soft.get(p);
    Object.assign(p, { state: 'falling', vy: 8, launchTimer: 1 });
    b.velocities.forEach((v) => {
      v[1] = 8;
    });
    let top = -Infinity;
    for (let i = 0; i < 75; i++) {
      step(r, 1);
      top = Math.max(top, ...b.positions.map((n) => n[1]));
    }
    assert.ok(rigid ? top < 0 : top > 0.4, `${rigid ? 'crate' : 'slime'} top: ${top}`);
  }
});
