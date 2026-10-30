import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/editor/editor-space.js';
import * as GPU from '../src/renderer/index.js';
import L from '../src/world/levels.js';
const make = (mode, angle, pitch = 50) =>
  S.frame({ x: 4, z: 4, mode, pitch, fov: 55 }, angle, 1100, 800, 60);
const rayAt = (f, p) => {
  const q = GPU.projectPoint(f, ...p, 1100, 800);
  return S.ray(f, q.x, q.y, 1100, 800);
};

test('editor rays invert game projection at arbitrary rotations, pitches and platform heights', () => {
  for (const mode of ['ortho', 'perspective'])
    for (const angle of [0, 0.37, 1.8, Math.PI, 5.4])
      for (const pitch of [20, 50, 85])
        for (const y of [0, 1, 3]) {
          const f = make(mode, angle, pitch),
            p = [3.2, y, 5.1],
            hit = S.plane(rayAt(f, p), y);
          assert.ok(hit && Math.hypot(...hit.position.map((v, k) => v - p[k])) < 0.0001);
        }
  assert.equal(S.inverse(new Float32Array(16)), null);
  assert.equal(S.plane({ origin: [0, 0, 0], direction: [1, 0, 0] }, 1), null);
  for (const mode of ['ortho', 'perspective']) {
    const f = S.frame({ x: 4, z: 4, targetY: 11.5, mode, pitch: 50, fov: 45 }, 0.6, 1100, 800, 60),
      hit = S.plane(rayAt(f, [3, 12, 5]), 12);
    assert.ok(Math.abs(hit.position[0] - 3) < 0.0001 && Math.abs(hit.position[2] - 5) < 0.0001);
    const centre = GPU.projectPoint(f, 4, 11.5, 4, 1100, 800);
    assert.ok(Math.abs(centre.y - 800 * 0.56) < 0.001);
  }
});
test('picking selects visible wall sides and upper props before the hidden floor', () => {
  const map = L.blank();
  map.tiles = [
    { x: 4, z: 4, height: 2 },
    { x: 4, z: 3, height: 0 },
  ];
  map.walls = [{ x: 4, z: 4, base: 2, height: 1.4, half: 0.5 }];
  const f = make('ortho', 0),
    bounds = S.boxes(map),
    wall = S.pick(rayAt(f, [4.49, 2.6, 4.2]), bounds, 16, 0);
  assert.deepEqual([wall.x, wall.z, wall.key], [4, 4, 'walls']);
  map.walls = [];
  map.crates = [{ x: 4, z: 4 }];
  const crate = S.pick(rayAt(f, [4, 2.7, 4]), S.boxes(map), 16, 0);
  assert.equal(crate.key, 'crates');
  assert.deepEqual([crate.x, crate.z], [4, 4]);
  const tile = S.pick(rayAt(f, [4, 2, 4]), S.boxes({ ...map, crates: [] }), 16, 0);
  assert.equal(tile.key, 'tiles');
});
test('empty construction planes and locked drag planes keep strokes stable after geometry changes', () => {
  const map = L.blank(),
    f = make('perspective', 0.76),
    ray = rayAt(f, [6, 2, 6]);
  const empty = S.pick(ray, [], 16, 2);
  assert.deepEqual([empty.x, empty.z], [6, 6]);
  map.tiles = [{ x: 6, z: 6, height: 3 }];
  const locked = S.pick(ray, S.boxes(map), 16, 3, 2);
  assert.deepEqual([locked.x, locked.z], [6, 6]);
  assert.equal(S.pick(rayAt(f, [30, 0, 30]), [], 16, 0), null);
  assert.equal(
    S.boxHit({ origin: [0, 2, 0], direction: [0, -1, 0] }, { min: [3, 0, 3], max: [4, 1, 4] }),
    null,
  );
});
