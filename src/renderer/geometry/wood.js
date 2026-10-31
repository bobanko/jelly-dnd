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
