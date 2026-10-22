import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World } from '../physics.js';
import { System } from '../soft-body.js';
function scene() {
  const floor = new Set();
  for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) floor.add(`${x},${z}`);
  const world = new World(floor, [], []);
  const p = { x: 5, z: 5, y: 0, state: 'alive', spawn: { x: 5, z: 5 }, vx: 0, vy: 0, vz: 0 };
  return { world, p, bodies: [p] };
}
function shoot(g, dir = { x: 1, z: 0 }, dt = 0.7) {
  g.world.archers = [
    { x: g.p.x - dir.x * 3, z: g.p.z - dir.z * 3, dx: dir.x, dz: dir.z, cooldown: 0 },
  ];
  g.world._collisionCache = null;
  return g.world.afterCombat(g.bodies, g.world.soft, dt);
}

test('archer shoots straight along each cardinal axis and swept arrows kill without tunnelling', () => {
  for (const dir of [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ]) {
    const g = scene(),
      events = shoot(g, dir);
    assert.equal(g.p.state, 'dead');
    assert.equal(g.p.deathReason, 'arrow');
    assert.equal(g.p.deaths, 1);
    assert.ok(events.some((e) => e.type === 'death' && e.reason === 'arrow'));
    assert.equal(g.world.arrows.length, 0);
  }
  const g = scene();
  g.p.z += 0.7;
  g.world.archers = [{ x: 2, z: 5, dx: 1, dz: 0, cooldown: 0 }];
  g.world.afterCombat(g.bodies, null, 0.7);
  assert.equal(g.p.state, 'alive', 'archer must not aim diagonally towards an off-lane target');
  assert.equal(g.world.arrows[0].z, 5);
});

test('only a living jelly on the same floor automatically picks up the shield', () => {
  const g = scene();
  g.world.pickups = [{ id: 'shield', kind: 'shield', x: 5, z: 5, holder: null }];
  for (const invalid of [{ state: 'dead' }, { kind: 'crate' }, { y: 1 }]) {
    Object.assign(g.p, { state: 'alive', kind: undefined, y: 0, shield: null }, invalid);
    assert.equal(g.world.afterCombat(g.bodies, null, 0).length, 0);
    assert.equal(g.world.pickups[0].holder, null);
  }
  Object.assign(g.p, { state: 'alive', kind: undefined, y: 0 });
  const events = g.world.afterCombat(g.bodies, null, 0);
  assert.equal(g.p.shield, 'shield');
  assert.equal(g.world.pickups[0].holder, 0);
  assert.ok(events.some((e) => e.type === 'pickup'));
});

test('equipped shield blocks only incoming frontal arrows in all four orientations', () => {
  for (const dir of [
    { x: 1, z: 0 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ]) {
    const g = scene();
    Object.assign(g.p, { shield: 'shield', facingX: -dir.x, facingZ: -dir.z });
    const events = shoot(g, dir);
    assert.equal(g.p.state, 'alive');
    assert.ok(events.some((e) => e.type === 'arrowBlock'));
    assert.equal(g.world.arrows.length, 0, 'blocked arrow must be consumed');
  }
  for (const face of [
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: 0, z: -1 },
  ]) {
    const g = scene();
    Object.assign(g.p, { shield: 'shield', facingX: face.x, facingZ: face.z });
    shoot(g);
    assert.equal(g.p.state, 'dead', 'back and side hits bypass the shield');
  }
});

test('facing follows world-space movement input, retains its face at rest and handles diagonals', () => {
  const g = scene();
  for (const input of [
    { x: 1, z: 0 },
    { x: 0, z: -1 },
    { x: -1, z: 0 },
    { x: 0, z: 1 },
  ]) {
    g.world.beforeCombat(g.bodies, [input], 0.01);
    assert.deepEqual([g.p.facingX, g.p.facingZ], [input.x, input.z]);
    g.world.beforeCombat(g.bodies, [], 0.01);
    assert.deepEqual([g.p.facingX, g.p.facingZ], [input.x, input.z]);
  }
  g.world.beforeCombat(g.bodies, [{ x: 1, z: 1 }], 0.01);
  assert.deepEqual([g.p.facingX, g.p.facingZ], [0, 1]);
  g.world.beforeCombat(g.bodies, [{ x: -1, z: -1 }], 0.01);
  assert.deepEqual([g.p.facingX, g.p.facingZ], [0, -1]);
});

test('nearest wall, raised floor or crate stops the arrow before the jelly; other floors remain safe', () => {
  for (const blocker of ['wall', 'raised floor', 'crate']) {
    const g = scene();
    if (blocker === 'wall') g.world.obstacles.push({ x: 4, z: 5, half: 0.3, height: 1 });
    else if (blocker === 'raised floor') g.world.heights.set('4,5', 1);
    else g.bodies.push({ kind: 'crate', state: 'alive', x: 4, z: 5, y: 0 });
    const events = shoot(g);
    assert.equal(g.p.state, 'alive', blocker);
    assert.equal(g.world.arrows.length, 0);
    assert.ok(events.some((e) => e.type === 'arrowImpact'));
  }
  const g = scene();
  g.p.y = 1;
  shoot(g);
  assert.equal(g.p.state, 'alive');
  const h = scene(),
    rear = { ...h.p, x: 6 };
  h.bodies.push(rear);
  shoot(h);
  assert.equal(h.p.state, 'dead');
  assert.equal(rear.state, 'alive', 'one arrow cannot kill two bodies');
});

test('shield returns to its pickup when the owner falls or dies, and combat snapshots restore projectiles and ownership', () => {
  const g = scene();
  g.world.pickups = [{ id: 'shield', kind: 'shield', x: 5, z: 5, holder: null }];
  g.world.afterCombat(g.bodies, null, 0);
  g.world.beforeCombat(g.bodies, [{ x: -1, z: 0 }], 0.01);
  g.world.archers = [{ x: 2, z: 5, dx: 1, dz: 0, cooldown: 0.6, shotFlash: 0.1 }];
  g.world.arrows = [{ x: 3, y: 0.5, z: 5, dx: 1, dz: 0, speed: 5.5, life: 3 }];
  const snapshot = g.world.featureSnapshot();
  g.p.state = 'falling';
  g.world.beforeCombat(g.bodies, [], 0.1);
  assert.equal(g.p.shield, null);
  assert.equal(g.world.pickups[0].holder, null);
  g.world.resetFeatures();
  assert.equal(g.world.arrows.length, 0);
  g.world.restoreFeatures(snapshot);
  assert.deepEqual(g.world.featureSnapshot(), snapshot);
  Object.assign(g.p, { state: 'alive', shield: 'shield', facingX: 1, facingZ: 0 });
  g.world.afterCombat(g.bodies, null, 0.7);
  assert.equal(g.p.state, 'dead');
  assert.equal(g.p.shield, null);
  assert.equal(g.world.pickups[0].holder, null);
});

test('real soft-body step takes arrow damage and respawns, and archer body has a level collider', () => {
  const g = scene();
  g.world.soft = new System();
  g.world.archers = [{ x: 2, z: 5, dx: 1, dz: 0, cooldown: 0, interval: 20 }];
  const events = [];
  for (let i = 0; i < 180; i++) events.push(...g.world.step(g.bodies, []));
  assert.ok(events.some((e) => e.type === 'death' && e.reason === 'arrow'));
  assert.ok(events.some((e) => e.type === 'respawn'));
  assert.equal(g.p.state, 'alive');
  assert.ok(g.world.debugBoxes().some((b) => b.kind === 'archer' && b.x === 2 && b.maxY === 1.2));
});

test('projectiles are bounded and expire in an open firing lane', () => {
  const g = scene();
  g.p.z = 8;
  g.world.archers = [{ x: 1, z: 5, dx: 1, dz: 0, cooldown: 0, interval: 0.05 }];
  for (let i = 0; i < 1000; i++) {
    g.world.beforeCombat(g.bodies, [], 0.01);
    g.world.afterCombat(g.bodies, null, 0.01);
    assert.ok(g.world.arrows.length <= 12);
  }
  g.world.archers = [];
  for (let i = 0; i < 410; i++) g.world.afterCombat(g.bodies, null, 0.01);
  assert.equal(g.world.arrows.length, 0);
});

test('third arrow breaks the shield after blocking that hit; a fourth arrow kills and reset restores the pickup', () => {
  const g = scene();
  g.world.pickups = [{ id: 'shield', kind: 'shield', x: 5, z: 5, holder: null }];
  g.world.afterCombat(g.bodies, null, 0);
  Object.assign(g.p, { facingX: -1, facingZ: 0 });
  for (let hit = 1; hit <= 3; hit++) {
    const events = shoot(g);
    assert.ok(events.some((e) => e.type === 'arrowBlock' && e.durability === 3 - hit));
    assert.equal(g.p.state, 'alive');
    assert.equal(g.p.shieldHP, 3 - hit);
    assert.equal(g.world.pickups[0].durability, 3 - hit);
    assert.equal(
      events.some((e) => e.type === 'shieldBreak'),
      hit === 3,
    );
  }
  assert.equal(g.p.shield, null);
  assert.equal(g.world.pickups[0].destroyed, true);
  g.world.afterCombat(g.bodies, null, 0);
  assert.equal(g.p.shield, null, 'a broken shield cannot be picked up again');
  shoot(g);
  assert.equal(g.p.state, 'dead');
  g.world.resetFeatures();
  assert.equal(g.world.pickups[0].destroyed, false);
  assert.equal(g.world.pickups[0].durability, 3);
});

test('bash launches a jelly over one intervening tile, ignores held movement in flight and lands on the far bank', () => {
  const g = scene();
  g.world.soft = new System();
  for (let z = 0; z < 12; z++) g.world.floor.delete(`6,${z}`);
  const attacker = {
    ...g.p,
    x: 4.02,
    shield: 'shield',
    shieldHP: 3,
    facingX: 1,
    facingZ: 0,
    vx: 1,
  };
  g.p.sword = 'sword';
  g.bodies = [attacker, g.p];
  g.bodies.forEach((p) => g.world.soft.get(p));
  const events = g.world.afterCombat(g.bodies, g.world.soft, 0);
  assert.ok(events.some((e) => e.type === 'shieldBash' && e.target === 1));
  assert.equal(g.p.state, 'falling');
  let peak = 0,
    landed = false;
  for (let i = 0; i < 180 && !landed; i++) {
    const step = g.world.step(g.bodies, [
      { x: 0, z: 0 },
      { x: -1, z: 0 },
    ]);
    peak = Math.max(peak, g.p.y);
    landed = step.some((e) => e.type === 'land' && e.player === 1);
  }
  assert.ok(landed);
  assert.ok(peak > 1.2);
  assert.ok(Math.abs(g.p.x - 7) < 0.25, `landing x=${g.p.x}`);
  assert.equal(g.p.launchTimer, 0);
  assert.equal(g.p.sword, 'sword', 'airborne passengers retain equipment');
});

test('bash only triggers on a forward push and the thrown jelly still collides with a wall', () => {
  for (const override of [{ vx: 0 }, { facingX: -1 }, { z: 6 }, { y: 1 }]) {
    const g = scene(),
      attacker = { ...g.p, x: 4.02, shield: 'shield', facingX: 1, facingZ: 0, vx: 1, ...override };
    g.bodies = [attacker, g.p];
    assert.equal(
      g.world.afterCombat(g.bodies, null, 0).some((e) => e.type === 'shieldBash'),
      false,
    );
  }
  const g = scene();
  g.world.soft = new System();
  g.world.obstacles.push({ x: 6, z: 5, half: 0.5, height: 3 });
  const attacker = { ...g.p, x: 4.02, shield: 'shield', facingX: 1, facingZ: 0, vx: 1 };
  g.bodies = [attacker, g.p];
  g.world.afterCombat(g.bodies, g.world.soft, 0);
  for (let i = 0; i < 150; i++) g.world.step(g.bodies, []);
  assert.ok(g.p.x < 5.35, 'wall must stop the physical flight');
  assert.equal(g.p.state, 'alive');
});

test('sword auto-equips in the active slot, kills a frontal skeleton and restores it after exactly five seconds', () => {
  const g = scene();
  g.world.pickups = [{ id: 'sword', kind: 'sword', x: 5, z: 5, holder: null }];
  g.world.afterCombat(g.bodies, null, 0);
  assert.equal(g.p.sword, 'sword');
  assert.equal(g.p.shield, undefined);
  Object.assign(g.p, { facingX: 1, facingZ: 0 });
  g.world.archers = [{ x: 6, z: 5, dx: -1, dz: 0, cooldown: 0 }];
  g.world._collisionCache = null;
  const events = g.world.afterCombat(g.bodies, null, 0.01);
  assert.ok(events.some((e) => e.type === 'archerDeath'));
  assert.equal(g.world.archers[0].state, 'dead');
  assert.equal(g.world.arrows.length, 0);
  assert.equal(
    g.world.collisionBoxes().some((b) => b.kind === 'archer'),
    false,
  );
  assert.ok(g.p.attackTime > 0);
  for (let i = 0; i < 99; i++) g.world.beforeCombat(g.bodies, [], 0.05);
  assert.equal(g.world.archers[0].state, 'dead');
  g.world.beforeCombat(g.bodies, [], 0.05);
  assert.equal(g.world.archers[0].state, 'alive');
  assert.equal(g.world.archers[0].respawnTimer, 0);
  assert.ok(g.world.collisionBoxes().some((b) => b.kind === 'archer'));
  assert.equal(g.world.archers[0].cooldown, 1.6);
});

test('sword cannot hit behind, sideways, across a wall or onto a different floor', () => {
  for (const override of [{ facingX: -1 }, { facingX: 0, facingZ: 1 }, { z: 6 }, { y: 1 }]) {
    const g = scene();
    Object.assign(g.p, { sword: 'sword', facingX: 1, facingZ: 0 }, override);
    g.world.archers = [{ x: 6, z: 5, dx: -1, dz: 0, cooldown: 2 }];
    assert.equal(
      g.world.afterCombat(g.bodies, null, 0).some((e) => e.type === 'archerDeath'),
      false,
    );
  }
  const g = scene();
  Object.assign(g.p, { sword: 'sword', facingX: 1, facingZ: 0 });
  g.world.archers = [{ x: 6, z: 5, dx: -1, dz: 0, cooldown: 2 }];
  g.world.obstacles.push({ x: 5.5, z: 5, half: 0.08, height: 1 });
  assert.equal(
    g.world.afterCombat(g.bodies, null, 0).some((e) => e.type === 'archerDeath'),
    false,
  );
  g.world.pickups = [{ id: 'shield', kind: 'shield', x: 5, z: 5, holder: null }];
  g.world.afterCombat(g.bodies, null, 0);
  assert.equal(g.world.pickups[0].holder, null, 'equipped sword occupies the item slot');
});

test('combat snapshots preserve broken shields and the skeleton resurrection clock', () => {
  const g = scene();
  g.world.pickups = [
    { id: 'shield', kind: 'shield', x: 5, z: 5, holder: null, durability: 0, destroyed: true },
  ];
  g.world.archers = [{ x: 6, z: 5, dx: -1, dz: 0, state: 'dead', respawnTimer: 2.3, cooldown: 1 }];
  const saved = g.world.featureSnapshot();
  g.world.resetFeatures();
  g.world.restoreFeatures(saved);
  assert.deepEqual(g.world.featureSnapshot(), saved);
  assert.equal(g.world.archers[0].respawnTimer, 2.3);
  assert.equal(g.world.pickups[0].destroyed, true);
});
