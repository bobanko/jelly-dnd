import { dot, cross } from '../math.js';
import { box } from '../mesh.js';
export const runePaths = [
  [
    [
      [0, 0.26],
      [0, -0.26],
    ],
    [
      [0, 0.02],
      [-0.18, -0.17],
    ],
    [
      [0, 0.02],
      [0.18, -0.17],
    ],
  ],
  [
    [
      [0, -0.25],
      [0.2, 0],
      [0, 0.25],
      [-0.2, 0],
      [0, -0.25],
    ],
    [
      [-0.2, 0],
      [0.2, 0],
    ],
  ],
  [
    [
      [0.17, -0.25],
      [-0.12, -0.04],
      [0.12, 0.04],
      [-0.17, 0.25],
    ],
  ],
  [
    [
      [0, -0.25],
      [0.2, 0],
      [0, 0.25],
      [-0.2, 0],
      [0, -0.25],
    ],
  ],
  [
    [
      [-0.2, -0.25],
      [-0.2, 0.25],
      [0.2, -0.25],
      [0.2, 0.25],
      [-0.2, -0.25],
    ],
  ],
];
export const runeGlyphShader = `
 fn runeSegment(p:vec2f,a:vec2f,b:vec2f)->f32{let ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.,1.));}
 fn runeDistance(p:vec2f,glyph:u32)->f32{var distance=10.;
 ${runePaths.map((paths, index) => `if(glyph==${index}u){${paths.flatMap((path) => path.slice(1).map((b, j) => `distance=min(distance,runeSegment(p,vec2f(${path[j].join(',')}),vec2f(${b.join(',')})));`)).join('')}}`).join('')}
 return distance;}
 `;
export function goalRune(mesh, center, index, color, material = 10) {
  const paths = runePaths[index];
  for (const path of paths)
    for (let j = 0; j < path.length - 1; j++) {
      const a = path[j],
        b = path[j + 1],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz),
        s = dx / length,
        c = dz / length,
        from = mesh.length;
      box(mesh, [0, 0, 0], [0.034, 0.007, length + 0.018], color, 0.003, material, 2);
      for (let k = from; k < mesh.length; k += 12) {
        const x = mesh[k],
          z = mesh[k + 2],
          nx = mesh[k + 3],
          nz = mesh[k + 5];
        mesh[k] = center[0] + (a[0] + b[0]) * 0.5 + x * c + z * s;
        mesh[k + 1] += center[1];
        mesh[k + 2] = center[2] + (a[1] + b[1]) * 0.5 - x * s + z * c;
        mesh[k + 3] = nx * c + nz * s;
        mesh[k + 5] = -nx * s + nz * c;
      }
    }
}
export function colorBlockRunes(mesh, block, color, axis, sign) {
  const from = mesh.length,
    n = [0, 0, 0];
  n[axis] = sign;
  const u = axis === 1 ? [1, 0, 0] : [n[2], 0, -n[0]],
    v = cross(u, n);
  // A signed-distance sigil has a luminous core and halo without opaque plates.
  for (const [x, z] of [
    [-1, -1],
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
    [1, 1],
  ])
    mesh.push(x * 0.35, 0, z * 0.35, 0, 1, 0, ...color, 19 + block.color, x, z);
  for (let k = from; k < mesh.length; k += 12)
    for (const offset of [0, 3]) {
      const x = mesh[k + offset],
        y = mesh[k + offset + 1],
        z = mesh[k + offset + 2];
      for (let j = 0; j < 3; j++)
        mesh[k + offset + j] =
          u[j] * x +
          n[j] * y +
          v[j] * z +
          (offset === 0
            ? [block.x, block.y - 0.5, block.z][j] + n[j] * (axis === 1 ? 0.504 : 0.489)
            : 0);
    }
}
export function phaseBlock(mesh, faces, block, color) {
  const shell = [];
  box(shell, [block.x, block.y - 0.5, block.z], [0.97, 1, 0.97], color, 0.075, 17, 6);
  // Keep each face and its rune together, so a jelly inside the block can be
  // composited between the far and near surfaces without opaque depth writes.
  const faceSize = shell.length / 6;
  for (let face = 0; face < 6; face++) {
    const axis = Math.floor(face / 2),
      sign = face % 2 ? -1 : 1,
      from = mesh.length / 12,
      center = [block.x, block.y - 0.5, block.z],
      normal = [0, 0, 0];
    normal[axis] = sign;
    center[axis] += sign * 0.5;
    mesh.push(...shell.slice(face * faceSize, (face + 1) * faceSize));
    colorBlockRunes(mesh, block, color, axis, sign);
    faces.push({ kind: 'phase', center, normal, first: from, count: mesh.length / 12 - from });
  }
}
export function phaseGroundGlow(mesh, faces, block, color) {
  const first = mesh.length / 12,
    center = [block.x, block.y - 0.995, block.z];
  for (const [x, z] of [
    [-1, -1],
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
    [1, 1],
  ])
    mesh.push(center[0] + x * 0.9, center[1], center[2] + z * 0.9, 0, 1, 0, ...color, 25, x, z);
  faces.push({ kind: 'phase', center, normal: [0, 1, 0], first, count: 6 });
}
