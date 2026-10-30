// How much of a jelly is hidden behind masonry, for the see-through halo.
// Rays from lattice nodes towards the camera walk the stone cell grid (3D DDA). A cell key
// "x,y,z" is the cube spanning [x-.5, x+.5] × [y-1, y] × [z-.5, z+.5].
const MAX_DISTANCE = 30;

function blocked(occluders, top, start, direction) {
  // Grid coordinates where cell (x, y, z) covers [x, x+1) × [y-1, y) × [z, z+1).
  const origin = [start[0] + 0.5, start[1], start[2] + 0.5],
    cell = origin.map(Math.floor),
    step = direction.map((d) => (d > 0 ? 1 : d < 0 ? -1 : 0)),
    delta = direction.map((d) => (d ? Math.abs(1 / d) : Infinity)),
    next = direction.map((d, k) =>
      d > 0 ? (cell[k] + 1 - origin[k]) / d : d < 0 ? (cell[k] - origin[k]) / d : Infinity,
    );
  let travelled = 0;
  while (travelled < MAX_DISTANCE) {
    // Rays climb towards the camera: past the highest stone nothing can block them.
    if (direction[1] > 0 && cell[1] + 1 > top) return false;
    const axis = next[0] < next[1] ? (next[0] < next[2] ? 0 : 2) : next[1] < next[2] ? 1 : 2;
    travelled = next[axis];
    cell[axis] += step[axis];
    next[axis] += delta[axis];
    if (occluders.has(cell[0] + ',' + (cell[1] + 1) + ',' + cell[2])) return true;
  }
  return false;
}

// Fraction of sample points (0..1) with stone between them and the camera.
export function hiddenFraction(occluders, points, frame) {
  if (!occluders.size || !points.length) return 0;
  const top = occluders.top ?? Infinity;
  let hidden = 0;
  for (const p of points) {
    let direction = frame.view;
    if (frame.perspective) {
      const d = frame.eye.map((v, k) => v - p[k]),
        length = Math.hypot(...d) || 1;
      direction = d.map((v) => v / length);
    }
    if (blocked(occluders, top, p, direction)) hidden++;
  }
  return hidden / points.length;
}

// Stone cells that hide what is behind them: masonry cubes, drawn columns, legacy floor
// tiles and full-size walls. Glass (coloured cubes) stays see-through.
export function occluderCells(level, blocks, pillars) {
  const cells = new Set();
  for (const b of blocks) if (b.color === undefined) cells.add(b.x + ',' + b.y + ',' + b.z);
  for (const p of pillars) cells.add(p.x + ',' + p.y + ',' + p.z);
  for (const key of level.floor || []) {
    const [x, z] = key.split(',').map(Number),
      upper = level.world.heights.get(key) || 0;
    for (let y = 0; y <= Math.ceil(upper); y++) cells.add(x + ',' + y + ',' + z);
  }
  for (const o of level.world.collisionBoxes().filter((o) => o.kind === 'wall' && o.half > 0.4))
    for (let y = Math.ceil(o.minY + 0.5); y <= Math.round(o.maxY); y++)
      cells.add(o.x + ',' + y + ',' + o.z);
  cells.top = Math.max(...[...cells].map((key) => Number(key.split(',')[1])));
  return cells;
}
