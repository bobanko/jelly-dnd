// Stone columns under base cubes (cells with nothing anywhere below them). Deterministic per
// cell, so a level always looks and plays the same.
//
// Far from play they are decoration fading into the void fog. Where a column hangs beside a
// real tile of a lower layer, it becomes that layer's wall: it is always present down to the
// tile, and those segments are solid (marked `solid`), so a jelly walking below cannot pass
// through stone it can see. Painting a tile under a cube removes its column altogether, which
// is how a hidden room under the floor gets its space.
const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

export function levelPillars(blocks) {
  const lowest = new Map(),
    cells = new Set();
  for (const b of blocks) {
    const key = b.x + ',' + b.z;
    if (!lowest.has(key) || b.y < lowest.get(key).y) lowest.set(key, b);
    cells.add(b.x + ',' + b.y + ',' + b.z);
  }
  // A segment spanning [y - 1, y] is beside play when a neighbouring tile has its top at y
  // (the segment is level with that tile) or at y - 1 (it fills the space above the tile).
  const besidePlay = (x, y, z) =>
    NEIGHBOURS.some(
      ([dx, dz]) =>
        cells.has(x + dx + ',' + y + ',' + (z + dz)) ||
        cells.has(x + dx + ',' + (y - 1) + ',' + (z + dz)),
    );
  const bottom = Math.min(...blocks.map((b) => b.y)),
    pillars = [];
  for (const b of blocks) {
    if (b.color !== undefined || lowest.get(b.x + ',' + b.z) !== b) continue;
    let wall = 0;
    for (let k = 1; b.y - k >= bottom - 1; k++) if (besidePlay(b.x, b.y - k, b.z)) wall = k;
    const hash = Math.abs(Math.sin(b.x * 12.9898 + b.z * 78.233 + b.y * 37.719) * 43758.5453) % 1,
      decorative = hash > 0.7 ? 0 : 3 + Math.floor((hash / 0.7) * 8),
      depth = Math.max(wall, decorative);
    for (let k = 1; k <= depth; k++) pillars.push({ x: b.x, y: b.y - k, z: b.z, solid: k <= wall });
  }
  return pillars;
}
