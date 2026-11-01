import { box } from '../mesh.js';
export const OAK_WOOD = [0.64, 0.355, 0.145],
  OAK_FRAME = [0.8, 0.49, 0.225],
  OAK_END_GRAIN = [0.69, 0.405, 0.19],
  IRON_NAIL = [0.19, 0.135, 0.085];
// Shared oak board: the crate and wooden bridge keep the same grain, wear and scratches.
export function oakPlank(mesh, center, size, color, seed, bevel = 0.009) {
  const start = mesh.length,
    vertical = size[1] > size[0];
  box(mesh, center, size, color, bevel, 11, 3, {
    crisp: true,
    shade: (axis, sign, s, t) => {
      const edge = Math.min(s, t, 1 - s, 1 - t);
      return axis === 2 && sign > 0 ? 0.92 + Math.max(0, 1 - edge * 18) * 0.16 : 0.86;
    },
  });
  // Shallow corner chips expose pale fibres without opening holes in the board.
  for (let k = start; k < mesh.length; k += 12) {
    const x = (mesh[k] - center[0]) / (size[0] * 0.5),
      y = (mesh[k + 1] - center[1]) / (size[1] * 0.5),
      corner =
        Math.max(0, (x * (seed % 2 ? 1 : -1) - 0.76) / 0.24) *
        Math.max(0, (y * (seed % 3 ? -1 : 1) - 0.76) / 0.24);
    mesh[k + 2] -= corner * 0.007;
    for (let c = 0; c < 3; c++) mesh[k + 6 + c] *= 1 + corner * 0.16;
  }
  // Sparse tapered scratches follow the timber, with a shadow and exposed fibre lip.
  for (let i = 0; i < 3; i++) {
    const across = Math.sin(seed * 12.7 + i * 7.3) * 0.3,
      along = Math.sin(seed * 4.1 + i * 13.7) * 0.29,
      length = Math.max(size[0], size[1]) * (0.09 + i * 0.035),
      width = 0.0018 + (i % 2) * 0.001,
      x = center[0] + (vertical ? across * size[0] : along * size[0]),
      y = center[1] + (vertical ? along * size[1] : across * size[1]),
      z = center[2] + size[2] * 0.5 + 0.0004;
    for (const [offset, tint] of [
      [0, [0.32, 0.16, 0.06]],
      [width, [0.9, 0.61, 0.3]],
    ]) {
      for (const [u, v] of [
        [-width, -length * 0.5],
        [width, -length * 0.32],
        [0, length * 0.5],
      ])
        mesh.push(
          x + (vertical ? u + offset : -v),
          y + (vertical ? v : u + offset),
          z,
          0,
          0,
          1,
          ...tint,
          11,
          0.37,
          0.46,
        );
    }
  }
}
export function bridgeOakPlank(mesh, center, size, color, seed, bevel = 0.009) {
  const from = mesh.length;
  oakPlank(mesh, [0, 0, 0], [size[0], size[2], size[1]], color, seed, bevel);
  // Turn the face-local plank onto the XZ bridge deck without mirroring its triangles.
  for (let k = from; k < mesh.length; k += 12)
    for (const offset of [0, 3]) {
      const x = mesh[k + offset],
        y = mesh[k + offset + 1],
        z = mesh[k + offset + 2];
      mesh[k + offset] = (offset ? 0 : center[0]) + x;
      mesh[k + offset + 1] = (offset ? 0 : center[1]) + z;
      mesh[k + offset + 2] = (offset ? 0 : center[2]) - y;
    }
}
export function crateGeometry() {
  const mesh = [],
    wood = OAK_WOOD,
    frame = OAK_FRAME,
    endGrain = OAK_END_GRAIN,
    nail = IRON_NAIL;
  // Work in face-local coordinates so grain, wear and hardware tumble with the crate.
  const plank = (center, size, color, seed, bevel = 0.009) =>
    oakPlank(mesh, center, size, color, seed, bevel);
  box(mesh, [0, 0, 0], [0.71, 0.71, 0.71], [0.19, 0.095, 0.032], 0.012, 11, 2);
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const from = mesh.length,
        faceSeed = axis * 7 + sign + 3;
      for (let j = 0; j < 4; j++) {
        const center = [(j - 1.5) * 0.153, 0, 0.365],
          size = [0.147, 0.625, 0.036];
        if (axis === 1) {
          [center[0], center[1]] = [center[1], center[0]];
          [size[0], size[1]] = [size[1], size[0]];
        }
        plank(
          center,
          size,
          wood.map((v) => v * (0.9 + ((j * 3 + faceSeed) % 5) * 0.045)),
          faceSeed + j,
          0.005,
        );
      }
      // Broad rails with clean butt joints; their worn bevels catch the dungeon light.
      for (const edge of [-1, 1]) {
        plank([edge * 0.326, 0, 0.392], [0.112, 0.55, 0.062], frame, faceSeed + edge, 0.012);
        plank(
          [0, edge * 0.326, 0.392],
          [0.764, 0.112, 0.062],
          endGrain,
          faceSeed + edge + 4,
          0.012,
        );
      }
      if (axis !== 1) {
        const start = mesh.length,
          a = (sign * Math.PI) / 4,
          c = Math.cos(a),
          s = Math.sin(a);
        plank(
          [0, 0, 0.392],
          [0.087, 0.77, 0.039],
          frame.map((v) => v * 0.91),
          faceSeed + 9,
          0.007,
        );
        for (let k = start; k < mesh.length; k += 12)
          for (const offset of [0, 3]) {
            const x = mesh[k + offset],
              y = mesh[k + offset + 1];
            mesh[k + offset] = x * c - y * s;
            mesh[k + offset + 1] = x * s + y * c;
          }
      }
      // Broad, shallow iron nail heads remain readable against the oak at game scale.
      for (const x of [-0.326, 0.326])
        for (const y of [-0.326, 0.326])
          for (let k = 0; k < 8; k++) {
            const a = (k * Math.PI) / 4,
              b = ((k + 1) * Math.PI) / 4,
              radius = 0.04;
            for (const [px, py, pz] of [
              [0, 0, 0.004],
              [Math.cos(a) * radius, Math.sin(a) * radius, 0],
              [Math.cos(b) * radius, Math.sin(b) * radius, 0],
            ])
              mesh.push(x + px, y + py, 0.424 + pz, 0, 0, 1, ...nail, 12, 0.3, 0.4);
          }
      const u = axis === 0 ? [0, 0, -sign] : axis === 1 ? [1, 0, 0] : [sign, 0, 0],
        v = axis === 1 ? [0, 0, -sign] : [0, 1, 0],
        normal = [0, 0, 0];
      normal[axis] = sign;
      for (let k = from; k < mesh.length; k += 12)
        for (const offset of [0, 3]) {
          const x = mesh[k + offset],
            y = mesh[k + offset + 1],
            z = mesh[k + offset + 2];
          for (let n = 0; n < 3; n++) mesh[k + offset + n] = u[n] * x + v[n] * y + normal[n] * z;
        }
    }
  return mesh;
}
// Large crate: the oak crate grown to almost a full cell (outer half ≈ 0.49 against the
// 0.47 collision box) with iron corner caps, so it reads as heavy and distinct from the
// small, tumbling crate.
export function largeCrateGeometry() {
  const mesh = crateGeometry(),
    scale = 1.15;
  for (let k = 0; k < mesh.length; k += 12) for (let n = 0; n < 3; n++) mesh[k + n] *= scale;
  for (const x of [-1, 1])
    for (const y of [-1, 1])
      for (const z of [-1, 1])
        box(mesh, [x * 0.42, y * 0.42, z * 0.42], [0.15, 0.15, 0.15], IRON_NAIL, 0.02, 12, 2);
  return mesh;
}
// Barrel lying along x: bulging oak staves with dark seams, two iron hoops near each end and
// planked heads with a diagonal brace, set back behind the stave ends (the chime).
export const BARREL_IRON = [0.27, 0.235, 0.235];
export function barrelGeometry() {
  const mesh = [],
    half = 0.47,
    chime = 0.035,
    staves = 16,
    rows = 8,
    radius = (x) => 0.395 + 0.055 * (1 - (x / half) ** 2),
    slope = (x) => (-0.11 * x) / (half * half);
  // One vertex: position, normal, colour, material and texture coordinates.
  const vertex = (p, n, color, material, uv) => [...p, ...n, ...color, material, ...uv];
  // Pushes a triangle wound so that its face points along `outward` (front faces are CCW).
  const triangle = (a, b, c, outward) => {
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]],
      e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]],
      n = [
        e1[1] * e2[2] - e1[2] * e2[1],
        e1[2] * e2[0] - e1[0] * e2[2],
        e1[0] * e2[1] - e1[1] * e2[0],
      ],
      flip = n[0] * outward[0] + n[1] * outward[1] + n[2] * outward[2] < 0;
    mesh.push(...a, ...(flip ? c : b), ...(flip ? b : c));
  };
  const quad = (a, b, c, d, outward) => {
    triangle(a, b, c, outward);
    triangle(a, c, d, outward);
  };
  const surface = (x, angle, lift = 0) => {
    const r = radius(x) + lift,
      c = Math.cos(angle),
      s = Math.sin(angle),
      length = Math.hypot(slope(x), 1);
    return { p: [x, r * c, r * s], n: [-slope(x) / length, c / length, s / length] };
  };
  // Staves: each spans three columns so its edges darken into a seam against the next one.
  for (let k = 0; k < staves; k++) {
    const from = (k / staves) * Math.PI * 2,
      to = ((k + 1) / staves) * Math.PI * 2,
      tone = 0.84 + ((k * 5) % 7) * 0.045,
      seed = Math.abs(Math.sin(k * 12.9898)) * 0.72;
    const columns = [
      [from, 0.5, 0],
      [(from + to) / 2, 1, 0.5],
      [to, 0.5, 1],
    ];
    for (let j = 0; j < rows; j++)
      for (let c = 0; c < 2; c++) {
        const corner = (row, column) => {
          const x = -half + (row / rows) * half * 2,
            [angle, shade, across] = columns[column],
            { p, n } = surface(x, angle);
          return {
            point: vertex(
              p,
              n,
              OAK_WOOD.map((v) => v * tone * shade),
              11,
              [seed + across * 0.2, 0.04 + (row / rows) * 0.92],
            ),
            outward: n,
          };
        };
        const a = corner(j, c),
          b = corner(j + 1, c),
          d = corner(j, c + 1),
          e = corner(j + 1, c + 1);
        quad(a.point, b.point, e.point, d.point, a.outward);
      }
  }
  // Stave ends and the inner wall of the chime at both heads.
  const segments = 32,
    endRadius = radius(half),
    lid = half - chime,
    inner = endRadius - 0.03;
  for (const side of [-1, 1])
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2,
        a1 = ((k + 1) / segments) * Math.PI * 2,
        ring = (r, x, angle) => [x, r * Math.cos(angle), r * Math.sin(angle)],
        endGrain = OAK_END_GRAIN.map((v) => v * 0.9),
        axial = [side, 0, 0];
      quad(
        vertex(ring(endRadius, side * half, a0), axial, endGrain, 11, [0.1, 0.1]),
        vertex(ring(endRadius, side * half, a1), axial, endGrain, 11, [0.12, 0.1]),
        vertex(ring(inner, side * half, a1), axial, endGrain, 11, [0.12, 0.14]),
        vertex(ring(inner, side * half, a0), axial, endGrain, 11, [0.1, 0.14]),
        axial,
      );
      const wall = OAK_WOOD.map((v) => v * 0.45),
        mid = (a0 + a1) / 2,
        inward = [0, -Math.cos(mid), -Math.sin(mid)];
      quad(
        vertex(ring(inner, side * half, a0), inward, wall, 11, [0.3, 0.1]),
        vertex(ring(inner, side * half, a1), inward, wall, 11, [0.32, 0.1]),
        vertex(ring(inner, side * lid, a1), inward, wall, 11, [0.32, 0.16]),
        vertex(ring(inner, side * lid, a0), inward, wall, 11, [0.3, 0.16]),
        inward,
      );
      // Dark backing behind the head boards, seen through their seams.
      const back = side * (lid - 0.006);
      triangle(
        vertex([back, 0, 0], axial, [0.08, 0.04, 0.015], 11, [0.5, 0.5]),
        vertex(ring(inner, back, a0), axial, [0.08, 0.04, 0.015], 11, [0.5, 0.5]),
        vertex(ring(inner, back, a1), axial, [0.08, 0.04, 0.015], 11, [0.5, 0.5]),
        axial,
      );
    }
  // Head boards: four planks across the head, trimmed to the circle, with narrow seams.
  for (const side of [-1, 1]) {
    const axial = [side, 0, 0],
      boards = 4,
      steps = 8;
    for (let k = 0; k < boards; k++) {
      const z0 = -inner + (k / boards) * inner * 2 + 0.005,
        z1 = -inner + ((k + 1) / boards) * inner * 2 - 0.005,
        tone = 0.88 + ((k * 3 + (side > 0 ? 1 : 0)) % 4) * 0.05,
        color = OAK_WOOD.map((v) => v * tone),
        seed = Math.abs(Math.sin((k + side * 7) * 7.31)) * 0.72,
        chord = (z) => Math.sqrt(Math.max(0, inner * inner - z * z)) - 0.004;
      for (let i = 0; i < steps; i++) {
        const point = (z, t) => {
          const h = chord(z),
            y = -h + t * h * 2;
          return vertex([side * lid, y, z], axial, color, 11, [
            seed + ((z - z0) / (z1 - z0)) * 0.2,
            0.04 + ((y + inner) / (inner * 2)) * 0.92,
          ]);
        };
        quad(
          point(z0, i / steps),
          point(z1, i / steps),
          point(z1, (i + 1) / steps),
          point(z0, (i + 1) / steps),
          axial,
        );
      }
    }
    // Diagonal brace nailed across the boards.
    const start = mesh.length;
    oakPlank(
      mesh,
      [0, 0, 0],
      [0.1, inner * 1.75, 0.026],
      OAK_FRAME.map((v) => v * 0.92),
      5 + side,
      0.006,
    );
    const c = Math.SQRT1_2;
    for (let k = start; k < mesh.length; k += 12)
      for (const offset of [0, 3]) {
        const [u, v, w] = [mesh[k + offset], mesh[k + offset + 1], mesh[k + offset + 2]],
          y = u * c - v * c,
          z = u * c + v * c;
        // Plank face (+w) turns to face along the barrel axis on this side.
        mesh[k + offset] = (offset ? 0 : side * (lid + 0.013)) + w * side;
        mesh[k + offset + 1] = y;
        mesh[k + offset + 2] = z * side;
      }
  }
  // Iron hoops: raised bands with side walls, two near each end.
  for (const center of [-0.4, -0.27, 0.27, 0.4]) {
    const width = Math.abs(center) > 0.35 ? 0.045 : 0.055,
      x0 = center - width / 2,
      x1 = center + width / 2,
      lift = 0.012;
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2,
        a1 = ((k + 1) / segments) * Math.PI * 2,
        band = (x, angle) => {
          const { p, n } = surface(x, angle, lift);
          return { v: vertex(p, n, BARREL_IRON, 12, [0, 0]), n };
        },
        a = band(x0, a0),
        b = band(x1, a0),
        d = band(x1, a1),
        e = band(x0, a1);
      quad(a.v, b.v, d.v, e.v, a.n);
      for (const [x, sign] of [
        [x0, -1],
        [x1, 1],
      ]) {
        const ring = (r, angle) => [x, r * Math.cos(angle), r * Math.sin(angle)],
          r = radius(x),
          n = [sign, 0, 0],
          dark = BARREL_IRON.map((v) => v * 0.7);
        quad(
          vertex(ring(r, a0), n, dark, 12, [0, 0]),
          vertex(ring(r + lift, a0), n, dark, 12, [0, 0]),
          vertex(ring(r + lift, a1), n, dark, 12, [0, 0]),
          vertex(ring(r, a1), n, dark, 12, [0, 0]),
          n,
        );
      }
    }
  }
  return mesh;
}
