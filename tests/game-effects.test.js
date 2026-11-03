import Levels from '../src/world/levels.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { System } from '../src/game/game-effects.js';
import { World } from '../src/world/physics.js';
const world = { heightAt: () => 0 },
  players = [{}],
  soft = {
    get: () => ({
      positions: [
        [2, 0.05, 3],
        [2.2, 0.7, 3.1],
      ],
    }),
  };
const death = { type: 'death', reason: 'spikes', player: 0 };
const portal = { type: 'portal', color: 'violet', source: [3, 0, 6], destination: [6, 1, 9] };
const contactBeam = {
  drone: 0,
  from: [0, 1, 3],
  to: [2, 1, 3],
  color: 2,
  hit: -1,
  impact: true,
};

test('laser sparks track the contact point, fly back from it, fall and stop after contact ends', () => {
  const effects = new System(),
    w = { ...world, droneBeams: [structuredClone(contactBeam)] };
  effects.step(0, w);
  assert.equal(effects.particles.length, 0);
  effects.step(0.01, w);
  const first = effects.particles[0],
    startY = first.velocity[1];
  assert.ok(effects.particles.every((p) => p.kind === 'spark' && p.velocity[0] < 0));
  assert.ok(effects.particles.every((p) => Math.abs(p.position[0] - 2) < 0.02));
  effects.step(0.02, w);
  assert.ok(first.position[0] < 1.985);
  assert.ok(first.velocity[1] < startY, 'sparks fall under gravity');
  w.droneBeams[0].to = [4, 1, 5];
  effects.step(0.05, w);
  assert.ok(effects.particles.some((p) => p.age === 0 && Math.abs(p.position[2] - 5) < 0.02));
  w.droneBeams = [];
  for (let i = 0; i < 6; i++) effects.step(0.1, w);
  assert.equal(effects.particles.length, 0);
  assert.equal(effects.laserTimers.size, 0);
});

test('laser spray matches every living jelly colour in sparse parties and skips dead bodies and misses', () => {
  const colors = [
    [0.12, 0.9, 0.16],
    [0.025, 0.17, 1],
    [1, 0.065, 0.035],
    [0.65, 0.1, 1],
    [1, 0.65, 0.035],
  ];
  for (const [slot, color] of colors.entries()) {
    const effects = new System(),
      party = [{ slot, state: 'alive' }],
      w = { ...world, droneBeams: [{ ...contactBeam, hit: 0 }] };
    effects.step(0.01, w, [], party);
    assert.ok(effects.particles.length > 0);
    for (const p of effects.particles) {
      assert.equal(p.kind, 'jelly');
      assert.deepEqual(p.color, color);
    }
    effects.clear();
    party[0].state = 'dead';
    effects.step(0.01, w, [], party);
    assert.equal(effects.particles.length, 0);
    party[0].state = 'alive';
    w.droneBeams[0].impact = false;
    effects.step(0.01, w, [], party);
    assert.equal(effects.particles.length, 0, 'range endpoints do not emit impacts');
  }
});

test('sustained laser effects use a time-based rate, stay bounded and reduce motion', () => {
  const w = { ...world, droneBeams: [contactBeam] },
    fast = new System(),
    slow = new System(),
    reduced = new System({ reducedMotion: true });
  for (let i = 0; i < 60; i++) fast.step(1 / 60, w);
  for (let i = 0; i < 30; i++) slow.step(1 / 30, w);
  assert.equal(fast.seed, slow.seed, 'frame rate does not change the number of emissions');
  for (let i = 0; i < 30; i++) reduced.step(1 / 30, w);
  assert.ok(reduced.particles.length < slow.particles.length);
  w.droneBeams = Array.from({ length: 16 }, (_, drone) => ({ ...contactBeam, drone }));
  for (let i = 0; i < 100; i++) {
    fast.step(0.1, w);
    assert.ok(fast.particles.length <= 160);
  }
  fast.clear();
  assert.equal(fast.particles.length + fast.laserTimers.size, 0);
  fast.step(0.001, w);
  assert.ok(fast.particles.length > 0, 'reset allows immediate emission');
});

test('victory surrounds each jelly with matching magic that expires without moving bodies', () => {
  const effects = new System(),
    party = [
      { x: 2, y: 1, z: 3, slot: 0 },
      { x: 5, y: 2, z: 7, slot: 3 },
    ],
    before = structuredClone(party);
  effects.burst({ type: 'victory' }, party);
  assert.equal(effects.particles.length, 28);
  assert.equal(effects.rings.length, 2);
  assert.equal(effects.runes.length, 6);
  assert.deepEqual(
    effects.rings.map((r) => r.center),
    [
      [2, 1.06, 3],
      [5, 2.06, 7],
    ],
  );
  assert.deepEqual(
    effects.runes.map((r) => r.glyph),
    [0, 0, 0, 3, 3, 3],
  );
  assert.ok(effects.particles.every((p) => p.kind === 'magic' && p.velocity[1] > 0));
  for (let i = 0; i < 16; i++) effects.step(0.1, world);
  assert.equal(effects.particles.length + effects.rings.length + effects.runes.length, 0);
  assert.deepEqual(party, before);
});

test('victory respects reduced motion', () => {
  const effects = new System({ reducedMotion: true });
  effects.burst({ type: 'victory' }, [{ x: 2, z: 3, slot: 0 }]);
  assert.equal(effects.particles.length + effects.rings.length + effects.runes.length, 0);
});

test('spike death splits the jelly into chunks and splash droplets that bounce on the floor', () => {
  const effects = new System();
  effects.burst(death, players, soft);
  assert.equal(effects.particles.length, 10);
  assert.ok(effects.particles.every((p) => p.position[0] >= 2 && p.position[0] <= 2.2));
  // The 27 lattice cells are all used, as single cells or glued blocks of two or four.
  assert.equal(
    effects.chunks.reduce(
      (sum, c) => sum + c.half.reduce((v, h) => v * Math.round(h / 0.11), 1),
      0,
    ),
    27,
  );
  assert.ok(effects.chunks.length >= 7 && effects.chunks.length <= 27);
  const p = effects.particles[0];
  p.position = [2, 0.05, 3];
  p.velocity = [1, -2, 0];
  effects.step(0.02, world);
  assert.ok(p.position[0] > 2 && p.velocity[1] > 0, 'droplet should bounce on the floor');
  for (let i = 0; i < 70; i++) effects.step(0.01, world);
  assert.equal(effects.particles.length, 0);
  assert.ok(effects.chunks.length > 0, 'chunks outlast the droplets');
  for (let i = 0; i < 360; i++) effects.step(0.01, world);
  assert.ok(effects.chunks.length > 0, 'chunks linger for a few seconds');
  for (let i = 0; i < 300; i++) effects.step(0.01, world);
  assert.equal(effects.chunks.length, 0);
});

test('jelly chunks land, settle flat on a face and are stopped by walls', () => {
  const effects = new System(),
    walled = {
      heightAt: () => 0,
      collisionBoxes: () => [{ kind: 'wall', x: 3, z: 3, half: 0.5, minY: 0, maxY: 1 }],
    };
  effects.burst(death, players, soft);
  for (const c of effects.chunks) {
    c.position = [2, 0.6, 3];
    c.velocity = [3, 0, 0];
    c.life = 10;
  }
  for (let i = 0; i < 150; i++) effects.step(0.01, walled);
  for (const c of effects.chunks) {
    const r = c.rotation,
      reach = Math.abs(r[0]) * c.half[0] + Math.abs(r[1]) * c.half[1] + Math.abs(r[2]) * c.half[2];
    assert.ok(c.position[0] + reach <= 2.5 + 1e-6, 'chunk must not pass into the wall');
    const bottom =
      Math.abs(r[3]) * c.half[0] + Math.abs(r[4]) * c.half[1] + Math.abs(r[5]) * c.half[2];
    assert.ok(Math.abs(c.position[1] - bottom) < 0.01, 'chunk rests on the floor');
    assert.ok(Math.max(...[3, 4, 5].map((k) => Math.abs(r[k]))) > 0.99, 'chunk lies on a face');
  }
});

test('a living jelly shoves chunks out of its way without being touched itself', () => {
  const effects = new System(),
    body = { core: [1, 0.42, 3], r: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: 0.315, rounding: 0.045 },
    alive = [{ state: 'alive' }],
    lattice = { get: (p) => (p === alive[0] ? body : soft.get()) };
  effects.burst(death, players, lattice);
  const chunk = effects.chunks[0];
  effects.chunks = [chunk];
  chunk.position = [1.7, 0.2, 3];
  chunk.velocity = [0, 0, 0];
  chunk.omega = [0, 0, 0];
  chunk.rotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  chunk.half = [0.11, 0.11, 0.11];
  const before = structuredClone(body);
  effects.step(0.01, world, [], alive);
  // The jelly slides towards the chunk at 3 units per second.
  for (let i = 0; i < 20; i++) {
    body.core[0] += 0.03;
    effects.step(0.01, world, [], alive);
    assert.ok(chunk.position[0] - body.core[0] >= 0.36 + 0.099 - 1e-6, 'chunk stays outside');
  }
  assert.ok(chunk.velocity[0] > 2, 'chunk is carried along');
  assert.deepEqual(body.r, before.r);
  assert.equal(body.half, before.half);
});

test('void death breaks the fallen lattice into scraps without snapping them up onto the level', () => {
  const effects = new System(),
    fallen = [{ respawnTimer: 0.55 }],
    lattice = {
      get: () => ({
        positions: [
          [2, -4, 3],
          [2.2, -3.5, 3.1],
        ],
      }),
    };
  effects.burst({ type: 'death', player: 0 }, fallen, lattice);
  assert.equal(effects.particles.length, 10);
  assert.ok(effects.particles.every((p) => p.position[1] < -3));
  assert.ok(effects.chunks.every((c) => c.position[1] < -3));
  for (const p of effects.particles) p.velocity[1] = -1;
  for (const c of effects.chunks) c.velocity[1] = -1;
  effects.step(0.05, world);
  assert.ok(
    [...effects.particles, ...effects.chunks].every((p) => p.position[1] < -3),
    'underground pieces must not bounce to the floor above',
  );
  for (let n = 0; n < 11; n++) effects.step(0.05, world);
  assert.equal(effects.particles.length, 0);
});
test('teleport emits both endpoints at their own floor height and has a bounded lifetime', () => {
  const effects = new System();
  effects.burst(portal, players, soft);
  assert.deepEqual(
    effects.rings.map((r) => r.center),
    [portal.source, portal.destination],
  );
  // 14 sparks per endpoint, 14 collapsing at the entrance and a 26-spark wisp to the exit.
  assert.equal(effects.particles.length, 68);
  for (let i = 0; i < 8; i++) effects.step(0.1, world);
  assert.equal(effects.rings.length + effects.particles.length, 0);
});

test('crate teleport uses the same travelling portal wisp without starting a jelly warp', () => {
  const effects = new System(),
    event = { ...portal, player: 1, crate: true };
  effects.burst(event, players, soft);
  assert.equal(effects.warpScale(1), 1);
  assert.equal(effects.particles.filter((p) => p.kind === 'wisp').length, 26);
  assert.equal(effects.particles.length, 68);
  assert.deepEqual(
    effects.rings.map((ring) => ring.center),
    [portal.source, portal.destination],
  );
  assert.ok(
    effects.particles.some(
      (particle) => particle.kind === 'wisp' && String(particle.color) === '1,0.97,0.9',
    ),
  );
});

test('teleport particles and rings match every portal colour', () => {
  for (const color of Levels.portalColors) {
    const effects = new System();
    effects.burst({ ...portal, color: color.id }, players, soft);
    assert.ok(effects.rings.length && effects.particles.length);
    for (const p of effects.rings) assert.deepEqual(p.color, color.glow);
    assert.ok(
      effects.particles.filter(
        (p) => p.color === color.glow || String(p.color) === String(color.glow),
      ).length >= 28,
      'endpoint sparks and most of the wisp take the portal colour',
    );
  }
});
test('effects stay bounded during bursts and respect reduced motion', () => {
  const effects = new System();
  for (let i = 0; i < 30; i++) effects.burst(portal, players, soft);
  assert.equal(effects.particles.length, 160);
  assert.equal(effects.rings.length, 8);
  effects.clear();
  assert.equal(effects.rings.length + effects.particles.length, 0);
  const reduced = new System({ reducedMotion: true });
  reduced.burst(portal, players, soft);
  assert.equal(reduced.particles.length, 0);
  reduced.burst(death, players, soft);
  assert.equal(reduced.particles.length, 6);
  assert.equal(reduced.chunks.length, 0);
  for (let i = 0; i < 4; i++) reduced.step(0.1, world);
  assert.equal(reduced.rings.length + reduced.particles.length, 0);
});

const goals = [
  { x: 2, z: 2 },
  { x: 4, y: 1, z: 2 },
  { x: 6, z: 2 },
];
const goalWorld = new World(new Set(['2,2', '4,2', '6,2']), [], []);
const finishPlayers = () => goals.map((g) => ({ ...g, y: g.y || 0, state: 'alive' }));

test('fifth yellow finish emits a distinct rune and yellow jelly death particles have a valid tint', () => {
  const effects = new System(),
    goal = { x: 2, z: 2, slot: 4 },
    player = { x: 2, z: 2, y: 0, slot: 4, state: 'alive' };
  effects.step(0.01, goalWorld, [goal], [player]);
  assert.equal(effects.runes[0].glyph, 4);
  assert.deepEqual(effects.runes[0].color, [1, 0.65, 0.025]);
  effects.burst({ type: 'death', reason: 'spikes', player: 0 }, [player], soft);
  assert.ok(effects.particles.length > 0);
  assert.ok(
    effects.particles.every((p) => Array.isArray(p.color) && p.color.every(Number.isFinite)),
  );
});

test('matching finishes emit their own coloured glyphs at floor height and keep rising', () => {
  const effects = new System(),
    party = finishPlayers();
  effects.step(0.01, goalWorld, goals, party);
  assert.deepEqual(
    effects.runes.map((p) => p.glyph),
    [0, 1, 2],
  );
  assert.deepEqual(
    effects.runes.map((p) => p.position[1]),
    [0.07, 1.07, 0.07],
  );
  assert.equal(new Set(effects.runes.map((p) => p.color.join(','))).size, 3);
  const first = effects.runes[0],
    start = first.position[1];
  for (let i = 0; i < 10; i++) effects.step(0.1, goalWorld, goals, party);
  assert.ok(first.position[1] > start + 0.7);
  assert.ok(effects.runes.length > 3, 'standing on a finish sustains the stream');
});

test('finish particles require the matching living jelly on the correct floor', () => {
  const effects = new System(),
    party = finishPlayers();
  [party[0], party[2]] = [party[2], party[0]];
  party[1].y = 0;
  effects.step(0.1, goalWorld, goals, party);
  assert.equal(effects.runes.length, 0);
  const invalid = finishPlayers();
  invalid[0].state = 'dead';
  invalid[1].kind = 'crate';
  invalid[2].y = 1;
  effects.step(0.1, goalWorld, goals, invalid);
  assert.equal(effects.runes.length, 0);
});

test('leaving stops emission, existing glyphs expire, and reset allows immediate re-entry', () => {
  const effects = new System(),
    party = finishPlayers();
  effects.step(0.1, goalWorld, goals, party);
  const first = effects.runes[0];
  party.forEach((p) => (p.z += 2));
  effects.step(0.1, goalWorld, goals, party);
  assert.equal(effects.runes.length, 3);
  assert.ok(first.age > 0);
  for (let i = 0; i < 25; i++) effects.step(0.1, goalWorld, goals, party);
  assert.equal(effects.runes.length, 0);
  party[0].z -= 2;
  effects.step(0.01, goalWorld, goals, party);
  assert.equal(effects.runes.length, 1);
  effects.clear();
  assert.equal(effects.runes.length, 0);
  effects.step(0.01, goalWorld, goals, party);
  assert.equal(effects.runes.length, 1);
});

test('three persistent rune streams stay bounded and respect reduced motion', () => {
  const effects = new System(),
    party = finishPlayers();
  for (let i = 0; i < 600; i++) {
    effects.step(0.1, goalWorld, goals, party);
    assert.ok(effects.runes.length <= 32);
  }
  assert.ok(
    effects.runes.some((p) => p.age < 0.3),
    'stream keeps spawning during an extended victory',
  );
  const reduced = new System({ reducedMotion: true });
  for (let i = 0; i < 30; i++) reduced.step(0.1, goalWorld, goals, party);
  assert.equal(reduced.runes.length, 0);
});

test('shield splinters fall and expire, while skeleton bones persist and gather on the five-second gameplay clock', () => {
  const effects = new System();
  effects.burst({ type: 'shieldBreak', position: [2, 0.5, 3] }, players, soft);
  assert.ok(effects.particles.every((p) => p.kind === 'wood'));
  for (let i = 0; i < 12; i++) effects.step(0.1, world);
  assert.equal(effects.particles.length, 0);
  const skeletonWorld = {
    heightAt: () => 0,
    archers: [{ x: 2, z: 3, state: 'dead', respawnTimer: 5, dz: 1 }],
  };
  effects.burst(
    { type: 'archerDeath', archer: 0, position: [2, 0, 3], direction: { x: 0, z: 1 } },
    players,
    soft,
  );
  assert.ok(effects.bones.some((p) => p.skull));
  for (let i = 0; i < 25; i++) effects.step(0.1, skeletonWorld);
  const head = effects.bones.find((p) => p.skull);
  assert.ok(head.position[1] < 0.2);
  skeletonWorld.archers[0].respawnTimer = 0.35;
  effects.step(0.01, skeletonWorld);
  const midDistance = Math.hypot(...head.position.map((v, k) => v - head.home[k]));
  skeletonWorld.archers[0].respawnTimer = 0.01;
  effects.step(0.01, skeletonWorld);
  assert.ok(Math.hypot(...head.position.map((v, k) => v - head.home[k])) < midDistance * 0.02);
  skeletonWorld.archers[0].state = 'alive';
  effects.step(0.01, skeletonWorld);
  assert.equal(effects.bones.length, 0);
  skeletonWorld.archers[0].state = 'dead';
  skeletonWorld.archers[0].respawnTimer = 2;
  effects.step(0.01, skeletonWorld);
  assert.ok(effects.bones.length > 0, 'undo to a dead skeleton reconstructs its bone fragments');
  effects.clear();
  assert.equal(effects.bones.length, 0);
});

test('portal hops and respawns hide the jelly, then grow it back with a slight overshoot', () => {
  const effects = new System();
  assert.equal(effects.warpScale(0), 1);
  effects.burst({ ...portal, player: 0 }, players, soft);
  assert.equal(effects.warpScale(0), 0, 'hidden while the wisp travels');
  for (let i = 0; i < 5; i++) effects.step(0.1, world); // steps are capped at 0.1 s
  const growing = effects.warpScale(0);
  assert.ok(growing > 0.5 && growing < 1.2);
  for (let i = 0; i < 5; i++) effects.step(0.1, world);
  assert.equal(effects.warpScale(0), 1);
  effects.burst({ type: 'respawn', player: 0 }, players, soft);
  assert.equal(effects.warpScale(0), 0);
  effects.step(0.1, world);
  assert.ok(effects.warpScale(0) > 0);
  effects.clear();
  assert.equal(effects.warpScale(0), 1);
});

test('landing dust, scuffing dust and sweat drops, all left out with reduced motion', () => {
  const effects = new System(),
    reduced = new System({ reducedMotion: true });
  const land = { type: 'dust', center: [4, 0, 4], half: 0.47, strength: 1 },
    scuff = { type: 'scuff', center: [4, 0, 4], half: 0.47, direction: [1, 0], strength: 1 };
  for (const system of [effects, reduced]) {
    system.burst(land, players, soft);
    for (let n = 0; n < 6; n++) system.burst(scuff, players, soft);
  }
  const dust = effects.particles.filter((p) => p.kind === 'dust');
  assert.ok(dust.length >= 16 + 6, 'a cloud on landing and puffs while sliding');
  // Scuffs come from the sides of the base, not ahead of the moving crate.
  assert.ok(dust.slice(-6).every((p) => p.position[0] < 4 + 0.47 * 0.5));
  assert.equal(reduced.particles.length, 0);
});

test('a sweat drop runs down a jelly face that faces the camera', () => {
  const jelly = { state: 'alive' },
    body = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], core: [2, 0.42, 3] },
    lattice = { get: () => body },
    effects = new System();
  // The camera is off towards +x: the drop goes on the +x face.
  for (let n = 0; n < 8; n++)
    effects.burst({ type: 'sweat', player: 0, toCamera: [1, 0] }, [jelly], lattice);
  effects.step(0.05, world, [], [jelly]);
  const drops = effects.particles.filter((p) => p.kind === 'sweat');
  assert.equal(drops.length, 8);
  assert.ok(
    drops.every((p) => Math.abs(p.position[0] - 2.39) < 1e-9),
    'on the +x face',
  );
  const first = drops.map((p) => p.position[1]);
  effects.step(0.3, world, [], [jelly]);
  assert.ok(
    drops.every((p, i) => p.position[1] < first[i]),
    'they run down',
  );
  // With the jelly gone the drops go too.
  jelly.state = 'dead';
  effects.step(0.01, world, [], [jelly]);
  assert.ok(!effects.particles.some((p) => p.kind === 'sweat'));
  const reduced = new System({ reducedMotion: true });
  reduced.burst({ type: 'sweat', player: 0, toCamera: [1, 0] }, [jelly], lattice);
  assert.equal(reduced.particles.length, 0);
});
