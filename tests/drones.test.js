import * as EditorSpace from '../src/editor/editor-space.js';
import sunkenSanctum from '../levels/05-sunken-sanctum.json' with { type: 'json' };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import L from '../src/world/levels.js';
import * as P from '../src/world/physics.js';
import * as S from '../src/world/soft-body.js';
import { Model } from '../src/editor/editor-model.js';
import * as Effects from '../src/game/game-effects.js';
function scene(slots = [1]) {
  const m = L.blank();
  m.size = 8;
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) m.blocks.push({ x, y: 0, z });
  slots.forEach((slot, i) => {
    m.spawns[slot] = { x: 6, y: 0, z: 2 + i * 2 };
    m.goals[slot] = { x: 7, y: 0, z: 2 + i * 2 };
  });
  m.drones = [{ x: 1, y: 0, z: 2, hover: 1.16, color: 2, target: slots[0] }];
  return L.instantiate(L.read(m), P, S);
}
function nearVector(actual, expected, message) {
  assert.equal(actual.length, expected.length);
  expected.forEach((v, i) =>
    assert.ok(Math.abs(actual[i] - v) < 1e-9, message ?? `${actual} ≈ ${expected}`),
  );
}
test('laser tracks the selected identity in sparse rosters, including height and diagonal aim', () => {
  const r = scene([3, 1]),
    d = r.world.drones[0],
    blue = r.players.find((p) => p.slot === 1),
    purple = r.players.find((p) => p.slot === 3);
  d.target = 1;
  blue.y = 2;
  blue.z = 5;
  const beams = r.world.traceDrones(r.bodies, null);
  assert.equal(beams.length, 1);
  assert.equal(beams[0].hit, r.players.indexOf(blue));
  assert.equal(beams[0].target, 1);
  assert.ok(beams[0].to[1] > 2 && beams[0].to[2] > 4);
  blue.state = 'dead';
  assert.equal(r.world.traceDrones(r.bodies, null).length, 0);
  d.target = 0;
  assert.equal(r.world.traceDrones(r.bodies, null).length, 0);
  d.target = -1;
  purple.x = 2;
  assert.equal(r.world.traceDrones(r.bodies, null)[0].target, 3);
});
test('all twenty-five colour pairs use colour immunity, death events, inventory cleanup and a short beam afterglow', () => {
  for (let color = 0; color < L.characters.length; color++)
    for (let slot = 0; slot < L.characters.length; slot++) {
      const r = scene([slot]),
        p = r.players[0];
      r.world.drones[0].color = color;
      p.shield = 'test';
      p.shieldHP = 3;
      p.sword = 'sword';
      r.world.pickups = [{ id: 'test', holder: 0 }];
      const events = r.world.afterDrones(r.bodies, null);
      assert.equal(p.state, color === slot ? 'alive' : 'dead');
      if (color !== slot) {
        assert.equal(p.deathReason, 'beam');
        assert.equal(p.deaths, 1);
        assert.equal(p.shield, null);
        assert.equal(p.sword, null);
        assert.equal(r.world.pickups[0].holder, null);
        assert.equal(events.length, 1);
        const effects = new Effects.System();
        effects.burst(events[0], r.players, r.soft);
        assert.equal(effects.lasers.length, 1);
        // Death pieces start inside the body; the beam's droplets start at its contact point.
        const droplets = effects.particles.filter((p) =>
          p.position.every((v, k) => Math.abs(v - events[0].beam.to[k]) < 0.02),
        );
        assert.ok(droplets.length > 0, 'lethal hits spray from the contact point');
        assert.ok(droplets.every((p) => p.kind === 'jelly' && p.size < 0.075));
        assert.ok(effects.particles.every((p) => p.color === droplets[0].color));
        effects.step(0.1, r.world);
        effects.step(0.1, r.world);
        assert.equal(effects.lasers.length, 0);
      } else assert.equal(events.length, 0);
    }
});
test('stone, colour glass, raised surfaces, closed walls, crates and the first jelly occlude the beam', () => {
  for (const kind of [
    'block',
    'colour block',
    'legacy wall',
    'crate',
    'safe jelly',
    'other jelly',
  ]) {
    const r = scene([1, 0]),
      w = r.world,
      victim = r.players.find((p) => p.slot === 1),
      blocker = r.players.find((p) => p.slot === 0);
    Object.assign(victim, { x: 6, z: 2 });
    Object.assign(blocker, { x: 3, y: 0.8, z: 2 });
    w.drones[0].color = 0;
    if (kind !== 'safe jelly' && kind !== 'other jelly') blocker.z = 6;
    if (kind === 'block' || kind === 'colour block') {
      w.blocks.push({ x: 3, y: 2, z: 2, ...(kind === 'colour block' ? { color: 0 } : {}) });
      w._blockBoxes = null;
    }
    if (kind === 'legacy wall') w.obstacles.push({ x: 3, z: 2, half: 0.5, minY: 0, height: 3 });
    if (kind === 'crate') r.bodies.push({ kind: 'crate', state: 'alive', x: 3, y: 0.65, z: 2 });
    if (kind === 'other jelly') {
      w.drones[0].color = 2;
    }
    w.afterDrones(r.bodies, null);
    assert.equal(victim.state, 'alive', kind);
    assert.ok(w.droneBeams[0].to[0] < 4, kind);
    assert.equal(w.droneBeams[0].impact, true, kind);
    if (kind !== 'other jelly') {
      const effects = new Effects.System();
      effects.step(0.01, w, [], r.players);
      assert.ok(effects.particles.length > 0, kind);
      assert.ok(
        effects.particles.every((p) => p.kind === (kind === 'safe jelly' ? 'jelly' : 'spark')),
        kind,
      );
    }
    if (kind === 'safe jelly') assert.equal(blocker.state, 'alive');
    if (kind === 'other jelly') assert.equal(blocker.state, 'dead');
  }
});
test('a hole does not block a diagonal beam, floating ceilings block only at their own height, torches do not block', () => {
  const r = scene(),
    w = r.world;
  w.blocks = [];
  w._blockBoxes = null;
  w.torches = [{ x: 3, y: 1, z: 2, face: 'east' }];
  assert.equal(w.traceDrones(r.bodies, null)[0].hit, 0);
  w.blocks = [{ x: 3, y: 4, z: 2 }];
  w._blockBoxes = null;
  w._collisionCache = null;
  assert.equal(w.traceDrones(r.bodies, null)[0].hit, 0);
  w.blocks = [{ x: 3, y: 2, z: 2 }];
  w._blockBoxes = null;
  w._collisionCache = null;
  assert.equal(w.traceDrones(r.bodies, null)[0].hit, -1);
});
test('real soft body dies, respawns and reset/undo clears derived beams without changing drone definitions', () => {
  const r = scene(),
    w = r.world,
    events = w.step(r.bodies, [{ x: 0, z: 0 }]);
  assert.ok(events.some((e) => e.reason === 'beam'));
  assert.equal(r.players[0].state, 'dead');
  const snapshot = w.featureSnapshot();
  w.drones[0].color = 1;
  for (let i = 0; i < 100; i++) w.step(r.bodies, [{ x: 0, z: 0 }]);
  assert.equal(r.players[0].state, 'alive');
  assert.equal(r.players[0].deaths, 1);
  w.restoreFeatures(snapshot);
  assert.equal(w.droneBeams.length, 0);
  w.resetFeatures();
  assert.equal(w.droneBeams.length, 0);
  assert.equal(w.drones.length, 1);
});
test('editor supports free hovering drones, settings, moving, history, picking, persistence and validation', () => {
  const E = EditorSpace,
    m = new Model(L.blank());
  m.change(() => m.paint('drone', 3, 4, { voxel: true, y: 2 }));
  assert.equal(m.map.blocks.length, 0);
  assert.equal(m.map.tiles.length, 0);
  m.change((map) => Object.assign(map.drones[0], { color: 1, target: 3, hover: 2.5 }));
  m.move('drones', 0, 5, 4, 3);
  assert.equal(m.map.blocks.length, 0);
  assert.deepEqual(m.map.drones[0], { x: 5, y: 3, z: 4, color: 1, target: 3, hover: 2.5 });
  m.undo();
  assert.equal(m.map.drones[0].x, 3);
  m.redo();
  assert.equal(m.map.drones[0].x, 5);
  assert.deepEqual(L.read(JSON.stringify(m.map)), m.map);
  assert.ok(L.issues(m.map).some((s) => s.includes('выбранная цель')));
  const b = E.boxes(m.map).find((b) => b.key === 'drones');
  assert.ok(Math.abs(b.min[1] - 5.58) < 1e-9);
  assert.ok(Math.abs(b.max[1] - 6.7) < 1e-9);
  for (const bad of [
    { color: 5 },
    { target: 5 },
    { target: 0.5 },
    { hover: -0.1 },
    { hover: Infinity },
  ]) {
    const map = L.copy(m.map);
    Object.assign(map.drones[0], bad);
    assert.throws(() => L.read(map));
  }
  m.remove('drones', 0);
  assert.equal(m.map.drones.length, 0);
  m.undo();
  assert.equal(m.map.drones.length, 1);
  const old = L.copy(sunkenSanctum);
  delete old.drones;
  assert.deepEqual(L.read(old).drones, []);
});

test('zero hover leaves a small floor gap and shares its origin with aiming, picking and stone validation', () => {
  const E = EditorSpace,
    m = new Model(L.blank());
  m.change(() => m.paint('drone', 3, 4, { voxel: true, y: 2 }));
  assert.equal(m.map.drones[0].hover, 0);
  m.change((map) => {
    map.blocks.push({ x: 3, y: 2, z: 4 });
  });
  const d = m.map.drones[0],
    origin = L.droneOrigin(d),
    box = E.boxes(m.map).find((b) => b.key === 'drones');
  assert.ok(Math.abs(origin[1] - 2.64) < 1e-9);
  assert.ok(Math.abs(box.min[1] - 2.08) < 1e-9);
  assert.ok(!L.issues(m.map).some((s) => s.includes('внутри камня')));
  const r = L.instantiate(m.map, P, S);
  assert.deepEqual(r.world.droneOrigin(r.world.drones[0]), origin);
  m.change((map) => {
    map.blocks.push({ x: 3, y: 3, z: 4 });
  });
  assert.ok(L.issues(m.map).some((s) => s.includes('внутри камня')));
  const map = L.blank();
  map.drones = [{ x: 1, z: 1 }];
  assert.equal(L.read(map).drones[0].hover, 0);
  const low = scene();
  low.world.drones[0].hover = 0;
  assert.equal(
    low.world.traceDrones(low.bodies, null)[0].hit,
    0,
    'floor must not block a low beam',
  );
});

test('all eight axis masks follow exact target coordinates while locked axes retain the anchor', () => {
  for (let mask = 0; mask < 8; mask++) {
    const r = scene([3, 1]),
      w = r.world,
      d = w.drones[0],
      target = r.players.find((p) => p.slot === 1);
    d.target = 1;
    d.follow = ['x', 'y', 'z'].filter((_, i) => mask & (1 << i));
    const authored = L.copy(d),
      anchor = L.droneOrigin(d);
    for (const position of [
      { x: 5.25, y: 1.5, z: 4.75 },
      { x: 6.125, y: 2.25, z: 3.5 },
    ]) {
      Object.assign(target, position);
      const expected = [
        d.follow.includes('x') ? target.x : anchor[0],
        d.follow.includes('y') ? target.y + 0.64 + d.hover : anchor[1],
        d.follow.includes('z') ? target.z : anchor[2],
      ];
      assert.deepEqual(w.droneOrigin(d), expected, `mask ${mask}`);
      const beam = w.traceDrones(r.bodies, null)[0];
      assert.deepEqual(beam.from, expected);
      assert.equal(beam.target, 1, 'follows colour identity rather than roster order');
    }
    assert.deepEqual(d, authored, 'tracking never overwrites authored coordinates');
    target.state = 'dead';
    assert.equal(w.traceDrones(r.bodies, null).length, 0);
    assert.deepEqual(w.droneOrigin(d), anchor, 'missing target returns to the anchor');
  }
});

test('axis following uses the selected live jelly, ignores crates and keeps nearest-target ties stable', () => {
  const r = scene([3, 1]),
    w = r.world,
    d = w.drones[0];
  d.target = -1;
  d.follow = ['x', 'z'];
  Object.assign(r.players[0], { x: 2, z: 2 });
  Object.assign(r.players[1], { x: 2, z: 2 });
  r.bodies.push({ kind: 'crate', state: 'alive', x: 1, y: 1, z: 2 });
  assert.equal(w.droneTarget(d).p, r.players[0], 'equal distance keeps roster order');
  assert.equal(w.traceDrones(r.bodies, null)[0].target, r.players[0].slot);
  r.players[0].state = 'dead';
  Object.assign(r.players[1], { x: 4.25, z: 5.5 });
  assert.equal(w.droneTarget(d).p, r.players[1]);
  nearVector(w.droneOrigin(d), [4.25, 1.8, 5.5]);
  d.target = r.players[0].slot;
  assert.deepEqual(
    w.droneOrigin(d),
    L.droneOrigin(d),
    'a missing selected colour does not switch targets',
  );
});

test('beam collisions and colour immunity use the followed origin', () => {
  const r = scene([1]),
    w = r.world,
    d = w.drones[0],
    p = r.players[0];
  d.follow = ['z'];
  d.color = 1;
  p.z = 5;
  w.blocks.push({ x: 3, y: 2, z: 5 });
  w._blockBoxes = null;
  w._collisionCache = null;
  w.afterDrones(r.bodies, null);
  nearVector(w.droneBeams[0].from, [1, 1.8, 5]);
  assert.equal(w.droneBeams[0].hit, -1);
  assert.ok(w.droneBeams[0].to[0] < 3, 'wall blocks the new beam line');
  w.blocks.pop();
  w._blockBoxes = null;
  w._collisionCache = null;
  assert.deepEqual(w.afterDrones(r.bodies, null), []);
  assert.equal(p.state, 'alive');
  assert.equal(w.droneBeams[0].hit, 0);
  d.color = 2;
  assert.equal(w.afterDrones(r.bodies, null)[0].reason, 'beam');
  nearVector(w.droneBeams[0].from, [1, 1.8, 5], 'lethal frame retains its followed beam origin');
});

test('axis settings survive editor changes, movement, undo, export and old maps', () => {
  const m = new Model(L.blank());
  m.change(() => m.paint('drone', 3, 4, { voxel: true, y: 2 }));
  assert.equal(m.map.drones[0].follow, undefined, 'old drones remain stationary');
  m.change((map) => {
    map.drones[0].follow = ['z', 'x'];
  });
  assert.deepEqual(m.map.drones[0].follow, ['x', 'z']);
  m.change((map) => {
    map.drones[0].color = 1;
    map.drones[0].target = 3;
  });
  m.move('drones', 0, 5, 6, 3);
  assert.deepEqual(m.map.drones[0].follow, ['x', 'z']);
  assert.deepEqual(L.read(JSON.stringify(m.map)), m.map);
  m.undo();
  assert.equal(m.map.drones[0].x, 3);
  m.redo();
  assert.equal(m.map.drones[0].x, 5);
  m.change((map) => {
    map.drones[0].follow = [];
  });
  assert.equal(m.map.drones[0].follow, undefined);
  m.undo();
  assert.deepEqual(m.map.drones[0].follow, ['x', 'z']);
  for (const follow of [null, 'x', true, {}, ['X'], ['x', 'x'], ['w'], ['x', 1]]) {
    const map = L.copy(m.map);
    map.drones[0].follow = follow;
    assert.throws(() => L.read(map));
  }
});

test('following restores from body positions after snapshot, death, respawn and reset', () => {
  const r = scene([1]),
    w = r.world,
    d = w.drones[0],
    p = r.players[0];
  d.follow = ['x', 'y', 'z'];
  d.color = 1;
  const authored = L.copy(d),
    snapshot = w.featureSnapshot(),
    original = { x: p.x, y: p.y, z: p.z };
  Object.assign(p, { x: 4.5, y: 2, z: 4 });
  assert.deepEqual(w.traceDrones(r.bodies, null)[0].from, [4.5, 3.8, 4]);
  Object.assign(p, original);
  w.restoreFeatures(snapshot);
  nearVector(w.droneOrigin(d), [6, 1.8, 2]);
  p.state = 'dead';
  p.respawnTimer = 0;
  assert.deepEqual(w.droneOrigin(d), L.droneOrigin(d));
  w.step(r.bodies, []);
  assert.equal(p.state, 'alive');
  assert.deepEqual(w.droneOrigin(d), [p.x, p.y + 0.64 + d.hover, p.z]);
  w.resetFeatures();
  assert.deepEqual(d, authored);
  assert.deepEqual(w.droneOrigin(d), [p.x, p.y + 0.64 + d.hover, p.z]);
});

test('axis-following drone flies to a teleported target instead of teleporting with it', () => {
  const r = scene([1]),
    w = r.world,
    d = w.drones[0],
    p = r.players[0];
  d.follow = ['x', 'z'];
  d.target = 1;
  w.updateDroneFollowing(r.bodies, 1 / 120);
  const before = w.droneOrigin(d);
  Object.assign(p, { x: p.x + 8, z: p.z + 4, portalFlash: 0.55 });
  w.updateDroneFollowing(r.bodies, 0.1);
  const flying = w.droneOrigin(d),
    destination = L.droneOrigin(d, 0, p),
    firstStep = Math.hypot(flying[0] - before[0], flying[2] - before[2]);
  assert.ok(flying[0] > before[0] && flying[0] < destination[0]);
  assert.ok(flying[2] > before[2] && flying[2] < destination[2]);
  assert.equal(w.droneFollowing[0].flying, true);
  assert.deepEqual(w.traceDrones(r.bodies, null), [], 'beam stays off while the drone is flying');
  const snapshot = w.combatSnapshot();
  w.updateDroneFollowing(r.bodies, 0.1);
  const second = w.droneOrigin(d),
    secondStep = Math.hypot(second[0] - flying[0], second[2] - flying[2]);
  assert.ok(secondStep > firstStep, 'smooth easing accelerates at the start of the flight');
  w.restoreCombat(snapshot);
  assert.deepEqual(w.droneOrigin(d), flying, 'undo restores the in-flight position');
  p.portalFlash = 0;
  for (let i = 0; i < 40; i++) w.updateDroneFollowing(r.bodies, 0.1);
  assert.deepEqual(w.droneOrigin(d), destination);
  assert.equal(w.droneFollowing[0].flying, false);
  assert.deepEqual(w.traceDrones(r.bodies, null)[0].from, destination, 'beam turns on at arrival');
});

test('editor can pick the followed preview while retaining authored cell metadata', () => {
  const m = L.blank();
  m.drones = [{ x: 1, y: 0, z: 2, color: 1, target: 1, hover: 1.16, follow: ['x', 'z'] }];
  m.spawns[1] = { x: 6, y: 0, z: 5 };
  const r = L.instantiate(L.read(m), P, S),
    bounds = EditorSpace.boxes(m, { droneOrigin: (d) => r.world.droneOrigin(d) }),
    drone = bounds.find((b) => b.key === 'drones');
  nearVector(drone.min, [5.68, 1.24, 4.68]);
  const hit = EditorSpace.pick({ origin: [6, 4, 5], direction: [0, -1, 0] }, bounds, null);
  assert.equal(hit.key, 'drones');
  assert.deepEqual(
    [hit.x, hit.y, hit.z],
    [1, 0, 2],
    'selection edits the anchor rather than baking a target position',
  );
});
