// Includes the raised rivets. Boundary placements put the outer surface on the cell face.
export const GRATE_HALF_THICKNESS = 0.1;
// Authored coordinates identify a voxel (Y is its top). Offset selects its centre or faces.
export function grateFrame(p) {
  const alongZ = p.axis === 'z',
    horizontal = p.plane === 'horizontal',
    offset = (p.offset ?? 0) * (1 - GRATE_HALF_THICKNESS * 2);
  return {
    center: [
      p.x + (!horizontal && alongZ ? offset : 0),
      p.y - 0.5 + (horizontal ? offset : 0),
      p.z + (!horizontal && !alongZ ? offset : 0),
    ],
    u: alongZ ? [0, 0, 1] : [1, 0, 0],
    v: horizontal ? (alongZ ? [1, 0, 0] : [0, 0, 1]) : [0, 1, 0],
    n: horizontal ? [0, 1, 0] : alongZ ? [1, 0, 0] : [0, 0, 1],
  };
}
export function grateCorners(p) {
  const f = grateFrame(p);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) => f.center.map((c, k) => c + (u * f.u[k] + v * f.v[k]) * 0.5));
}
// Inset sections belong to their own cell, including opposite faces in adjacent cells.
export function grateKey(p) {
  return [...grateFrame(p).center, p.plane === 'horizontal' ? 'y' : (p.axis ?? 'x')].join(',');
}
export function grateBounds(p) {
  const f = grateFrame(p),
    half = f.n.map(
      (n, k) =>
        Math.abs(f.u[k]) * 0.5 + Math.abs(f.v[k]) * 0.5 + Math.abs(n) * GRATE_HALF_THICKNESS,
    );
  return {
    x: f.center[0],
    z: f.center[2],
    half: 0.5,
    halfX: half[0],
    halfZ: half[2],
    minY: f.center[1] - half[1],
    maxY: f.center[1] + half[1],
    kind: 'grate',
  };
}
