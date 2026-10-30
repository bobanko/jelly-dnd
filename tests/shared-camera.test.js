import Levels from '../src/world/levels.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { target } from '../src/camera/shared-camera.js';
import * as GPU from '../src/renderer/index.js';
const map = {
  blocks: [
    { x: 1, z: 1 },
    { x: 6, z: 6 },
  ],
};
const p = (x, z, y = 0) => ({ x, z, y, state: 'alive' });
test('shared camera widens for separated heroes and fits the full roster at every angle and aspect', () => {
  for (const mode of ['ortho', 'perspective'])
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
    ])
      for (let q = 0; q < 4; q++) {
        const camera = { mode, pitch: 55, fov: 45 },
          angle = (q * Math.PI) / 2;
        const near = target([p(3, 4), p(4, 4)], map, camera, angle, width, height),
          players = [p(1, 1), p(6, 6)];
        const far = target(players, map, camera, angle, width, height);
        assert.ok(near.zoom >= far.zoom);
        const frame = GPU.cameraFrame(
          { ...camera, ...far },
          angle,
          width,
          height,
          Math.min(width / 16, height / 12) * far.zoom,
        );
        for (const player of players)
          for (const y of [0, 1]) {
            const projected = GPU.projectPoint(frame, player.x, y, player.z, width, height);
            assert.ok(projected.visible);
            assert.ok(projected.x > width * 0.12 && projected.x < width * 0.88);
            assert.ok(projected.y > height * 0.08 && projected.y < height * 0.86);
          }
      }
});
test('first-level camera keeps the roster framed throughout a complete orbit', () => {
  const L = Levels,
    level = L.standardLevel(1),
    players = level.spawns.filter(Boolean).map((p) => ({ ...p, state: 'alive' }));
  for (const mode of ['perspective', 'ortho'])
    for (const [w, h] of [
      [1280, 800],
      [390, 844],
    ]) {
      const camera = { mode, pitch: 55, fov: 45 };
      for (let step = 0; step < 64; step++) {
        const angle = (step * Math.PI) / 32,
          result = target(players, level, camera, angle, w, h);
        const frame = GPU.cameraFrame(
          { ...camera, ...result },
          angle,
          w,
          h,
          Math.min(w / 16, h / 12) * result.zoom,
        );
        for (const p of players) {
          const q = GPU.projectPoint(frame, p.x, p.y + 0.42, p.z, w, h);
          assert.ok(q.visible && q.x > 0 && q.x < w && q.y > 0 && q.y < h);
        }
      }
    }
});
test('on a landscape display, spreading out widens the camera', () => {
  const camera = { mode: 'perspective', pitch: 55, fov: 45 };
  assert.ok(
    target([p(3, 4), p(4, 4)], map, camera, 0, 1280, 800).zoom >
      target([p(1, 1), p(6, 6)], map, camera, 0, 1280, 800).zoom,
  );
});

test('zoom changes continuously as heroes spread apart', () => {
  for (const mode of ['perspective', 'ortho'])
    for (const [width, height] of [
      [1280, 800],
      [390, 844],
    ]) {
      const camera = { mode, pitch: 55, fov: 45 };
      let previous = target([p(3, 4), p(4, 4)], map, camera, 0, width, height).zoom;
      for (let step = 1; step <= 1000; step++) {
        const distance = step * 0.005;
        const current = target(
          [p(3 - distance, 4), p(4 + distance, 4)],
          map,
          camera,
          0,
          width,
          height,
        ).zoom;
        assert.ok(current <= previous + 0.0002, 'spreading out never zooms in');
        assert.ok(previous - current < 0.01, 'small movements never trigger a zoom step');
        previous = current;
      }
    }
});
test('shared camera uses height of the group and respawn positions instead of following a fall into the void', () => {
  const camera = { mode: 'perspective', pitch: 55, fov: 45 };
  const high = target([p(3, 3, 3), p(4, 4, 3)], map, camera, 0, 1280, 800);
  assert.equal(high.targetY, 3);
  const falling = { ...p(4, 4, -20), state: 'falling', spawn: { x: 4, z: 4, y: 0 } };
  const result = target([p(2, 2), falling], map, camera, 0, 1280, 800);
  assert.deepEqual(result, target([p(2, 2), p(4, 4)], map, camera, 0, 1280, 800));
  assert.ok(result.zoom > 0);
});

test('full-level overview is the zoom-out limit and close parties get exactly 50 percent more zoom', () => {
  const level = {
    blocks: [
      { x: 0, z: 0, y: 0 },
      { x: 10, z: 10, y: 0 },
      { x: 10, z: 0, y: 0 },
      { x: 0, z: 10, y: 0 },
      { x: 0, z: 10, y: 4 },
    ],
  };
  for (const mode of ['ortho', 'perspective'])
    for (const [w, h] of [
      [1280, 800],
      [390, 844],
    ])
      for (let turn = 0; turn < 4; turn++) {
        const camera = { mode, pitch: 55, fov: 45 },
          angle = (turn * Math.PI) / 2;
        const far = target([p(0, 0), p(10, 10)], level, camera, angle, w, h);
        const alsoFar = target([p(0, 10), p(10, 0)], level, camera, angle, w, h);
        const close = target([p(5, 5), p(5.5, 5)], level, camera, angle, w, h);
        const solo = target([p(5, 5)], level, camera, angle, w, h);
        const midway = target([p(2, 2), p(8, 8)], level, camera, angle, w, h);
        assert.ok(
          midway.zoom > far.zoom && midway.zoom < close.zoom,
          'intermediate separation blends the two zoom limits',
        );
        assert.ok(
          Math.abs(far.zoom - alsoFar.zoom) < 0.001,
          'overview stays fixed as distant heroes move',
        );
        assert.ok(
          Math.abs(close.zoom / far.zoom - 1.5) < 0.001,
          'close limit is 150 percent of overview scale',
        );
        assert.equal(solo.zoom, close.zoom);
        const frame = GPU.cameraFrame(
          { ...camera, ...far },
          angle,
          w,
          h,
          Math.min(w / 16, h / 12) * far.zoom,
        );
        for (const block of level.blocks)
          for (const dx of [-0.5, 0.5])
            for (const dz of [-0.5, 0.5])
              for (const y of [block.y - 1, block.y]) {
                const q = GPU.projectPoint(frame, block.x + dx, y, block.z + dz, w, h);
                assert.ok(
                  q.visible && q.x > w * 0.1 && q.x < w * 0.9 && q.y > h * 0.08 && q.y < h * 0.86,
                  'overview includes distant columns',
                );
              }
      }
});

test('long formations use the available screen width instead of fitting an empty circle', () => {
  for (const mode of ['ortho', 'perspective']) {
    const camera = { mode, pitch: 55, fov: 45 },
      players = [p(-7, 7), p(7, -7)];
    const across = target(players, map, camera, 0, 1280, 800);
    const frame = GPU.cameraFrame(
      { ...camera, ...across },
      0,
      1280,
      800,
      Math.min(1280 / 16, 800 / 12) * across.zoom,
    );
    const projected = players.map((p) => GPU.projectPoint(frame, p.x, p.y + 0.42, p.z, 1280, 800));
    assert.ok(Math.abs(projected[1].x - projected[0].x) > 1280 * 0.55, 'party fills the width');
  }
});

test('first-level overview fits masonry with balanced vertical margins throughout an orbit', () => {
  const level = Levels.standardLevel(1),
    players = [p(4.5, 5.5), p(8.5, 8.5)];
  for (const mode of ['ortho', 'perspective'])
    for (const [w, h] of [
      [1280, 800],
      [877, 955],
      [390, 844],
    ])
      for (let step = 0; step < 16; step++) {
        const camera = { mode, pitch: 55, fov: 45 },
          angle = (step * Math.PI) / 8;
        const result = target(players, level, camera, angle, w, h);
        const frame = GPU.cameraFrame(
          { ...camera, ...result },
          angle,
          w,
          h,
          Math.min(w / 16, h / 12) * result.zoom,
        );
        const projected = level.blocks.flatMap((p) =>
          [-0.5, 0.5].flatMap((dx) =>
            [-0.5, 0.5].flatMap((dz) =>
              [p.y - 1, p.y].map((y) => GPU.projectPoint(frame, p.x + dx, y, p.z + dz, w, h)),
            ),
          ),
        );
        for (const q of projected) {
          assert.ok(q.visible);
          assert.ok(q.x > w * 0.1 && q.x < w * 0.9);
          assert.ok(q.y > h * 0.08 && q.y < h * 0.86, 'columns and floor stay inside the frame');
        }
        const top = Math.min(...projected.map((q) => q.y)) / h,
          bottom = 1 - Math.max(...projected.map((q) => q.y)) / h;
        assert.ok(Math.abs(top - bottom) < 0.2, 'no large empty margin opposite clipped columns');
      }
});

test('camera visibly follows the party while nearby first-level geometry stays unchanged', () => {
  const level = Levels.standardLevel(1),
    players = level.spawns.filter(Boolean);
  for (const mode of ['ortho', 'perspective'])
    for (const axis of ['x', 'z'])
      for (let turn = 0; turn < 4; turn++) {
        const camera = { mode, pitch: 55, fov: 45 },
          angle = (turn * Math.PI) / 2,
          w = 1280,
          h = 800;
        const before = target(players, level, camera, angle, w, h);
        const moved = players.map((p) => ({ ...p, [axis]: p[axis] - 1 }));
        const after = target(moved, level, camera, angle, w, h);
        assert.ok(
          before[axis] - after[axis] > 0.6,
          'target follows the party rather than staying on the level centre',
        );
        const landmark = (t) =>
          GPU.projectPoint(
            GPU.cameraFrame({ ...camera, ...t }, angle, w, h, Math.min(w / 16, h / 12) * t.zoom),
            6,
            0,
            7,
            w,
            h,
          );
        const a = landmark(before),
          b = landmark(after);
        assert.ok(
          Math.hypot(a.x - b.x, a.y - b.y) > 15,
          'visible follow motion is not cancelled by frame correction',
        );
        const frame = GPU.cameraFrame(
          { ...camera, ...after },
          angle,
          w,
          h,
          Math.min(w / 16, h / 12) * after.zoom,
        );
        for (const p of moved) {
          const q = GPU.projectPoint(frame, p.x, p.y + 0.42, p.z, w, h);
          assert.ok(
            q.visible && q.x > w * 0.1 && q.x < w * 0.9 && q.y > h * 0.08 && q.y < h * 0.86,
          );
        }
      }
});

test('small party movements do not switch scenery bounds abruptly', () => {
  const level = {
      blocks: [
        { x: 0, z: 0, y: 0 },
        { x: 6, z: 0, y: 4 },
      ],
    },
    camera = { mode: 'perspective', pitch: 55, fov: 45 };
  const a = target([p(-0.001, 0)], level, camera, 0, 1280, 800),
    b = target([p(0.001, 0)], level, camera, 0, 1280, 800);
  for (const key of ['x', 'z', 'frameY', 'zoom'])
    assert.ok(Math.abs(a[key] - b[key]) < 0.01, key + ' must not jump as a column enters range');
});
