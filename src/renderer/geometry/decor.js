import Levels from '../../world/levels.js';
import { cross, normalize } from '../math.js';
import { box, lowSphere, sphere, rod } from '../mesh.js';
import { arrowGeometry } from './equipment.js';
import { pressureSurface } from './mechanisms.js';
// ===== Decor =====
// Faceted pebble: a jittered octahedron, flat-shaded.
export function pebble(mesh, center, size, color, seed, angle) {
  const jitter = (k) => {
      const s = Math.sin(seed * 91.7 + k * 37.3) * 43758.5453;
      return 0.72 + 0.56 * (s - Math.floor(s));
    },
    c = Math.cos(angle),
    s = Math.sin(angle);
  const axes = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ].map((a, k) => {
    const p = a.map((v, j) => v * size[j] * jitter(k));
    return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c];
  });
  for (const face of [
    [0, 2, 4],
    [4, 2, 1],
    [1, 2, 5],
    [5, 2, 0],
    [4, 3, 0],
    [1, 3, 4],
    [5, 3, 1],
    [0, 3, 5],
  ]) {
    const p = face.map((i) => axes[i]),
      n = normalize(
        cross(
          p[1].map((v, k) => v - p[0][k]),
          p[2].map((v, k) => v - p[0][k]),
        ),
      );
    for (const q of p)
      mesh.push(center[0] + q[0], center[1] + q[1], center[2] + q[2], ...n, ...color, 13, 0, 0);
  }
}
export function decorBone(mesh, center, length, angle, color) {
  const d = [Math.cos(angle) * length * 0.5, 0, Math.sin(angle) * length * 0.5],
    side = [(-d[2] / length) * 0.034, 0, (d[0] / length) * 0.034];
  rod(
    mesh,
    center.map((v, k) => v - d[k]),
    center.map((v, k) => v + d[k]),
    0.026,
    color,
    13,
  );
  for (const end of [-1, 1])
    for (const knob of [-1, 1])
      sphere(
        mesh,
        center.map((v, k) => v + d[k] * end + side[k] * knob),
        [0.023, 0.019, 0.023],
        color,
        13,
        null,
        lowSphere,
      );
}
export function decorSkull(mesh, center, angle, bone) {
  const s = 1.3,
    f = [Math.sin(angle), 0, Math.cos(angle)],
    r = [f[2], 0, -f[0]],
    at = (a, b, c) => center.map((v, k) => v + (r[k] * a + f[k] * c + (k === 1 ? b : 0)) * s),
    dark = [0.02, 0.018, 0.014],
    size = (v) => v.map((x) => x * s);
  sphere(mesh, at(0, 0.07, 0), size([0.075, 0.068, 0.082]), bone, 1, null, lowSphere);
  sphere(mesh, at(0, 0.028, 0.045), size([0.05, 0.026, 0.045]), bone, 13, null, lowSphere);
  for (const side of [-1, 1])
    sphere(
      mesh,
      at(side * 0.03, 0.078, 0.068),
      size([0.021, 0.023, 0.016]),
      dark,
      13,
      null,
      lowSphere,
    );
  sphere(mesh, at(0, 0.052, 0.079), size([0.01, 0.012, 0.008]), dark, 13, null, lowSphere);
}
export function decorArrow(mesh, center, angle) {
  const from = mesh.length,
    c = Math.cos(angle),
    s = Math.sin(angle),
    tilt = 0.06;
  mesh.push(...arrowGeometry());
  for (let k = from; k < mesh.length; k += 12)
    for (const offset of [0, 3]) {
      const x = mesh[k + offset],
        y0 = mesh[k + offset + 1],
        z0 = mesh[k + offset + 2],
        y = y0 * Math.cos(tilt) + z0 * Math.sin(tilt),
        z = -y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
      mesh[k + offset] = (offset ? 0 : center[0]) + x * c + z * s;
      mesh[k + offset + 1] = (offset ? 0 : center[1] + 0.022) + y;
      mesh[k + offset + 2] = (offset ? 0 : center[2]) - x * s + z * c;
    }
}
// A corner web: radial silk strands between two walls, linked by sagging threads.
export function decorWeb(mesh, corner, a, b) {
  const up = [0, 1, 0],
    silk = [0.5, 0.52, 0.54],
    point = (t, h, reach) => {
      const dir = normalize(a.map((v, k) => v * (1 - t) + b[k] * t));
      return corner.map((v, k) => v - dir[k] * reach * (1 - Math.abs(t - 0.5) * 0.5) + up[k] * h);
    };
  const hub = corner.map((v, k) => v + up[k] * 0.3),
    spokes = [0, 0.25, 0.5, 0.75, 1].map((t) => point(t, 0.12 + Math.abs(t - 0.5) * 0.5, 0.42));
  for (const end of spokes) rod(mesh, hub, end, 0.007, silk, 13);
  for (const ring of [0.35, 0.62, 0.86])
    for (let i = 0; i < spokes.length - 1; i++) {
      const p = hub.map((v, k) => v + (spokes[i][k] - v) * ring),
        q = hub.map((v, k) => v + (spokes[i + 1][k] - v) * ring);
      rod(mesh, p, q, 0.005, silk, 13);
    }
}
export function torchDecor(mesh, torch) {
  const from = mesh.length,
    f = Levels.torchFrame(torch),
    iron = [0.085, 0.1, 0.105],
    bronze = [0.4, 0.255, 0.1];
  box(mesh, [0, -0.05, 0.025], [0.18, 0.44, 0.065], iron, 0.02, 12, 2);
  for (const y of [-0.21, 0.11]) sphere(mesh, [0, y, 0.064], [0.026, 0.026, 0.018], bronze, 12);
  rod(mesh, [0, -0.2, 0.065], [0, -0.13, 0.23], 0.035, iron, 12);
  rod(mesh, [0, -0.23, 0.15], [0, 0.1, 0.25], 0.042, [0.22, 0.115, 0.035], 11);
  for (const y of [-0.12, 0.04])
    box(mesh, [0, y, 0.21 + (y + 0.12) * 0.3], [0.11, 0.035, 0.11], bronze, 0.007, 12, 2);
  pressureSurface(
    mesh,
    [0, 0.08, 0.25],
    [
      [0, 0],
      [0.055, 0],
      [0.11, 0.12],
      [0.11, 0.145],
      [0.08, 0.145],
      [0.04, 0.06],
      [0, 0.06],
    ],
    iron,
    12,
    0,
    12,
  );
  sphere(mesh, [0, 0.2, 0.25], [0.082, 0.034, 0.082], [1.25, 0.36, 0.05], 4);
  for (let k = from; k < mesh.length; k += 12)
    for (const off of [0, 3]) {
      const u = mesh[k + off],
        y = mesh[k + off + 1],
        n = mesh[k + off + 2];
      for (let axis = 0; axis < 3; axis++)
        mesh[k + off + axis] =
          (off ? 0 : f.origin[axis]) + f.u[axis] * u + (axis === 1 ? y : 0) + f.n[axis] * n;
    }
}
export function scatterDecor(mesh, level, occupied, recordAssembly) {
  const map = level.definition || {},
    random = (x, y, z, k) => {
      const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.19) * 43758.5453;
      return s - Math.floor(s);
    };
  const taken = new Set(),
    archers = new Set();
  for (const key of [
    'spawns',
    'goals',
    'plates',
    'bridges',
    'lifts',
    'spikes',
    'portals',
    'conveyors',
    'crates',
    'pickups',
    'drones',
  ])
    for (const p of map[key] || [])
      if (p && !(key === 'spikes' && p.face)) taken.add(p.x + ',' + p.z);
  for (const p of map.archers || []) archers.add(p.x + ',' + p.z);
  const bone = [0.5, 0.46, 0.34];
  let skulls = 0,
    arrows = 0,
    webs = 0;
  const sides = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  for (const b of (level.world.blocks || []).filter((b) => b.color === undefined && !b.lava)) {
    const key = b.x + ',' + b.z,
      y = b.y;
    if (occupied.has([b.x, y + 1, b.z].join(',')) || taken.has(key)) continue;
    const from = mesh.length,
      archer = archers.has(key),
      walls = sides.filter(([dx, dz]) => occupied.has([b.x + dx, y + 1, b.z + dz].join(',')));
    const r = (k) => random(b.x, y, b.z, k),
      at = (dx, dz, lift = 0) => [b.x + dx, y + lift, b.z + dz];
    const stone = (k) => [0.33, 0.29, 0.24].map((v) => v * (0.7 + 0.6 * r(k)));
    // Rubble gathers against walls; open floor keeps a few stray pebbles near its edges.
    for (const [dx, dz] of walls)
      if (r(1 + dx * 3 + dz * 5) < 0.65)
        for (let i = 0, count = 2 + Math.floor(r(9 + dx + dz * 2) * 3); i < count; i++) {
          const along = (r(20 + i * 3 + dx + dz * 2) - 0.5) * 0.8,
            size = 0.025 + r(30 + i) * 0.035,
            p = at(dx * (0.38 - size) + dz * along, dz * (0.38 - size) + dx * along, size * 0.3);
          pebble(
            mesh,
            p,
            [size, size * 0.62, size * 0.85],
            stone(40 + i),
            b.x * 7 + b.z * 13 + i,
            r(50 + i) * 6.28,
          );
        }
    if (!walls.length && r(2) < 0.55)
      for (let i = 0; i < 1 + Math.floor(r(3) * 2.2); i++) {
        const a = r(60 + i) * 6.28,
          reach = 0.27 + r(70 + i) * 0.15,
          size = 0.022 + r(80 + i) * 0.03,
          p = at(Math.cos(a) * reach, Math.sin(a) * reach, size * 0.3);
        pebble(mesh, p, [size, size * 0.6, size * 0.8], stone(90 + i), b.x * 5 + b.z * 11 + i, a);
      }
    if (r(4) < (walls.length || archer ? 0.16 : 0.07)) {
      const a = r(5) * 6.28,
        reach = archer ? 0.36 : 0.2;
      decorBone(
        mesh,
        at(Math.cos(a * 1.7) * reach, Math.sin(a * 1.7) * reach, 0.02),
        0.16 + r(6) * 0.06,
        a,
        bone,
      );
    }
    if (skulls < 2 && (walls.length || archer) && r(7) < 0.12) {
      skulls++;
      const [dx, dz] = walls[0] || [1, 0];
      decorSkull(
        mesh,
        at(dx * 0.3 + dz * 0.18, dz * 0.3 - dx * 0.18),
        Math.atan2(-dx, -dz) + (r(8) - 0.5),
        bone,
      );
    }
    // Spent arrows lie near the archers that loosed them.
    if (
      arrows < 2 &&
      !archer &&
      (map.archers || []).some(
        (p) => Math.abs(p.x - b.x) + Math.abs(p.z - b.z) <= 3 && (p.y ?? y) === y,
      ) &&
      r(10) < 0.4
    ) {
      arrows++;
      const a = r(11) * 6.28;
      decorArrow(mesh, at(Math.cos(a) * 0.16, Math.sin(a) * 0.16), a);
    }
    // Inner corners, where two perpendicular walls meet over this cell, may hold a web.
    for (let i = 0; i < 4 && webs < 4; i++) {
      const [ax, az] = sides[i],
        [bx, bz] = sides[(i + 1) % 4];
      if (!walls.includes(sides[i]) || !walls.includes(sides[(i + 1) % 4]) || r(12 + i) > 0.45)
        continue;
      webs++;
      decorWeb(mesh, at((ax + bx) * 0.485, (az + bz) * 0.485), [ax, 0, az], [bx, 0, bz]);
    }
    if (mesh.length > from) recordAssembly?.(mesh, from, b);
  }
}
