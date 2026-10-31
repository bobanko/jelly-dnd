import * as GPU from '../renderer/index.js';
import * as Features from '../world/level-features.js';
import Levels from '../world/levels.js';
// Picking uses the same view-projection matrix as the game renderer.
function inverse(matrix) {
  const rows = Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 8 }, (_, c) => (c < 4 ? matrix[c * 4 + r] : +(c - 4 === r))),
  );
  for (let c = 0; c < 4; c++) {
    let pivot = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(rows[r][c]) > Math.abs(rows[pivot][c])) pivot = r;
    if (Math.abs(rows[pivot][c]) < 1e-12) return null;
    [rows[c], rows[pivot]] = [rows[pivot], rows[c]];
    const scale = rows[c][c];
    for (let k = 0; k < 8; k++) rows[c][k] /= scale;
    for (let r = 0; r < 4; r++)
      if (r !== c) {
        const f = rows[r][c];
        for (let k = 0; k < 8; k++) rows[r][k] -= rows[c][k] * f;
      }
  }
  return Array.from({ length: 16 }, (_, i) => rows[i % 4][4 + Math.floor(i / 4)]);
}
function ray(frame, x, y, width, height) {
  const m = inverse(frame.vp);
  if (!m || !width || !height) return null;
  const unproject = (z) => {
    const p = [(x / width) * 2 - 1, 1 - (y / height) * 2, z, 1],
      q = Array.from({ length: 4 }, (_, r) => p.reduce((s, v, c) => s + v * m[c * 4 + r], 0));
    return q.slice(0, 3).map((v) => v / q[3]);
  };
  const origin = unproject(0),
    far = unproject(1),
    length = Math.hypot(...far.map((v, k) => v - origin[k]));
  return { origin, direction: far.map((v, k) => (v - origin[k]) / length) };
}
function plane(ray, y) {
  if (!ray || Math.abs(ray.direction[1]) < 1e-8) return null;
  const distance = (y - ray.origin[1]) / ray.direction[1];
  if (distance < 0) return null;
  return { position: ray.origin.map((v, k) => v + ray.direction[k] * distance), distance };
}
function boxHit(ray, box) {
  let enter = 0,
    exit = Infinity,
    axis = -1,
    sign = 0;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(ray.direction[k]) < 1e-10) {
      if (ray.origin[k] < box.min[k] || ray.origin[k] > box.max[k]) return null;
      continue;
    }
    let a = (box.min[k] - ray.origin[k]) / ray.direction[k],
      b = (box.max[k] - ray.origin[k]) / ray.direction[k],
      s = -1;
    if (a > b) {
      [a, b] = [b, a];
      s = 1;
    }
    if (a > enter) {
      enter = a;
      axis = k;
      sign = s;
    }
    exit = Math.min(exit, b);
    if (enter > exit) return null;
  }
  if (exit < 0) return null;
  return {
    distance: enter,
    position: ray.origin.map((v, k) => v + ray.direction[k] * enter),
    axis,
    sign,
  };
}
function boxes(map) {
  const result = [],
    heights = new Map(map.tiles.map((p) => [`${p.x},${p.z}`, p.height]));
  const add = (p, key, half, lo, hi) =>
    result.push({
      x: p.x,
      y: p.y ?? (key === 'tiles' ? p.height : lo),
      z: p.z,
      key,
      index: p.pickIndex ?? map[key].indexOf(p),
      min: [p.x - half, lo, p.z - half],
      max: [p.x + half, hi, p.z + half],
    });
  for (const [pickIndex, p] of (map.blocks || []).entries())
    add({ ...p, pickIndex }, 'blocks', 0.5, p.y - 1, p.y);
  for (const [pickIndex, p] of map.tiles.entries())
    add({ ...p, pickIndex }, 'tiles', 0.5, -0.72, p.height);
  for (const [pickIndex, p] of map.walls.entries())
    add({ ...p, pickIndex }, 'walls', p.half, p.base, p.base + p.height);
  for (const [pickIndex, p] of (map.drones || []).entries()) {
    const y = p.y ?? heights.get(`${p.x},${p.z}`) ?? Levels.surfaceY(map, p.x, p.z) ?? 0;
    const center = Levels.droneOrigin({ ...p, y })[1];
    add({ ...p, y, pickIndex }, 'drones', 0.32, center - 0.56, center + 0.56);
  }
  for (const [index, p] of (map.torches || []).entries()) {
    const f = Levels.torchFrame(p),
      center = f.origin.map((v, k) => v + f.n[k] * 0.18),
      half = f.n.map((n, k) => Math.abs(n) * 0.18 + Math.abs(f.u[k]) * 0.14 + (k === 1 ? 0.48 : 0));
    result.push({
      ...p,
      key: 'torches',
      index,
      min: center.map((v, k) => v - half[k]),
      max: center.map((v, k) => v + half[k]),
    });
  }
  for (const key of ['spawns', 'crates', 'archers'])
    for (const [pickIndex, p] of map[key].entries())
      if (p) {
        const y = p.y ?? heights.get(`${p.x},${p.z}`) ?? 0;
        add(
          { ...p, y, pickIndex },
          key,
          key === 'archers' ? 0.26 : p.large ? 0.48 : 0.4,
          y,
          y + (key === 'archers' ? 1.2 : p.large ? 0.98 : 0.84),
        );
      }
  for (const key of ['goals', 'plates', 'bridges', 'lifts', 'portals', 'conveyors', 'pickups'])
    for (const [pickIndex, p] of map[key].entries())
      if (p) {
        const y = p.y ?? p.base ?? heights.get(`${p.x},${p.z}`) ?? 0;
        add(
          { ...p, y, pickIndex },
          key,
          key === 'pickups' ? 0.28 : key === 'plates' ? 0.35 : 0.46,
          y,
          y + (key === 'pickups' ? 0.35 : key === 'plates' ? 0.065 : 0.12),
        );
      }
  for (const [index, p] of map.spikes.entries()) {
    const y =
        p.y ??
        heights.get(`${p.x},${p.z}`) ??
        Math.max(
          0,
          ...(map.blocks || []).filter((b) => b.x === p.x && b.z === p.z).map((b) => b.y),
        ),
      f = Features.spikeFrame(p, y);
    for (const b of Features.spikeBoxes(p, y)) {
      const center = [b.x, (b.minY + b.maxY) * 0.5, b.z],
        half = [b.halfX, (b.maxY - b.minY) * 0.5, b.halfZ];
      result.push({
        x: p.x,
        y,
        z: p.z,
        key: 'spikes',
        face: p.face || 'top',
        index,
        min: center.map((v, k) => v - Math.max(half[k], Math.abs(f.n[k]) * 0.015)),
        max: center.map((v, k) => v + Math.max(half[k], Math.abs(f.n[k]) * 0.015)),
      });
    }
  }
  return result;
}
function pick(ray, bounds, size, height = 0, lockedHeight = null) {
  if (!ray) return null;
  if (lockedHeight !== null) {
    const hit = plane(ray, lockedHeight);
    return hit
      ? {
          x: Math.round(hit.position[0]),
          z: Math.round(hit.position[2]),
          height: lockedHeight,
          key: null,
          hit,
        }
      : null;
  }
  let nearest = null;
  for (const box of bounds) {
    const hit = boxHit(ray, box);
    if (hit && (!nearest || hit.distance < nearest.hit.distance))
      nearest = {
        x: box.x,
        y: box.y,
        z: box.z,
        height: box.max[1],
        key: box.key,
        index: box.index,
        ...(box.face ? { face: box.face } : {}),
        hit,
      };
  }
  if (nearest) return nearest;
  const hit = plane(ray, height);
  if (!hit) return null;
  const x = Math.round(hit.position[0]),
    z = Math.round(hit.position[2]);
  return size === null || (x >= 0 && z >= 0 && x < size && z < size)
    ? { x, z, height, key: null, hit }
    : null;
}
function frame(camera, angle, width, height, scale) {
  return GPU.cameraFrame(camera, angle, width, height, scale);
}
export { inverse, ray, plane, boxHit, boxes, pick, frame };
