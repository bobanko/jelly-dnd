import { cross, normalize } from '../math.js';
import { box, sphere, rod } from '../mesh.js';
import { pressureSurface } from './mechanisms.js';
export function shieldGeometry() {
  const mesh = [],
    iron = [0.27, 0.28, 0.26],
    wood = [0.44, 0.29, 0.13];
  pressureSurface(
    mesh,
    [0, 0, 0],
    [
      [0, 0],
      [0.27, 0],
      [0.27, 0.052],
      [0, 0.052],
    ],
    wood,
    11,
    0,
    32,
  );
  pressureSurface(
    mesh,
    [0, 0, 0],
    [
      [0.265, 0],
      [0.31, 0],
      [0.31, 0.025],
      [0.3, 0.07],
      [0.27, 0.075],
      [0.265, 0.055],
      [0.265, 0],
    ],
    iron,
    12,
    0,
    32,
  );
  // Turn the lathed disc upright and give it the oval proportions of an oak shield.
  for (let k = 0; k < mesh.length; k += 12) {
    const y = mesh[k + 1],
      ny = mesh[k + 4];
    mesh[k] *= 0.9;
    mesh[k + 1] = -mesh[k + 2] * 1.1;
    mesh[k + 2] = y;
    mesh[k + 4] = -mesh[k + 5];
    mesh[k + 5] = ny;
    if (mesh[k + 9] === 11) {
      mesh[k + 10] = 0.5 + mesh[k] * 1.6;
      mesh[k + 11] = 0.5 - mesh[k + 1] * 1.4;
    }
  }
  for (const x of [-0.16, -0.08, 0, 0.08, 0.16]) {
    const h = 0.58 * Math.sqrt(1 - (x / 0.245) ** 2);
    box(mesh, [x, 0, 0.054], [0.005, h, 0.003], [0.07, 0.045, 0.02], 0.001, 13, 1);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    sphere(
      mesh,
      [Math.cos(a) * 0.259, Math.sin(a) * 0.318, 0.069],
      [0.013, 0.013, 0.012],
      [0.55, 0.51, 0.38],
      12,
    );
  }
  sphere(mesh, [0, 0, 0.065], [0.085, 0.085, 0.025], iron, 12);
  sphere(mesh, [0, 0, 0.093], [0.047, 0.047, 0.045], [0.46, 0.46, 0.39], 12);
  return mesh;
}
export function arrowGeometry() {
  const mesh = [];
  rod(mesh, [0, 0, -0.34], [0, 0, 0.08], 0.017, [0.46, 0.31, 0.12], 11);
  // Four triangular metal faces form a readable arrowhead, with pale fletching behind.
  const tip = [0, 0, 0.19],
    base = [
      [0.042, 0, 0.06],
      [0, 0.042, 0.06],
      [-0.042, 0, 0.06],
      [0, -0.042, 0.06],
    ];
  for (let i = 0; i < 4; i++) {
    const a = base[i],
      b = base[(i + 1) % 4],
      normal = normalize(
        cross(
          b.map((v, k) => v - a[k]),
          tip.map((v, k) => v - a[k]),
        ),
      );
    for (const p of [a, b, tip]) mesh.push(...p, ...normal, 0.63, 0.64, 0.58, 12, 0, 0);
  }
  for (const a of [0, Math.PI / 2]) {
    const from = mesh.length;
    box(mesh, [0, 0.035, -0.27], [0.012, 0.08, 0.12], [0.7, 0.65, 0.5], 0.002, 1, 1);
    for (let k = from; k < mesh.length; k += 12)
      for (const offset of [0, 3]) {
        const x = mesh[k + offset],
          y = mesh[k + offset + 1];
        mesh[k + offset] = x * Math.cos(a) - y * Math.sin(a);
        mesh[k + offset + 1] = x * Math.sin(a) + y * Math.cos(a);
      }
  }
  return mesh;
}
export function swordGeometry() {
  const mesh = [],
    steel = [0.57, 0.63, 0.64],
    gold = [0.55, 0.34, 0.085];
  box(mesh, [0, -0.235, 0], [0.05, 0.18, 0.052], [0.105, 0.055, 0.024], 0.008, 13, 2);
  sphere(mesh, [0, -0.335, 0], [0.044, 0.04, 0.04], gold, 12);
  box(mesh, [0, -0.13, 0], [0.25, 0.048, 0.065], gold, 0.013, 12, 2);
  // Diamond section blade, with bevels meeting along a central ridge.
  const section = [
    [-0.057, 0],
    [0, 0.025],
    [0.057, 0],
    [0, -0.025],
  ];
  for (let j = 0; j < 4; j++) {
    const a = section[j],
      b = section[(j + 1) % 4],
      lo = [a[0], -0.1, a[1]],
      hi = [a[0], 0.43, a[1]],
      next = [b[0], 0.43, b[1]],
      bottom = [b[0], -0.1, b[1]],
      tip = [0, 0.61, 0];
    for (const tri of [
      [lo, hi, next],
      [lo, next, bottom],
      [hi, tip, next],
    ]) {
      const n = normalize(
        cross(
          tri[1].map((v, k) => v - tri[0][k]),
          tri[2].map((v, k) => v - tri[0][k]),
        ),
      );
      for (const p of tri) mesh.push(...p, ...n, ...steel, 12, 0, 0);
    }
  }
  sphere(mesh, [0, -0.13, 0.038], [0.022, 0.022, 0.011], [0.12, 0.42, 0.8], 4);
  return mesh;
}
