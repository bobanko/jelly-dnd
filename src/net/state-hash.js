// Bit-exact fingerprint of the simulation state. Two machines that fed the same inputs to the
// same level must print the same number on every tick; a difference means they have diverged.
const view = new DataView(new ArrayBuffer(8));
const mix = (h, n) => Math.imul(h ^ n, 16777619) >>> 0;
function mixNumber(h, value) {
  // Every NaN hashes alike; -0 and 0 stay distinct because they can steer later arithmetic.
  view.setFloat64(0, Number.isNaN(value) ? NaN : value);
  return mix(mix(h, view.getUint32(0)), view.getUint32(4));
}
function mixString(h, text) {
  for (let i = 0; i < text.length; i++) h = mix(h, text.charCodeAt(i));
  return mix(h, text.length);
}

// Walks arrays, typed arrays, maps, sets and objects in their own order. Shared and cyclic
// references hash as the index of the first visit. Functions and weak collections are skipped.
function walk(h, value, seen) {
  if (value === null || value === undefined) return mix(h, value === null ? 1 : 2);
  switch (typeof value) {
    case 'number':
      return mixNumber(h, value);
    case 'boolean':
      return mix(h, value ? 3 : 4);
    case 'string':
      return mixString(h, value);
    case 'object':
      break;
    default:
      return h;
  }
  if (value instanceof WeakMap || value instanceof WeakSet) return h;
  const known = seen.get(value);
  if (known !== undefined) return mix(mix(h, 5), known);
  seen.set(value, seen.size);
  if (ArrayBuffer.isView(value) || Array.isArray(value)) {
    h = mix(h, value.length);
    for (let i = 0; i < value.length; i++) h = walk(h, value[i], seen);
    return h;
  }
  if (value instanceof Map) {
    h = mix(h, value.size);
    for (const [key, item] of value) h = walk(walk(h, key, seen), item, seen);
    return h;
  }
  if (value instanceof Set) {
    h = mix(h, value.size);
    for (const item of value) h = walk(h, item, seen);
    return h;
  }
  for (const key in value) {
    const item = value[key];
    if (typeof item === 'function') continue;
    h = walk(mixString(h, key), item, seen);
  }
  return h;
}

// Everything the next step reads: the world (mechanisms, combat, timers), the bodies and
// their soft lattices, which the world keeps in a WeakMap the walk cannot enumerate.
export function hashState(world, bodies) {
  const seen = new Map();
  let h = walk(2166136261, bodies, seen);
  if (world.soft) for (const body of bodies) h = walk(h, world.soft.get(body), seen);
  return walk(h, world, seen);
}

// Cheap per-tick check for a running game: positions and velocities only. Hidden state that
// drifts shows up here within a few ticks.
export function hashBodies(bodies) {
  let h = 2166136261;
  for (const p of bodies) {
    for (const v of [p.x, p.y ?? 0, p.z, p.vx ?? 0, p.vy ?? 0, p.vz ?? 0]) h = mixNumber(h, v);
    h = mixString(h, p.state ?? 'alive');
  }
  return h;
}
