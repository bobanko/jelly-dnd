import * as GPU from '../renderer/index.js';
const geometryCache = new WeakMap(),
  overviewCache = new WeakMap();
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function extent(corners) {
  const bounds = (axis) => [
    Math.min(...corners.map((p) => p[axis])),
    Math.max(...corners.map((p) => p[axis])),
  ];
  return [bounds(0), bounds(1), bounds(2)];
}
function geometry(definition) {
  if (geometryCache.has(definition)) return geometryCache.get(definition);
  const corners = [];
  const box = (p, bottom, top, half = 0.9) => {
    for (const dx of [-half, half])
      for (const dz of [-half, half])
        for (const y of [bottom, top]) corners.push([p.x + dx, y, p.z + dz]);
  };
  for (const p of definition.blocks || []) box(p, (p.y ?? 0) - 1.1, (p.y ?? 0) + 1.15);
  for (const p of definition.tiles || []) box(p, -1.1, (p.height ?? 0) + 1.15);
  for (const p of definition.walls || [])
    box(p, (p.base ?? 0) - 0.1, (p.base ?? 0) + (p.height ?? 1) + 0.15);
  for (const key of [
    'spawns',
    'goals',
    'crates',
    'archers',
    'pickups',
    'portals',
    'plates',
    'bridges',
    'conveyors',
    'spikes',
    'torches',
    'drones',
    'lifts',
  ])
    for (const p of definition[key] || []) {
      if (!p) continue;
      const floor =
        p.y ??
        Math.max(
          0,
          ...(definition.blocks || []).filter((b) => b.x === p.x && b.z === p.z).map((b) => b.y),
          ...(definition.tiles || [])
            .filter((b) => b.x === p.x && b.z === p.z)
            .map((b) => b.height),
        );
      box(
        p,
        p.base ?? floor,
        key === 'lifts'
          ? (p.top ?? floor) + 0.2
          : floor + (p.hover ?? 0) + (key === 'archers' ? 1.7 : 1.15),
        0.75,
      );
    }
  geometryCache.set(definition, corners);
  return corners;
}
function target(players, definition, camera, angle, width, height, overviewAmount = 0) {
  const points = players.map((p) =>
    p.state === 'alive' || !p.state
      ? { x: p.rx ?? p.x, z: p.rz ?? p.z, y: p.y || 0 }
      : { x: p.spawn?.x ?? p.x, z: p.spawn?.z ?? p.z, y: p.spawn?.y || 0 },
  );
  const roster = points.flatMap((p) =>
    [-0.85, 0.85].flatMap((dx) =>
      [-0.85, 0.85].flatMap((dz) => [p.y, p.y + 1.15].map((y) => [p.x + dx, y, p.z + dz])),
    ),
  );
  const authored = geometry(definition),
    scene = authored.length ? authored : roster;
  const [[x0, x1], [y0, y1], [z0, z1]] = extent(scene);
  const base = Math.min(width / 16, height / 12);
  // Fit actual projected geometry; no empty map grid or all-orbit circle.
  function fit(corners, anchor, maximum, centre = true) {
    const result = { ...anchor };
    const fits = (zoom) => {
      const frame = GPU.cameraFrame(
        { ...camera, ...anchor, frameY: 0.5 },
        angle,
        width,
        height,
        base * zoom,
      );
      const projected = corners.map((p) => GPU.projectPoint(frame, ...p, width, height));
      const top = Math.min(...projected.map((p) => p.y)),
        bottom = Math.max(...projected.map((p) => p.y));
      const preferred = centre
        ? height * 0.47 - (top + bottom) / 2
        : (anchor.frameY - 0.5) * height;
      const shift = clamp(preferred, height * 0.08 - top + 0.01, height * 0.86 - bottom - 0.01);
      result.frameY = 0.5 + shift / height;
      return projected.every(
        (q) =>
          q.visible &&
          q.x > width * 0.12 &&
          q.x < width * 0.88 &&
          q.y + shift > height * 0.08 &&
          q.y + shift < height * 0.86,
      );
    };
    let zoom = maximum;
    if (!fits(zoom)) {
      let lower = 0.0001,
        upper = maximum;
      for (let i = 0; i < 18; i++) {
        const middle = (lower + upper) / 2;
        if (fits(middle)) lower = middle;
        else upper = middle;
      }
      zoom = lower;
    }
    fits(zoom);
    return { ...result, zoom };
  }
  const viewKey = [camera.mode, camera.pitch, camera.fov, angle, width, height].join(':');
  let overview = authored.length ? overviewCache.get(definition) : null;
  if (overview?.key !== viewKey) {
    overview = {
      ...fit(
        scene,
        { x: (x0 + x1) / 2, z: (z0 + z1) / 2, targetY: (y0 + y1) / 2, focusHeight: (y0 + y1) / 2 },
        8,
      ),
      key: viewKey,
    };
    if (authored.length) overviewCache.set(definition, overview);
  }
  const bounds = (axis) => [
    Math.min(...points.map((p) => p[axis])),
    Math.max(...points.map((p) => p[axis])),
  ];
  const [px0, px1] = bounds('x'),
    [py0, py1] = bounds('y'),
    [pz0, pz1] = bounds('z');
  let spread = 0;
  for (const a of points)
    for (const b of points) spread = Math.max(spread, Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z));
  // Close together: 150% of the overview scale and follow the party.
  // Spread across the level: stop at the full-level overview.
  const far = Math.max(3, Math.hypot(x1 - x0, z1 - z0) * 0.65);
  const t = clamp((spread - 2) / (far - 2), 0, 1),
    follow = (1 - t * t * (3 - 2 * t)) * (1 - clamp(overviewAmount, 0, 1));
  const close = fit(
    roster,
    {
      x: (px0 + px1) / 2,
      z: (pz0 + pz1) / 2,
      targetY: (py0 + py1) / 2,
      focusHeight: (py0 + py1) / 2 + 0.42,
    },
    overview.zoom * 1.5,
  );
  const result = {};
  for (const key of ['x', 'z', 'targetY', 'focusHeight', 'frameY', 'zoom'])
    result[key] = overview[key] + (close[key] - overview[key]) * follow;
  // Interpolating anchors must never crop a hero, including elevated players.
  return fit(roster, result, result.zoom, false);
}
export { target };
