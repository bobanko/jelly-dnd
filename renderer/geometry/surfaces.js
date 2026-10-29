import { normalize } from '../math.js';
export function colliderLines(boxes) {
  const data = [],
    colors = {
      floor: [0.12, 0.65, 1],
      block: [0.22, 0.75, 1],
      wall: [0.8, 0.88, 0.95],
      lift: [1, 0.65, 0.04],
      bridge: [1, 0.7, 0.2],
      conveyor: [0.7, 0.9, 0.3],
      spikes: [1, 0.1, 0.12],
      portal: [0.85, 0.2, 1],
    };
  for (const b of boxes) {
    const c = colors[b.kind] || colors.wall,
      points = [];
    for (let y = 0; y < 2; y++)
      for (let z = 0; z < 2; z++)
        for (let x = 0; x < 2; x++)
          points.push([
            b.x + (x ? 1 : -1) * (b.halfX ?? b.half),
            y ? b.maxY : b.minY,
            b.z + (z ? 1 : -1) * (b.halfZ ?? b.half),
          ]);
    for (let i = 0; i < 8; i++)
      for (const bit of [1, 2, 4])
        if (!(i & bit)) data.push(...points[i], ...c, ...points[i | bit], ...c);
  }
  return new Float32Array(data);
}
export function surfaceBindings(soft) {
  const vertices = [],
    indices = [],
    steps = 14,
    half = soft.WIDTH / 2;
  for (const [axis, u, v, sign] of [
    [0, 1, 2, 1],
    [0, 1, 2, -1],
    [1, 2, 0, 1],
    [1, 2, 0, -1],
    [2, 0, 1, 1],
    [2, 0, 1, -1],
  ]) {
    const base = vertices.length / 12;
    for (let j = 0; j <= steps; j++)
      for (let i = 0; i <= steps; i++) {
        const p = [0, 0, 0];
        p[axis] = sign * half;
        p[u] = ((i / steps) * 2 - 1) * half;
        p[v] = ((j / steps) * 2 - 1) * half;
        const rest = soft.rounded(p),
          core = p.map((x) => Math.max(-half + 0.085, Math.min(half - 0.085, x))),
          n = normalize(p.map((x, k) => x - core[k]));
        vertices.push(...p, 0, ...rest, 0, ...n, 0);
      }
    for (let j = 0; j < steps; j++)
      for (let i = 0; i < steps; i++) {
        const a = base + j * (steps + 1) + i,
          b = a + 1,
          c = a + steps + 1,
          d = c + 1;
        indices.push(...(sign > 0 ? [a, b, d, a, d, c] : [a, d, b, a, c, d]));
      }
  }
  return {
    vertices: new Float32Array(vertices),
    indices: new Uint32Array(indices),
    count: vertices.length / 12,
  };
}
