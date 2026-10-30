import { cross, normalize } from '../math.js';
import { box, sphere, rod } from '../mesh.js';
import { pressureSurface } from './mechanisms.js';
import { skullGeometry, placeMesh } from './skull.js';
export const beamColors = [
  [0.12, 1, 0.16],
  [0.035, 0.22, 1],
  [1, 0.065, 0.035],
  [0.72, 0.12, 1],
  [1, 0.68, 0.035],
];
// Bubbles rise through a .51-unit column inside each jelly and wrap around.
export const BUBBLES = 7,
  BUBBLE_SPACING = 0.51 / BUBBLES;
export function droneGeometry(color) {
  const mesh = [],
    crystal = [],
    rings = [
      [-0.56, 0],
      [-0.22, 0.255],
      [0.19, 0.28],
      [0.36, 0.19],
      [0.56, 0],
    ],
    bronze = [0.38, 0.24, 0.1];
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        b = ((i + 1) * Math.PI) / 4,
        p = (ring, angle) => [Math.cos(angle) * ring[1], ring[0], Math.sin(angle) * ring[1]],
        quad = [p(rings[r], a), p(rings[r + 1], a), p(rings[r + 1], b), p(rings[r], b)];
      const uv = [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ];
      for (const triangle of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const ps = triangle.map((i) => quad[i]),
          n = normalize(
            cross(
              ps[1].map((v, k) => v - ps[0][k]),
              ps[2].map((v, k) => v - ps[0][k]),
            ),
          );
        if (Math.hypot(...n) < 0.1) continue;
        for (const j of triangle)
          crystal.push(
            ...quad[j],
            ...n,
            ...color.map((v) => v * (0.63 + (i % 3) * 0.15 + r * 0.035)),
            25,
            ...uv[j],
          );
      }
    }
  for (const y of [-0.23, 0.16]) {
    pressureSurface(
      mesh,
      [0, y, 0],
      [
        [0.245, 0],
        [0.295, 0],
        [0.315, 0.015],
        [0.315, 0.05],
        [0.29, 0.065],
        [0.245, 0.065],
        [0.245, 0],
      ],
      bronze,
      12,
      0,
      8,
    );
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.4;
      sphere(
        mesh,
        [Math.cos(a) * 0.306, y + 0.035, Math.sin(a) * 0.306],
        [0.023, 0.023, 0.023],
        [0.68, 0.45, 0.18],
        12,
      );
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4,
      x = Math.cos(a) * 0.29,
      z = Math.sin(a) * 0.29;
    rod(mesh, [x, -0.16, z], [x, 0.18, z], 0.025, bronze, 12);
  }
  // A small luminous heart is visible through the independently blended facets.
  for (let k = 0; k < crystal.length; k += 12)
    mesh.push(
      crystal[k] * 0.26,
      crystal[k + 1] * 0.32,
      crystal[k + 2] * 0.26,
      ...crystal.slice(k + 3, k + 6),
      ...color,
      4,
      0,
      0,
    );
  return { mesh, crystal };
}
export function archerGeometry() {
  const mesh = [],
    bone = [0.72, 0.67, 0.47],
    dark = [0.028, 0.023, 0.018],
    joint = (p, r = 0.037) => sphere(mesh, p, [r, r, r], bone),
    limb = (a, b, w = 0.05) => {
      rod(mesh, a, b, w, bone);
      joint(a, w * 0.65);
      joint(b, w * 0.65);
    };
  // The shared skull, with embers glowing in its sockets.
  const skullFrom = mesh.length,
    sockets = skullGeometry(mesh, { bone, dark, scale: 1.12 });
  for (const socket of sockets)
    sphere(
      mesh,
      [socket[0], socket[1], socket[2] + 0.024],
      [0.012, 0.016, 0.009],
      [1.6, 0.38, 0.035],
      4,
    );
  placeMesh(mesh, skullFrom, [0, 1.02, 0]);
  limb([0, 0.41, 0], [0, 0.88, 0], 0.055);
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1]) {
      const y = 0.79 - i * 0.073;
      rod(mesh, [s * 0.02, y, -0.025], [s * (0.17 - i * 0.013), y - 0.017, 0.005], 0.028, bone);
      rod(
        mesh,
        [s * (0.17 - i * 0.013), y - 0.017, 0.005],
        [s * 0.07, y - 0.043, 0.095],
        0.026,
        bone,
      );
    }
  limb([-0.17, 0.83, 0], [0.17, 0.83, 0], 0.045);
  sphere(mesh, [0, 0.43, 0], [0.12, 0.07, 0.075], bone);
  for (const s of [-1, 1]) {
    limb([s * 0.075, 0.41, 0], [s * 0.115, 0.22, s * 0.025], 0.055);
    limb([s * 0.115, 0.22, s * 0.025], [s * 0.14, 0.04, 0.035], 0.045);
    box(mesh, [s * 0.14, 0.035, 0.09], [0.09, 0.065, 0.18], bone, 0.02, 1, 2);
  }
  // One arm holds the bow, the other draws the string back to the ribs.
  limb([-0.17, 0.83, 0], [-0.22, 0.65, 0.16], 0.044);
  limb([-0.22, 0.65, 0.16], [-0.09, 0.57, 0.34], 0.038);
  limb([0.17, 0.83, 0], [0.27, 0.64, -0.045], 0.044);
  limb([0.27, 0.64, -0.045], [0.025, 0.57, 0.09], 0.038);
  sphere(mesh, [-0.09, 0.57, 0.34], [0.043, 0.043, 0.048], bone);
  sphere(mesh, [0.025, 0.57, 0.09], [0.042, 0.042, 0.042], bone);
  return mesh;
}
export function bowGeometry() {
  const mesh = [],
    points = [
      [-0.09, 0.19, 0.21],
      [-0.09, 0.29, 0.32],
      [-0.09, 0.43, 0.4],
      [-0.09, 0.57, 0.42],
      [-0.09, 0.71, 0.4],
      [-0.09, 0.85, 0.32],
      [-0.09, 0.95, 0.21],
    ];
  for (let i = 1; i < points.length; i++)
    rod(mesh, points[i - 1], points[i], 0.035, [0.44, 0.23, 0.075], 11);
  rod(mesh, [-0.09, 0.51, 0.42], [-0.09, 0.63, 0.42], 0.047, [0.13, 0.08, 0.04], 13);
  return mesh;
}
