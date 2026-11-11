import { box, lowSphere, sphere, BARREL_HOOP_ROWS } from '../mesh.js';
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
function turnFaceOntoCube(mesh, from, axis, sign) {
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

// Large crate: a separate, nearly cell-wide shipping crate with crossed oak braces and
// wrapped iron corner plates. Its decoration stays inside the 0.5 visual half extent while
// the 0.47 collision box remains unchanged.
export function largeCrateGeometry() {
  const mesh = [],
    wood = OAK_WOOD.map((value) => value * 0.92),
    frame = [0.75, 0.425, 0.175],
    brace = [0.68, 0.35, 0.125],
    iron = [0.16, 0.17, 0.19],
    rivet = [0.34, 0.29, 0.23];
  box(mesh, [0, 0, 0], [0.82, 0.82, 0.82], [0.16, 0.072, 0.022], 0.012, 11, 2);
  for (let axis = 0; axis < 3; axis++)
    for (const sign of [-1, 1]) {
      const from = mesh.length,
        seed = axis * 13 + sign + 5;
      // Narrow, individually shaded boards make the face read clearly even from the game camera.
      for (let board = -2; board <= 2; board++)
        oakPlank(
          mesh,
          [board * 0.154, 0, 0.422],
          [0.148, 0.79, 0.034],
          wood.map((value) => value * (0.91 + ((board + seed + 8) % 4) * 0.045)),
          seed + board,
          0.005,
        );
      // The crossed braces sit above the boards, but tuck under the surrounding frame.
      for (const direction of [-1, 1]) {
        const braceFrom = mesh.length,
          angle = direction * (Math.PI / 4),
          c = Math.cos(angle),
          s = Math.sin(angle);
        oakPlank(mesh, [0, 0, 0.447], [0.086, 0.89, 0.04], brace, seed + direction + 11, 0.008);
        for (let k = braceFrom; k < mesh.length; k += 12)
          for (const offset of [0, 3]) {
            const x = mesh[k + offset],
              y = mesh[k + offset + 1];
            mesh[k + offset] = x * c - y * s;
            mesh[k + offset + 1] = x * s + y * c;
          }
      }
      for (const edge of [-1, 1]) {
        oakPlank(mesh, [edge * 0.397, 0, 0.457], [0.116, 0.82, 0.052], frame, seed + edge, 0.012);
        oakPlank(
          mesh,
          [0, edge * 0.397, 0.457],
          [0.91, 0.116, 0.052],
          frame,
          seed + edge + 4,
          0.012,
        );
      }
      // Square face plates join into a three-sided cap at every physical corner.
      for (const x of [-0.397, 0.397])
        for (const y of [-0.397, 0.397]) {
          box(mesh, [x, y, 0.478], [0.15, 0.15, 0.03], iron, 0.018, 12, 3);
          sphere(mesh, [x, y, 0.494], [0.021, 0.021, 0.009], rivet, 12, null, lowSphere);
        }
      turnFaceOntoCube(mesh, from, axis, sign);
    }
  return mesh;
}
// Barrel lying along x, textured from assets/materials/barrel-atlas.png: two heads (top
// half), eight whole staves (rows 512–912) and an iron hoop band (rows 920–1000).
const ATLAS = {
  heads: [
    [0.25, 0.25, (0.25 * 181) / 184],
    [0.75, 0.25, (0.25 * 185) / 188],
  ],
  staves: [512 / 1024, 912 / 1024],
  hoop: BARREL_HOOP_ROWS,
};
// Head texture: the ring of stave ends spans the outer quarter of the circle's radius.
const HEAD_RING = 0.773;
export function barrelGeometry() {
  const mesh = [],
    half = 0.47,
    staves = 16,
    rows = 8,
    // The body's centre sits about 0.5 above its feet, so the belly just meets the floor.
    radius = (x) => 0.4 + 0.09 * (1 - (x / half) ** 2),
    slope = (x) => (-0.18 * x) / (half * half),
    white = [0.86, 0.84, 0.82];
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
  // Staves: each takes one of the eight painted staves, in a shuffled order.
  const [v0, v1] = ATLAS.staves;
  for (let k = 0; k < staves; k++) {
    const from = (k / staves) * Math.PI * 2,
      to = ((k + 1) / staves) * Math.PI * 2,
      column = (k * 3) % 8,
      u0 = column / 8 + 0.003,
      u1 = (column + 1) / 8 - 0.003,
      tone = 0.94 + ((k * 5) % 3) * 0.04;
    for (let j = 0; j < rows; j++)
      for (let c = 0; c < 2; c++) {
        const corner = (row, step) => {
          const x = -half + (row / rows) * half * 2,
            { p, n } = surface(x, from + ((to - from) * step) / 2);
          return {
            v: vertex(
              p,
              n,
              white.map((t) => t * tone),
              30,
              [u0 + ((u1 - u0) * step) / 2, v0 + 0.004 + (row / rows) * (v1 - v0 - 0.008)],
            ),
            n,
          };
        };
        const a = corner(j, c),
          b = corner(j + 1, c),
          d = corner(j, c + 1),
          e = corner(j + 1, c + 1);
        quad(a.v, b.v, e.v, d.v, a.n);
      }
  }
  // Heads: the ring of stave ends flush with the staves, and the boards set back behind it.
  // Both map onto the same painted head, so the ring and boards line up.
  const segments = 36,
    endRadius = radius(half),
    inner = endRadius * HEAD_RING,
    recess = 0.035;
  for (const side of [-1, 1]) {
    const [cu, cv, cr] = ATLAS.heads[side > 0 ? 0 : 1],
      axial = [side, 0, 0],
      // Seen from outside the head, +z runs to the right on both ends.
      headUV = (r, angle) => [
        cu + Math.sin(angle) * side * (r / endRadius) * cr,
        cv - Math.cos(angle) * (r / endRadius) * cr,
      ],
      ring = (r, x, angle) => [x, r * Math.cos(angle), r * Math.sin(angle)],
      lid = side * (half - recess);
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2,
        a1 = ((k + 1) / segments) * Math.PI * 2;
      quad(
        vertex(ring(endRadius, side * half, a0), axial, white, 30, headUV(endRadius, a0)),
        vertex(ring(endRadius, side * half, a1), axial, white, 30, headUV(endRadius, a1)),
        vertex(ring(inner, side * half, a1), axial, white, 30, headUV(inner, a1)),
        vertex(ring(inner, side * half, a0), axial, white, 30, headUV(inner, a0)),
        axial,
      );
      // The inner wall of the chime, in the shadow of the ring.
      const mid = (a0 + a1) / 2,
        inward = [0, -Math.cos(mid), -Math.sin(mid)],
        wall = [0.32, 0.26, 0.24];
      quad(
        vertex(ring(inner, side * half, a0), inward, wall, 30, headUV(inner * 0.97, a0)),
        vertex(ring(inner, side * half, a1), inward, wall, 30, headUV(inner * 0.97, a1)),
        vertex(ring(inner, lid, a1), inward, wall, 30, headUV(inner * 0.97, a1)),
        vertex(ring(inner, lid, a0), inward, wall, 30, headUV(inner * 0.97, a0)),
        inward,
      );
      triangle(
        vertex([lid, 0, 0], axial, white, 30, headUV(0, a0)),
        vertex(ring(inner, lid, a0), axial, white, 30, headUV(inner, a0)),
        vertex(ring(inner, lid, a1), axial, white, 30, headUV(inner, a1)),
        axial,
      );
    }
  }
  // Iron hoops: one raised band near each end, the painted strip wrapped twice around.
  const [h0, h1] = ATLAS.hoop;
  for (const center of [-0.29, 0.29]) {
    const width = 0.075,
      x0 = center - width / 2,
      x1 = center + width / 2,
      lift = 0.014;
    for (let k = 0; k < segments; k++) {
      const a0 = (k / segments) * Math.PI * 2,
        a1 = ((k + 1) / segments) * Math.PI * 2,
        u0 = (k % (segments / 2)) / (segments / 2),
        u1 = ((k % (segments / 2)) + 1) / (segments / 2),
        band = (x, angle, u, v) => {
          const { p, n } = surface(x, angle, lift);
          return { v: vertex(p, n, white, 31, [0.005 + u * 0.99, v]), n };
        },
        a = band(x0, a0, u0, h1),
        b = band(x1, a0, u0, h0),
        d = band(x1, a1, u1, h0),
        e = band(x0, a1, u1, h1);
      quad(a.v, b.v, d.v, e.v, a.n);
      for (const [x, sign, v] of [
        [x0, -1, h1],
        [x1, 1, h0],
      ]) {
        const ring = (r, angle) => [x, r * Math.cos(angle), r * Math.sin(angle)],
          r = radius(x),
          n = [sign, 0, 0],
          dark = [0.6, 0.6, 0.6];
        quad(
          vertex(ring(r, a0), n, dark, 31, [0.5, v]),
          vertex(ring(r + lift, a0), n, dark, 31, [0.5, v]),
          vertex(ring(r + lift, a1), n, dark, 31, [0.5, v]),
          vertex(ring(r, a1), n, dark, 31, [0.5, v]),
          n,
        );
      }
    }
  }
  return mesh;
}
