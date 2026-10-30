import { bridgePose } from '../world/level-features.js';
import { dot, cross, normalize } from './math.js';
export function rotateBridgeMesh(mesh, from, bridge, progress) {
  const pose = bridgePose(bridge, progress),
    c = Math.cos(pose.angle),
    s = Math.sin(pose.angle);
  for (let k = from; k < mesh.length; k += 12) {
    const y = mesh[k + 1] + (bridge.y || 0) - pose.hinge[1],
      z = mesh[k + 2] - pose.hinge[2],
      ny = mesh[k + 4],
      nz = mesh[k + 5];
    mesh[k + 1] = pose.hinge[1] + y * c - z * s;
    mesh[k + 2] = pose.hinge[2] + y * s + z * c;
    mesh[k + 4] = ny * c - nz * s;
    mesh[k + 5] = ny * s + nz * c;
  }
  return pose;
}
// Stone stays below material id .5, so its fraction can carry the baked moss amount.
export const STONE_DETAIL = 0.45;
// Broad moss patches, evaluated per vertex: smooth enough to interpolate across a face.
export const mossAt = ([x, y, z]) =>
  Math.sin(x * 1.9 + z * 0.7 + Math.sin(z * 1.3)) * Math.sin(z * 2.3 - y * 1.4 + x * 0.5) * 0.45 +
  0.42;
// crisp: flat faces with narrow rounded bevels (grid lines at the bevel start).
// shade(axis,sign,s,t): per-vertex brightness, used for baked contact occlusion.
// detail(position): per-vertex value 0..1 stored in the material's fraction (stone moss).
export function box(
  mesh,
  center,
  size,
  color,
  bevel = 0.04,
  material = 0,
  steps = 4,
  { crisp = false, shade = null, detail = null } = {},
) {
  const h = size.map((v) => v * 0.5),
    radius = Math.min(bevel, ...h);
  if (crisp) steps = 3;
  const faces = [
    [0, 1, 2, 1],
    [0, 1, 2, -1],
    [1, 2, 0, 1],
    [1, 2, 0, -1],
    [2, 0, 1, 1],
    [2, 0, 1, -1],
  ];
  for (const [axis, u, v, sign] of faces) {
    const verts = [];
    for (let j = 0; j <= steps; j++)
      for (let i = 0; i <= steps; i++) {
        const p = [0, 0, 0];
        p[axis] = h[axis] * sign;
        p[u] = ((i / steps) * 2 - 1) * h[u];
        p[v] = ((j / steps) * 2 - 1) * h[v];
        if (material === 17) {
          const samples = (half) => [
            -half,
            -half + radius * 0.5,
            -half + radius,
            0,
            half - radius,
            half - radius * 0.5,
            half,
          ];
          p[u] = samples(h[u])[i];
          p[v] = samples(h[v])[j];
        } else if (crisp) {
          const samples = (half) => [-half, -half + radius, half - radius, half];
          p[u] = samples(h[u])[i];
          p[v] = samples(h[v])[j];
        }
        const core = p.map((x, k) => Math.max(-h[k] + radius, Math.min(h[k] - radius, x))),
          d = p.map((x, k) => x - core[k]),
          n = normalize(d);
        const position = core.map((x, k) => x + n[k] * radius + center[k]),
          s = (p[u] / h[u] + 1) / 2,
          t = (p[v] / h[v] + 1) / 2;
        let uv = [0, 0];
        if (material === 17) {
          uv = [p[u] / h[u], p[v] / h[v]];
        } else if (material < 0.5) {
          const tile =
            Math.abs(
              Math.round(center[0] * 73 + center[1] * 41 + center[2] * 137) +
                axis * 5 +
                (sign > 0 ? 3 : 0),
            ) % 16;
          const a = tile % 2 ? t : s,
            b = tile % 2 ? s : t;
          uv = [((tile % 4) + 0.02 + a * 0.96) / 4, (Math.floor(tile / 4) + 0.02 + b * 0.96) / 4];
        } else if (material === 11) {
          const seed = Math.abs(Math.sin(dot(center, [19.7, 31.1, 47.3]))),
            a = size[u] > size[v] ? t : s,
            b = size[u] > size[v] ? s : t;
          uv = [seed * 0.72 + a * 0.2, 0.04 + b * 0.92];
        } else if (material === 16) {
          uv = [s, t];
        }
        const brightness = shade ? shade(axis, sign, s, t) : 1;
        verts.push([
          ...position,
          ...n,
          ...color.map((c) => c * brightness),
          material + (detail ? Math.max(0, Math.min(1, detail(position))) * STONE_DETAIL : 0),
          ...uv,
        ]);
      }
    for (let j = 0; j < steps; j++)
      for (let i = 0; i < steps; i++) {
        const a = j * (steps + 1) + i,
          b = a + 1,
          c = a + steps + 1,
          d = c + 1;
        for (const tri of sign > 0
          ? [
              [a, b, d],
              [a, d, c],
            ]
          : [
              [a, d, b],
              [a, c, d],
            ])
          mesh.push(...tri.flatMap((k) => verts[k]));
      }
  }
}
export const unitSphere = (() => {
  const result = [],
    vertex = (u, v) => [Math.cos(u) * Math.sin(v), Math.cos(v), Math.sin(u) * Math.sin(v)];
  for (let j = 0; j < 6; j++)
    for (let i = 0; i < 10; i++) {
      const u = (i / 10) * Math.PI * 2,
        v = (j / 6) * Math.PI,
        du = Math.PI / 5,
        dv = Math.PI / 6;
      result.push(
        ...vertex(u, v),
        ...vertex(u + du, v),
        ...vertex(u + du, v + dv),
        ...vertex(u, v),
        ...vertex(u + du, v + dv),
        ...vertex(u, v + dv),
      );
    }
  return new Float32Array(result);
})();
// Coarse sphere for small props (bubbles, decor pebbles and bones).
export const lowSphere = (() => {
  const result = [],
    vertex = (u, v) => [Math.cos(u) * Math.sin(v), Math.cos(v), Math.sin(u) * Math.sin(v)];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 7; i++) {
      const u = (i / 7) * Math.PI * 2,
        v = (j / 4) * Math.PI,
        du = (Math.PI * 2) / 7,
        dv = Math.PI / 4;
      result.push(
        ...vertex(u, v),
        ...vertex(u + du, v),
        ...vertex(u + du, v + dv),
        ...vertex(u, v),
        ...vertex(u + du, v + dv),
        ...vertex(u, v + dv),
      );
    }
  return new Float32Array(result);
})();
export function sphere(mesh, center, size, color, material = 1, basis = null, shape = unitSphere) {
  for (let i = 0; i < shape.length; i += 3) {
    const x = shape[i],
      y = shape[i + 1],
      z = shape[i + 2],
      px = x * size[0],
      py = y * size[1],
      pz = z * size[2];
    if (basis) {
      const a = basis[0],
        b = basis[1],
        c = basis[2];
      mesh.push(
        center[0] + a[0] * px + b[0] * py + c[0] * pz,
        center[1] + a[1] * px + b[1] * py + c[1] * pz,
        center[2] + a[2] * px + b[2] * py + c[2] * pz,
        a[0] * x + b[0] * y + c[0] * z,
        a[1] * x + b[1] * y + c[1] * z,
        a[2] * x + b[2] * y + c[2] * z,
        ...color,
        material,
        0,
        0,
      );
    } else
      mesh.push(center[0] + px, center[1] + py, center[2] + pz, x, y, z, ...color, material, 0, 0);
  }
}
export function rod(mesh, a, b, width, color, material = 1) {
  const v = normalize(b.map((x, k) => x - a[k])),
    u = normalize(Math.abs(v[1]) > 0.95 ? cross(v, [0, 0, 1]) : cross(v, [0, 1, 0])),
    w = cross(u, v),
    from = mesh.length;
  box(
    mesh,
    [0, 0, 0],
    [width, Math.hypot(...b.map((x, k) => x - a[k])), width],
    color,
    width * 0.25,
    material,
    2,
  );
  for (let k = from; k < mesh.length; k += 12)
    for (const offset of [0, 3]) {
      const x = mesh[k + offset],
        y = mesh[k + offset + 1],
        z = mesh[k + offset + 2];
      for (let n = 0; n < 3; n++)
        mesh[k + offset + n] = (offset ? 0 : (a[n] + b[n]) * 0.5) + u[n] * x + v[n] * y + w[n] * z;
    }
}
