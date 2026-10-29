import Levels from './levels.js';
const PORTAL_LIMIT = Levels.limits.portals,
  PORTAL_FLOATS = 12,
  GOALS_OFFSET = 56 + PORTAL_LIMIT * PORTAL_FLOATS,
  TORCHES_OFFSET = GOALS_OFFSET + 40,
  BODY3_OFFSET = TORCHES_OFFSET + 32,
  BODY4_OFFSET = BODY3_OFFSET + 4,
  BODY_SLOTS_OFFSET = BODY4_OFFSET + 4,
  FINISH_OFFSET = BODY_SLOTS_OFFSET + 8,
  GOAL_SLOTS_OFFSET = FINISH_OFFSET + 4,
  SCENE_FLOATS = GOAL_SLOTS_OFFSET + 8;
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0),
  cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
const normalize = (a) => {
  const l = Math.hypot(...a) || 1;
  return a.map((v) => v / l);
};
function viewMatrix(center, view, width, height, offset = 0, depthRange = 40) {
  const right = normalize(cross([0, 1, 0], view)),
    up = normalize(cross(view, right)),
    m = new Float32Array(16);
  for (let k = 0; k < 3; k++) {
    m[k * 4] = (right[k] * 2) / width;
    m[k * 4 + 1] = (up[k] * 2) / height;
    m[k * 4 + 2] = -view[k] / depthRange;
  }
  m[12] = (-dot(right, center) * 2) / width;
  m[13] = (-dot(up, center) * 2) / height + offset;
  m[14] = 0.5 + dot(view, center) / depthRange;
  m[15] = 1;
  return m;
}
function cameraFrame(camera, angle, width, height, scale) {
  const perspective = camera.mode === 'perspective',
    pitch = ((camera.pitch ?? 30) * Math.PI) / 180,
    azimuth = angle + Math.PI / 4;
  const view = [
      Math.sin(azimuth) * Math.cos(pitch),
      Math.sin(pitch),
      Math.cos(azimuth) * Math.cos(pitch),
    ],
    target = [camera.x, camera.targetY ?? 0, camera.z],
    offset = 1 - 2 * (camera.frameY ?? 0.56);
  const referenceDistance = Math.max(5, height / scale / (2 * Math.tan(Math.PI / 8))),
    focusDepth = view[1] * ((camera.focusHeight ?? 0.42) - (camera.targetY ?? 0));
  // Compensate focal length at the followed jelly's centre: FOV changes
  // perspective strength while keeping that character's apparent size stable.
  const distance = perspective
    ? focusDepth +
      ((referenceDistance - focusDepth) * Math.tan(Math.PI / 8)) /
        Math.tan(((camera.fov ?? 45) * Math.PI) / 360)
    : 20;
  const eye = target.map((v, k) => v + view[k] * distance);
  if (!perspective)
    return {
      vp: viewMatrix(
        target,
        view,
        width / scale,
        height / scale,
        offset,
        Math.max(40, (width / scale) * 2, (height / scale) * 2),
      ),
      view,
      eye,
      perspective,
      distance,
    };
  const right = normalize(cross([0, 1, 0], view)),
    up = normalize(cross(view, right)),
    f = 1 / Math.tan(((camera.fov ?? 45) * Math.PI) / 360);
  const near = 0.1,
    far = Math.max(120, distance + 60),
    a = far / (far - near),
    b = near * a,
    vp = new Float32Array(16),
    eyeDepth = distance + dot(view, target);
  // WebGPU uses a zero-to-one depth range. The offset keeps the followed cube
  // at the same screen anchor in both projection modes.
  for (let k = 0; k < 3; k++) {
    vp[k * 4] = (right[k] * f * height) / width;
    vp[k * 4 + 1] = up[k] * f - offset * view[k];
    vp[k * 4 + 2] = -a * view[k];
    vp[k * 4 + 3] = -view[k];
  }
  vp[12] = (-dot(right, target) * f * height) / width;
  vp[13] = -dot(up, target) * f + offset * eyeDepth;
  vp[14] = a * eyeDepth - b;
  vp[15] = eyeDepth;
  return { vp, view, eye, perspective, distance };
}
function projectPoint(frame, x, y, z, width, height) {
  const m = frame.vp,
    w = m[3] * x + m[7] * y + m[11] * z + m[15],
    depth = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w;
  return {
    x: (((m[0] * x + m[4] * y + m[8] * z + m[12]) / w) * 0.5 + 0.5) * width,
    y: (0.5 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w) * 0.5) * height,
    depth,
    visible: w > 0 && depth >= 0 && depth <= 1,
    scale: (Math.hypot(m[0], m[4], m[8]) * width * 0.5) / w,
  };
}
// Stone stays below material id .5, so its fraction can carry the baked moss amount.
const STONE_DETAIL = 0.45;
// Broad moss patches, evaluated per vertex: smooth enough to interpolate across a face.
const mossAt = ([x, y, z]) =>
  Math.sin(x * 1.9 + z * 0.7 + Math.sin(z * 1.3)) * Math.sin(z * 2.3 - y * 1.4 + x * 0.5) * 0.45 +
  0.42;
// crisp: flat faces with narrow rounded bevels (grid lines at the bevel start).
// shade(axis,sign,s,t): per-vertex brightness, used for baked contact occlusion.
// detail(position): per-vertex value 0..1 stored in the material's fraction (stone moss).
function box(
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
function crateGeometry() {
  const mesh = [],
    wood = [0.64, 0.355, 0.145],
    frame = [0.8, 0.49, 0.225],
    endGrain = [0.69, 0.405, 0.19],
    nail = [0.19, 0.135, 0.085];
  // Work in face-local coordinates so grain, wear and hardware tumble with the crate.
  const plank = (center, size, color, seed, bevel = 0.009) => {
    const start = mesh.length,
      vertical = size[1] > size[0];
    box(mesh, center, size, color, bevel, 11, 3, {
      crisp: true,
      shade: (axis, sign, s, t) => {
        const edge = Math.min(s, t, 1 - s, 1 - t);
        return axis === 2 && sign > 0 ? 0.92 + Math.max(0, 1 - edge * 18) * 0.16 : 0.86;
      },
    });
    // Shallow corner chips expose pale fibres without opening holes in the box.
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
  };
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
      // Small recessed iron nail heads, one per rail end, instead of corner plates.
      for (const x of [-0.326, 0.326])
        for (const y of [-0.326, 0.326])
          for (let k = 0; k < 8; k++) {
            const a = (k * Math.PI) / 4,
              b = ((k + 1) * Math.PI) / 4;
            for (const [px, py, pz] of [
              [0, 0, 0.0015],
              [Math.cos(a) * 0.008, Math.sin(a) * 0.008, 0],
              [Math.cos(b) * 0.008, Math.sin(b) * 0.008, 0],
            ])
              mesh.push(x + px, y + py, 0.424 + pz, 0, 0, 1, ...nail, 11, 0.3, 0.4);
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

const unitSphere = (() => {
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
const lowSphere = (() => {
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
function sphere(mesh, center, size, color, material = 1, basis = null, shape = unitSphere) {
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
function rod(mesh, a, b, width, color, material = 1) {
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
function shieldGeometry() {
  const mesh = [],
    iron = [0.27, 0.28, 0.26],
    wood = [0.44, 0.29, 0.13];
  pressureSurface(
    mesh,
    [0, 0, 0],
    [
      [0, 0],
      [0.27, 0],
      [0.27, 0.052],
      [0, 0.052],
    ],
    wood,
    11,
    0,
    32,
  );
  pressureSurface(
    mesh,
    [0, 0, 0],
    [
      [0.265, 0],
      [0.31, 0],
      [0.31, 0.025],
      [0.3, 0.07],
      [0.27, 0.075],
      [0.265, 0.055],
      [0.265, 0],
    ],
    iron,
    12,
    0,
    32,
  );
  // Turn the lathed disc upright and give it the oval proportions of an oak shield.
  for (let k = 0; k < mesh.length; k += 12) {
    const y = mesh[k + 1],
      ny = mesh[k + 4];
    mesh[k] *= 0.9;
    mesh[k + 1] = -mesh[k + 2] * 1.1;
    mesh[k + 2] = y;
    mesh[k + 4] = -mesh[k + 5];
    mesh[k + 5] = ny;
    if (mesh[k + 9] === 11) {
      mesh[k + 10] = 0.5 + mesh[k] * 1.6;
      mesh[k + 11] = 0.5 - mesh[k + 1] * 1.4;
    }
  }
  for (const x of [-0.16, -0.08, 0, 0.08, 0.16]) {
    const h = 0.58 * Math.sqrt(1 - (x / 0.245) ** 2);
    box(mesh, [x, 0, 0.054], [0.005, h, 0.003], [0.07, 0.045, 0.02], 0.001, 13, 1);
  }
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    sphere(
      mesh,
      [Math.cos(a) * 0.259, Math.sin(a) * 0.318, 0.069],
      [0.013, 0.013, 0.012],
      [0.55, 0.51, 0.38],
      12,
    );
  }
  sphere(mesh, [0, 0, 0.065], [0.085, 0.085, 0.025], iron, 12);
  sphere(mesh, [0, 0, 0.093], [0.047, 0.047, 0.045], [0.46, 0.46, 0.39], 12);
  return mesh;
}
const beamColors = [
  [0.12, 1, 0.16],
  [0.035, 0.22, 1],
  [1, 0.065, 0.035],
  [0.72, 0.12, 1],
  [1, 0.68, 0.035],
];
// Bubbles rise through a .51-unit column inside each jelly and wrap around.
const BUBBLES = 7,
  BUBBLE_SPACING = 0.51 / BUBBLES;
function droneGeometry(color) {
  const mesh = [],
    crystal = [],
    rings = [
      [-0.56, 0],
      [-0.22, 0.255],
      [0.19, 0.28],
      [0.36, 0.19],
      [0.56, 0],
    ],
    bronze = [0.38, 0.24, 0.1];
  for (let r = 0; r < rings.length - 1; r++)
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        b = ((i + 1) * Math.PI) / 4,
        p = (ring, angle) => [Math.cos(angle) * ring[1], ring[0], Math.sin(angle) * ring[1]],
        quad = [p(rings[r], a), p(rings[r + 1], a), p(rings[r + 1], b), p(rings[r], b)];
      const uv = [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 0],
      ];
      for (const triangle of [
        [0, 1, 2],
        [0, 2, 3],
      ]) {
        const ps = triangle.map((i) => quad[i]),
          n = normalize(
            cross(
              ps[1].map((v, k) => v - ps[0][k]),
              ps[2].map((v, k) => v - ps[0][k]),
            ),
          );
        if (Math.hypot(...n) < 0.1) continue;
        for (const j of triangle)
          crystal.push(
            ...quad[j],
            ...n,
            ...color.map((v) => v * (0.63 + (i % 3) * 0.15 + r * 0.035)),
            25,
            ...uv[j],
          );
      }
    }
  for (const y of [-0.23, 0.16]) {
    pressureSurface(
      mesh,
      [0, y, 0],
      [
        [0.245, 0],
        [0.295, 0],
        [0.315, 0.015],
        [0.315, 0.05],
        [0.29, 0.065],
        [0.245, 0.065],
        [0.245, 0],
      ],
      bronze,
      12,
      0,
      8,
    );
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.4;
      sphere(
        mesh,
        [Math.cos(a) * 0.306, y + 0.035, Math.sin(a) * 0.306],
        [0.023, 0.023, 0.023],
        [0.68, 0.45, 0.18],
        12,
      );
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + 0.4,
      x = Math.cos(a) * 0.29,
      z = Math.sin(a) * 0.29;
    rod(mesh, [x, -0.16, z], [x, 0.18, z], 0.025, bronze, 12);
  }
  // A small luminous heart is visible through the independently blended facets.
  for (let k = 0; k < crystal.length; k += 12)
    mesh.push(
      crystal[k] * 0.26,
      crystal[k + 1] * 0.32,
      crystal[k + 2] * 0.26,
      ...crystal.slice(k + 3, k + 6),
      ...color,
      4,
      0,
      0,
    );
  return { mesh, crystal };
}
function arrowGeometry() {
  const mesh = [];
  rod(mesh, [0, 0, -0.34], [0, 0, 0.08], 0.017, [0.46, 0.31, 0.12], 11);
  // Four triangular metal faces form a readable arrowhead, with pale fletching behind.
  const tip = [0, 0, 0.19],
    base = [
      [0.042, 0, 0.06],
      [0, 0.042, 0.06],
      [-0.042, 0, 0.06],
      [0, -0.042, 0.06],
    ];
  for (let i = 0; i < 4; i++) {
    const a = base[i],
      b = base[(i + 1) % 4],
      normal = normalize(
        cross(
          b.map((v, k) => v - a[k]),
          tip.map((v, k) => v - a[k]),
        ),
      );
    for (const p of [a, b, tip]) mesh.push(...p, ...normal, 0.63, 0.64, 0.58, 12, 0, 0);
  }
  for (const a of [0, Math.PI / 2]) {
    const from = mesh.length;
    box(mesh, [0, 0.035, -0.27], [0.012, 0.08, 0.12], [0.7, 0.65, 0.5], 0.002, 1, 1);
    for (let k = from; k < mesh.length; k += 12)
      for (const offset of [0, 3]) {
        const x = mesh[k + offset],
          y = mesh[k + offset + 1];
        mesh[k + offset] = x * Math.cos(a) - y * Math.sin(a);
        mesh[k + offset + 1] = x * Math.sin(a) + y * Math.cos(a);
      }
  }
  return mesh;
}
function swordGeometry() {
  const mesh = [],
    steel = [0.57, 0.63, 0.64],
    gold = [0.55, 0.34, 0.085];
  box(mesh, [0, -0.235, 0], [0.05, 0.18, 0.052], [0.105, 0.055, 0.024], 0.008, 13, 2);
  sphere(mesh, [0, -0.335, 0], [0.044, 0.04, 0.04], gold, 12);
  box(mesh, [0, -0.13, 0], [0.25, 0.048, 0.065], gold, 0.013, 12, 2);
  // Diamond section blade, with bevels meeting along a central ridge.
  const section = [
    [-0.057, 0],
    [0, 0.025],
    [0.057, 0],
    [0, -0.025],
  ];
  for (let j = 0; j < 4; j++) {
    const a = section[j],
      b = section[(j + 1) % 4],
      lo = [a[0], -0.1, a[1]],
      hi = [a[0], 0.43, a[1]],
      next = [b[0], 0.43, b[1]],
      bottom = [b[0], -0.1, b[1]],
      tip = [0, 0.61, 0];
    for (const tri of [
      [lo, hi, next],
      [lo, next, bottom],
      [hi, tip, next],
    ]) {
      const n = normalize(
        cross(
          tri[1].map((v, k) => v - tri[0][k]),
          tri[2].map((v, k) => v - tri[0][k]),
        ),
      );
      for (const p of tri) mesh.push(...p, ...n, ...steel, 12, 0, 0);
    }
  }
  sphere(mesh, [0, -0.13, 0.038], [0.022, 0.022, 0.011], [0.12, 0.42, 0.8], 4);
  return mesh;
}
function archerGeometry() {
  const mesh = [],
    bone = [0.72, 0.67, 0.47],
    dark = [0.028, 0.023, 0.018],
    joint = (p, r = 0.037) => sphere(mesh, p, [r, r, r], bone),
    limb = (a, b, w = 0.05) => {
      rod(mesh, a, b, w, bone);
      joint(a, w * 0.65);
      joint(b, w * 0.65);
    };
  // Skull, separate jaw, sockets, nasal cavity and individual teeth.
  sphere(mesh, [0, 1.04, 0], [0.158, 0.17, 0.14], bone);
  sphere(mesh, [0, 0.905, 0.025], [0.108, 0.065, 0.108], bone);
  for (const s of [-1, 1]) {
    sphere(mesh, [s * 0.061, 1.06, 0.125], [0.046, 0.052, 0.025], dark);
    sphere(mesh, [s * 0.061, 1.06, 0.148], [0.012, 0.016, 0.009], [1.6, 0.38, 0.035], 4);
  }
  sphere(mesh, [0, 0.996, 0.14], [0.022, 0.028, 0.012], dark);
  for (const x of [-0.067, -0.022, 0.022, 0.067])
    box(mesh, [x, 0.922, 0.12], [0.027, 0.037, 0.024], bone, 0.005, 1, 2);
  limb([0, 0.41, 0], [0, 0.88, 0], 0.055);
  for (let i = 0; i < 4; i++)
    for (const s of [-1, 1]) {
      const y = 0.79 - i * 0.073;
      rod(mesh, [s * 0.02, y, -0.025], [s * (0.17 - i * 0.013), y - 0.017, 0.005], 0.028, bone);
      rod(
        mesh,
        [s * (0.17 - i * 0.013), y - 0.017, 0.005],
        [s * 0.07, y - 0.043, 0.095],
        0.026,
        bone,
      );
    }
  limb([-0.17, 0.83, 0], [0.17, 0.83, 0], 0.045);
  sphere(mesh, [0, 0.43, 0], [0.12, 0.07, 0.075], bone);
  for (const s of [-1, 1]) {
    limb([s * 0.075, 0.41, 0], [s * 0.115, 0.22, s * 0.025], 0.055);
    limb([s * 0.115, 0.22, s * 0.025], [s * 0.14, 0.04, 0.035], 0.045);
    box(mesh, [s * 0.14, 0.035, 0.09], [0.09, 0.065, 0.18], bone, 0.02, 1, 2);
  }
  // One arm holds the bow, the other draws the string back to the ribs.
  limb([-0.17, 0.83, 0], [-0.22, 0.65, 0.16], 0.044);
  limb([-0.22, 0.65, 0.16], [-0.09, 0.57, 0.34], 0.038);
  limb([0.17, 0.83, 0], [0.27, 0.64, -0.045], 0.044);
  limb([0.27, 0.64, -0.045], [0.025, 0.57, 0.09], 0.038);
  sphere(mesh, [-0.09, 0.57, 0.34], [0.043, 0.043, 0.048], bone);
  sphere(mesh, [0.025, 0.57, 0.09], [0.042, 0.042, 0.042], bone);
  return mesh;
}
function bowGeometry() {
  const mesh = [],
    points = [
      [-0.09, 0.19, 0.21],
      [-0.09, 0.29, 0.32],
      [-0.09, 0.43, 0.4],
      [-0.09, 0.57, 0.42],
      [-0.09, 0.71, 0.4],
      [-0.09, 0.85, 0.32],
      [-0.09, 0.95, 0.21],
    ];
  for (let i = 1; i < points.length; i++)
    rod(mesh, points[i - 1], points[i], 0.035, [0.44, 0.23, 0.075], 11);
  rod(mesh, [-0.09, 0.51, 0.42], [-0.09, 0.63, 0.42], 0.047, [0.13, 0.08, 0.04], 13);
  return mesh;
}
const spikeTints = [
  [0.16, 0.75, 0.09],
  [0.045, 0.24, 0.95],
  [0.95, 0.045, 0.025],
  [0.63, 0.12, 0.88],
  [0.95, 0.6, 0.025],
];
const spikeTint = (trap) =>
  trap.color === undefined ? [0.58, 0.63, 0.68] : spikeTints[trap.color];
function spikeSocket(mesh, x, z, tint) {
  const profile = [
      [0.082, 0.003],
      [0.125, 0.003],
      [0.132, 0.011],
      [0.121, 0.028],
      [0.085, 0.028],
      [0.08, 0.014],
      [0.082, 0.003],
    ],
    color = tint.map((c) => c * 0.72 + 0.02);
  for (let band = 0; band < profile.length - 1; band++) {
    const [r0, y0] = profile[band],
      [r1, y1] = profile[band + 1],
      a = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ];
    for (let side = 0; side < 4; side++) {
      const p = a[side],
        q = a[(side + 1) % 4],
        vertices = [
          [x + p[0] * r0, y0, z + p[1] * r0],
          [x + p[0] * r1, y1, z + p[1] * r1],
          [x + q[0] * r1, y1, z + q[1] * r1],
          [x + q[0] * r0, y0, z + q[1] * r0],
        ];
      const n = normalize(
        cross(
          vertices[1].map((v, k) => v - vertices[0][k]),
          vertices[2].map((v, k) => v - vertices[0][k]),
        ),
      );
      for (const i of [0, 1, 2, 0, 2, 3])
        mesh.push(
          ...vertices[i],
          ...n,
          ...color,
          28,
          (side + (i >= 2 ? 1 : 0)) / 4,
          (band + (i === 1 || i === 2 ? 1 : 0)) / (profile.length - 1),
        );
    }
  }
  box(mesh, [x, 0.004, z], [0.16, 0.006, 0.16], [0.008, 0.01, 0.012], 0.002, 13, 1);
}
function spike(mesh, x, y, z, tint) {
  const profile = [
    [-0.075, -0.075],
    [0.075, -0.075],
    [0.075, 0.075],
    [-0.075, 0.075],
  ];
  for (let i = 0; i < profile.length; i++) {
    const a = profile[i],
      b = profile[(i + 1) % profile.length],
      p = [x + a[0], y, z + a[1]],
      q = [x + b[0], y, z + b[1]],
      top = [x, y + 0.24, z],
      n = normalize(
        cross(
          top.map((v, k) => v - p[k]),
          q.map((v, k) => v - p[k]),
        ),
      ),
      color = tint.map((c) => c * (i % 2 ? 1 : 0.82));
    for (const [v, u, height] of [
      [p, 0, 0],
      [top, 0.5, 1],
      [q, 1, 0],
    ])
      mesh.push(...v, ...n, ...color, 27, u, height);
  }
}
function portalRing(mesh, x, y, z, color) {
  const vertex = (a, b) => {
    const radius = 0.3 + Math.cos(b) * 0.024;
    return [
      x + Math.cos(a) * radius,
      y + Math.sin(b) * 0.024,
      z + Math.sin(a) * radius,
      Math.cos(a) * Math.cos(b),
      Math.sin(b),
      Math.sin(a) * Math.cos(b),
      ...color,
      4,
      x,
      z,
    ];
  };
  for (let i = 0; i < 32; i++)
    for (let j = 0; j < 6; j++) {
      const a = (i / 32) * Math.PI * 2,
        b = (j / 6) * Math.PI * 2,
        da = Math.PI / 16,
        db = Math.PI / 3;
      mesh.push(
        ...vertex(a, b),
        ...vertex(a + da, b + db),
        ...vertex(a + da, b),
        ...vertex(a, b),
        ...vertex(a, b + db),
        ...vertex(a + da, b + db),
      );
    }
}
function pressureSurface(mesh, center, profile, color, material, tile = 0, segments = 48) {
  for (let band = 0; band < profile.length - 1; band++) {
    const [r0, y0] = profile[band],
      [r1, y1] = profile[band + 1],
      dr = r1 - r0,
      dy = y1 - y0,
      length = Math.hypot(dr, dy);
    const vertex = (a, r, y) => {
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r,
        uv = [
          ((tile % 4) + 0.02 + (0.5 + x / 0.6) * 0.96) / 4,
          (Math.floor(tile / 4) + 0.02 + (0.5 + z / 0.6) * 0.96) / 4,
        ];
      return [
        center[0] + x,
        center[1] + y,
        center[2] + z,
        (Math.cos(a) * dy) / length,
        -dr / length,
        (Math.sin(a) * dy) / length,
        ...color,
        material,
        ...uv,
      ];
    };
    for (let k = 0; k < segments; k++) {
      const a = (k / segments) * Math.PI * 2,
        b = ((k + 1) / segments) * Math.PI * 2;
      mesh.push(
        ...vertex(a, r0, y0),
        ...vertex(a, r1, y1),
        ...vertex(b, r1, y1),
        ...vertex(a, r0, y0),
        ...vertex(b, r1, y1),
        ...vertex(b, r0, y0),
      );
    }
  }
}
const runePaths = [
  [
    [
      [0, 0.26],
      [0, -0.26],
    ],
    [
      [0, 0.02],
      [-0.18, -0.17],
    ],
    [
      [0, 0.02],
      [0.18, -0.17],
    ],
  ],
  [
    [
      [0, -0.25],
      [0.2, 0],
      [0, 0.25],
      [-0.2, 0],
      [0, -0.25],
    ],
    [
      [-0.2, 0],
      [0.2, 0],
    ],
  ],
  [
    [
      [0.17, -0.25],
      [-0.12, -0.04],
      [0.12, 0.04],
      [-0.17, 0.25],
    ],
  ],
  [
    [
      [0, -0.25],
      [0.2, 0],
      [0, 0.25],
      [-0.2, 0],
      [0, -0.25],
    ],
  ],
  [
    [
      [-0.2, -0.25],
      [-0.2, 0.25],
      [0.2, -0.25],
      [0.2, 0.25],
      [-0.2, -0.25],
    ],
  ],
];
const runeGlyphShader = `
 fn runeSegment(p:vec2f,a:vec2f,b:vec2f)->f32{let ab=b-a;return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.,1.));}
 fn runeDistance(p:vec2f,glyph:u32)->f32{var distance=10.;
 ${runePaths.map((paths, index) => `if(glyph==${index}u){${paths.flatMap((path) => path.slice(1).map((b, j) => `distance=min(distance,runeSegment(p,vec2f(${path[j].join(',')}),vec2f(${b.join(',')})));`)).join('')}}`).join('')}
 return distance;}
 `;
function goalRune(mesh, center, index, color, material = 10) {
  const paths = runePaths[index];
  for (const path of paths)
    for (let j = 0; j < path.length - 1; j++) {
      const a = path[j],
        b = path[j + 1],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz),
        s = dx / length,
        c = dz / length,
        from = mesh.length;
      box(mesh, [0, 0, 0], [0.034, 0.007, length + 0.018], color, 0.003, material, 2);
      for (let k = from; k < mesh.length; k += 12) {
        const x = mesh[k],
          z = mesh[k + 2],
          nx = mesh[k + 3],
          nz = mesh[k + 5];
        mesh[k] = center[0] + (a[0] + b[0]) * 0.5 + x * c + z * s;
        mesh[k + 1] += center[1];
        mesh[k + 2] = center[2] + (a[1] + b[1]) * 0.5 - x * s + z * c;
        mesh[k + 3] = nx * c + nz * s;
        mesh[k + 5] = -nx * s + nz * c;
      }
    }
}
function colorBlockRunes(mesh, block, color, axis, sign) {
  const from = mesh.length,
    n = [0, 0, 0];
  n[axis] = sign;
  const u = axis === 1 ? [1, 0, 0] : [n[2], 0, -n[0]],
    v = cross(u, n);
  // A signed-distance sigil has a luminous core and halo without opaque plates.
  for (const [x, z] of [
    [-1, -1],
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
    [1, 1],
  ])
    mesh.push(x * 0.35, 0, z * 0.35, 0, 1, 0, ...color, 19 + block.color, x, z);
  for (let k = from; k < mesh.length; k += 12)
    for (const offset of [0, 3]) {
      const x = mesh[k + offset],
        y = mesh[k + offset + 1],
        z = mesh[k + offset + 2];
      for (let j = 0; j < 3; j++)
        mesh[k + offset + j] =
          u[j] * x +
          n[j] * y +
          v[j] * z +
          (offset === 0
            ? [block.x, block.y - 0.5, block.z][j] + n[j] * (axis === 1 ? 0.504 : 0.489)
            : 0);
    }
}
function phaseBlock(mesh, faces, block, color) {
  const shell = [];
  box(shell, [block.x, block.y - 0.5, block.z], [0.97, 1, 0.97], color, 0.075, 17, 6);
  // Keep each face and its rune together, so a jelly inside the block can be
  // composited between the far and near surfaces without opaque depth writes.
  const faceSize = shell.length / 6;
  for (let face = 0; face < 6; face++) {
    const axis = Math.floor(face / 2),
      sign = face % 2 ? -1 : 1,
      from = mesh.length / 12,
      center = [block.x, block.y - 0.5, block.z],
      normal = [0, 0, 0];
    normal[axis] = sign;
    center[axis] += sign * 0.5;
    mesh.push(...shell.slice(face * faceSize, (face + 1) * faceSize));
    colorBlockRunes(mesh, block, color, axis, sign);
    faces.push({ kind: 'phase', center, normal, first: from, count: mesh.length / 12 - from });
  }
}
function phaseGroundGlow(mesh, faces, block, color) {
  const first = mesh.length / 12,
    center = [block.x, block.y - 0.995, block.z];
  for (const [x, z] of [
    [-1, -1],
    [1, 1],
    [1, -1],
    [-1, -1],
    [-1, 1],
    [1, 1],
  ])
    mesh.push(center[0] + x * 0.9, center[1], center[2] + z * 0.9, 0, 1, 0, ...color, 25, x, z);
  faces.push({ kind: 'phase', center, normal: [0, 1, 0], first, count: 6 });
}
// ===== Decor =====
// Faceted pebble: a jittered octahedron, flat-shaded.
function pebble(mesh, center, size, color, seed, angle) {
  const jitter = (k) => {
      const s = Math.sin(seed * 91.7 + k * 37.3) * 43758.5453;
      return 0.72 + 0.56 * (s - Math.floor(s));
    },
    c = Math.cos(angle),
    s = Math.sin(angle);
  const axes = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ].map((a, k) => {
    const p = a.map((v, j) => v * size[j] * jitter(k));
    return [p[0] * c - p[2] * s, p[1], p[0] * s + p[2] * c];
  });
  for (const face of [
    [0, 2, 4],
    [4, 2, 1],
    [1, 2, 5],
    [5, 2, 0],
    [4, 3, 0],
    [1, 3, 4],
    [5, 3, 1],
    [0, 3, 5],
  ]) {
    const p = face.map((i) => axes[i]),
      n = normalize(
        cross(
          p[1].map((v, k) => v - p[0][k]),
          p[2].map((v, k) => v - p[0][k]),
        ),
      );
    for (const q of p)
      mesh.push(center[0] + q[0], center[1] + q[1], center[2] + q[2], ...n, ...color, 13, 0, 0);
  }
}
function decorBone(mesh, center, length, angle, color) {
  const d = [Math.cos(angle) * length * 0.5, 0, Math.sin(angle) * length * 0.5],
    side = [(-d[2] / length) * 0.034, 0, (d[0] / length) * 0.034];
  rod(
    mesh,
    center.map((v, k) => v - d[k]),
    center.map((v, k) => v + d[k]),
    0.026,
    color,
    13,
  );
  for (const end of [-1, 1])
    for (const knob of [-1, 1])
      sphere(
        mesh,
        center.map((v, k) => v + d[k] * end + side[k] * knob),
        [0.023, 0.019, 0.023],
        color,
        13,
        null,
        lowSphere,
      );
}
function decorSkull(mesh, center, angle, bone) {
  const s = 1.3,
    f = [Math.sin(angle), 0, Math.cos(angle)],
    r = [f[2], 0, -f[0]],
    at = (a, b, c) => center.map((v, k) => v + (r[k] * a + f[k] * c + (k === 1 ? b : 0)) * s),
    dark = [0.02, 0.018, 0.014],
    size = (v) => v.map((x) => x * s);
  sphere(mesh, at(0, 0.07, 0), size([0.075, 0.068, 0.082]), bone, 1, null, lowSphere);
  sphere(mesh, at(0, 0.028, 0.045), size([0.05, 0.026, 0.045]), bone, 13, null, lowSphere);
  for (const side of [-1, 1])
    sphere(
      mesh,
      at(side * 0.03, 0.078, 0.068),
      size([0.021, 0.023, 0.016]),
      dark,
      13,
      null,
      lowSphere,
    );
  sphere(mesh, at(0, 0.052, 0.079), size([0.01, 0.012, 0.008]), dark, 13, null, lowSphere);
}
function decorArrow(mesh, center, angle) {
  const from = mesh.length,
    c = Math.cos(angle),
    s = Math.sin(angle),
    tilt = 0.06;
  mesh.push(...arrowGeometry());
  for (let k = from; k < mesh.length; k += 12)
    for (const offset of [0, 3]) {
      const x = mesh[k + offset],
        y0 = mesh[k + offset + 1],
        z0 = mesh[k + offset + 2],
        y = y0 * Math.cos(tilt) + z0 * Math.sin(tilt),
        z = -y0 * Math.sin(tilt) + z0 * Math.cos(tilt);
      mesh[k + offset] = (offset ? 0 : center[0]) + x * c + z * s;
      mesh[k + offset + 1] = (offset ? 0 : center[1] + 0.022) + y;
      mesh[k + offset + 2] = (offset ? 0 : center[2]) - x * s + z * c;
    }
}
// A corner web: radial silk strands between two walls, linked by sagging threads.
function decorWeb(mesh, corner, a, b) {
  const up = [0, 1, 0],
    silk = [0.5, 0.52, 0.54],
    point = (t, h, reach) => {
      const dir = normalize(a.map((v, k) => v * (1 - t) + b[k] * t));
      return corner.map((v, k) => v - dir[k] * reach * (1 - Math.abs(t - 0.5) * 0.5) + up[k] * h);
    };
  const hub = corner.map((v, k) => v + up[k] * 0.3),
    spokes = [0, 0.25, 0.5, 0.75, 1].map((t) => point(t, 0.12 + Math.abs(t - 0.5) * 0.5, 0.42));
  for (const end of spokes) rod(mesh, hub, end, 0.007, silk, 13);
  for (const ring of [0.35, 0.62, 0.86])
    for (let i = 0; i < spokes.length - 1; i++) {
      const p = hub.map((v, k) => v + (spokes[i][k] - v) * ring),
        q = hub.map((v, k) => v + (spokes[i + 1][k] - v) * ring);
      rod(mesh, p, q, 0.005, silk, 13);
    }
}
function scatterDecor(mesh, level, occupied) {
  const map = level.definition || {},
    random = (x, y, z, k) => {
      const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + k * 19.19) * 43758.5453;
      return s - Math.floor(s);
    };
  const taken = new Set(),
    archers = new Set();
  for (const key of [
    'spawns',
    'goals',
    'plates',
    'bridges',
    'lifts',
    'spikes',
    'portals',
    'conveyors',
    'crates',
    'pickups',
    'drones',
  ])
    for (const p of map[key] || [])
      if (p && !(key === 'spikes' && p.face)) taken.add(p.x + ',' + p.z);
  for (const p of map.archers || []) archers.add(p.x + ',' + p.z);
  const bone = [0.5, 0.46, 0.34];
  let skulls = 0,
    arrows = 0,
    webs = 0;
  const sides = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  for (const b of (level.world.blocks || []).filter((b) => b.color === undefined)) {
    const key = b.x + ',' + b.z,
      y = b.y;
    if (occupied.has([b.x, y + 1, b.z].join(',')) || taken.has(key)) continue;
    const archer = archers.has(key),
      walls = sides.filter(([dx, dz]) => occupied.has([b.x + dx, y + 1, b.z + dz].join(',')));
    const r = (k) => random(b.x, y, b.z, k),
      at = (dx, dz, lift = 0) => [b.x + dx, y + lift, b.z + dz];
    const stone = (k) => [0.33, 0.29, 0.24].map((v) => v * (0.7 + 0.6 * r(k)));
    // Rubble gathers against walls; open floor keeps a few stray pebbles near its edges.
    for (const [dx, dz] of walls)
      if (r(1 + dx * 3 + dz * 5) < 0.65)
        for (let i = 0, count = 2 + Math.floor(r(9 + dx + dz * 2) * 3); i < count; i++) {
          const along = (r(20 + i * 3 + dx + dz * 2) - 0.5) * 0.8,
            size = 0.025 + r(30 + i) * 0.035,
            p = at(dx * (0.38 - size) + dz * along, dz * (0.38 - size) + dx * along, size * 0.3);
          pebble(
            mesh,
            p,
            [size, size * 0.62, size * 0.85],
            stone(40 + i),
            b.x * 7 + b.z * 13 + i,
            r(50 + i) * 6.28,
          );
        }
    if (!walls.length && r(2) < 0.55)
      for (let i = 0; i < 1 + Math.floor(r(3) * 2.2); i++) {
        const a = r(60 + i) * 6.28,
          reach = 0.27 + r(70 + i) * 0.15,
          size = 0.022 + r(80 + i) * 0.03,
          p = at(Math.cos(a) * reach, Math.sin(a) * reach, size * 0.3);
        pebble(mesh, p, [size, size * 0.6, size * 0.8], stone(90 + i), b.x * 5 + b.z * 11 + i, a);
      }
    if (r(4) < (walls.length || archer ? 0.16 : 0.07)) {
      const a = r(5) * 6.28,
        reach = archer ? 0.36 : 0.2;
      decorBone(
        mesh,
        at(Math.cos(a * 1.7) * reach, Math.sin(a * 1.7) * reach, 0.02),
        0.16 + r(6) * 0.06,
        a,
        bone,
      );
    }
    if (skulls < 2 && (walls.length || archer) && r(7) < 0.12) {
      skulls++;
      const [dx, dz] = walls[0] || [1, 0];
      decorSkull(
        mesh,
        at(dx * 0.3 + dz * 0.18, dz * 0.3 - dx * 0.18),
        Math.atan2(-dx, -dz) + (r(8) - 0.5),
        bone,
      );
    }
    // Spent arrows lie near the archers that loosed them.
    if (
      arrows < 2 &&
      !archer &&
      (map.archers || []).some(
        (p) => Math.abs(p.x - b.x) + Math.abs(p.z - b.z) <= 3 && (p.y ?? y) === y,
      ) &&
      r(10) < 0.4
    ) {
      arrows++;
      const a = r(11) * 6.28;
      decorArrow(mesh, at(Math.cos(a) * 0.16, Math.sin(a) * 0.16), a);
    }
    // Inner corners, where two perpendicular walls meet over this cell, may hold a web.
    for (let i = 0; i < 4 && webs < 4; i++) {
      const [ax, az] = sides[i],
        [bx, bz] = sides[(i + 1) % 4];
      if (!walls.includes(sides[i]) || !walls.includes(sides[(i + 1) % 4]) || r(12 + i) > 0.45)
        continue;
      webs++;
      decorWeb(mesh, at((ax + bx) * 0.485, (az + bz) * 0.485), [ax, 0, az], [bx, 0, bz]);
    }
  }
}
function colliderLines(boxes) {
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
function surfaceBindings(soft) {
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
// Linear HDR colour of the void at the bottom of the screen, shared by fog and sky.
const VOID_COLOR = '.0026,.0034,.0068';
const shared = `
 struct Portal { position:vec4f, color:vec4f, animation:vec4f };
 struct Goal { position:vec4f, color:vec4f };
 struct Scene { vp:mat4x4f, lightVP:mat4x4f, eye:vec4f, light:vec4f, body0:vec4f, body1:vec4f, body2:vec4f, options:vec4f, portals:array<Portal,${PORTAL_LIMIT}>, goals:array<Goal,5>, torches:array<vec4f,8>, body3:vec4f, body4:vec4f, bodySlots:array<vec4f,2>, finish:vec4f, goalSlots:array<vec4f,2> };
 @group(0) @binding(0) var<uniform> scene:Scene;
 struct Out { @builtin(position) clip:vec4f, @location(0) world:vec3f, @location(1) normal:vec3f, @location(2) color:vec3f, @location(3) material:f32, @location(4) local:vec3f };
 struct Vertex { position:vec4f, normal:vec4f, info:vec4f };
 @group(0) @binding(1) var<storage,read> vertices:array<Vertex>;
 @group(0) @binding(4) var stoneAtlas:texture_2d<f32>;
 @group(0) @binding(5) var oakTexture:texture_2d<f32>;
 @group(0) @binding(6) var materialSampler:sampler;
 ${runeGlyphShader}
 fn assemblyPosition(p:vec3f,block:vec4f)->vec3f{
  if(scene.finish.z>=1.){return p;}
  let t=clamp((scene.finish.z-block.w*.6)/.4,0.,1.);let remaining=pow(1.-t,3.);
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let up=normalize(vec3f(scene.vp[0].y,scene.vp[1].y,scene.vp[2].y));
  let seed=hash(block.xyz+vec3f(17,3,41));let side=u32(floor(seed*6.));var direction=right;
  switch(side){case 0u:{direction=-right;}case 1u:{direction=right;}case 2u:{direction=up;}case 3u:{direction=-up;}case 4u:{direction=vec3f(0,1,0);}default:{direction=vec3f(0,-1,0);}}
  let distance=max(12.,length(scene.eye.xyz-block.xyz)*1.25);
  return block.xyz+(p-block.xyz)*mix(1.,.7,remaining)+direction*distance*remaining;
 }
 @vertex fn assemblyVS(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) color:vec3f,@location(3) material:vec3f,@location(4) block:vec4f)->Out{
  let position=assemblyPosition(p,block);var o:Out;o.clip=scene.vp*vec4f(position,1);o.world=position;o.normal=n;o.color=color;o.material=material.x;o.local=vec3f(material.y,0,material.z);return o;
 }
 @vertex fn assemblyShadowVS(@location(0) p:vec3f,@location(4) block:vec4f)->@builtin(position) vec4f{return scene.lightVP*vec4f(assemblyPosition(p,block),1);}
 @vertex fn solidVS(@location(0) p:vec3f,@location(1) n:vec3f,@location(2) color:vec3f,@location(3) material:vec3f)->Out{
  var position=p;
  if(material.x>3.5&&material.x<4.5){
   let flicker=scene.options.z;
   position.x+=sin(flicker*9.+p.y*8.)*.018;
   position.y+=sin(flicker*13.+p.y*11.)*.025;
   position.z+=cos(flicker*8.+p.y*9.)*.012;
  }
  var o:Out;o.clip=scene.vp*vec4f(position,1);o.world=position;o.normal=n;o.color=color;o.material=material.x;o.local=vec3f(material.y,0,material.z);return o;
 }
 @vertex fn softVS(@builtin(vertex_index) id:u32,@builtin(instance_index) instance:u32)->Out{
  let v=vertices[id+instance*1350u];var o:Out;o.clip=scene.vp*v.position;o.world=v.position.xyz;o.normal=v.normal.xyz;
  let colors=array<vec3f,5>(vec3f(.045,.72,.095),vec3f(.025,.15,.95),vec3f(.95,.055,.025),vec3f(.58,.045,.92),vec3f(.95,.61,.025));
  o.color=colors[u32(v.info.w)];o.material=2.+v.info.w;o.local=v.info.xyz;return o;
 }
 @vertex fn portalHaloVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let portal=scene.portals[instance];var o:Out;o.world=portal.position.xyz+vec3f(p.x*.78,.033,p.z*.78);o.clip=scene.vp*vec4f(o.world,1.);
  let activation=portal.animation.x;o.normal=vec3f(0,1,0);o.color=mix(mix(vec3f(.2,.22,.25),portal.color.rgb,.16),portal.color.rgb,activation);o.material=9.;o.local=vec3f(p.x,mix(.035,.065+portal.position.w*.3,activation),p.z);return o;
 }
 @vertex fn portalRingVS(@location(0) p:vec3f,@location(1) n:vec3f,@builtin(instance_index) instance:u32)->Out{
  let portal=scene.portals[instance/3u];let phase=fract(scene.options.z*.42+f32(instance%3u)/3.+portal.color.w);let radius=.85+phase*.8;
  var o:Out;o.world=portal.position.xyz+vec3f(p.x*radius,.065+phase*.92+p.y*(1.-phase*.6),p.z*radius);o.clip=scene.vp*vec4f(o.world,1.);
  let charge=portal.position.w;let activation=portal.animation.x;
  if(activation<.001){o.clip=vec4f(2,2,2,1);}
  o.normal=normalize(vec3f(n.x/radius,n.y/(1.-phase*.6),n.z/radius));o.color=portal.color.rgb*(1.+charge*1.15);o.material=10.;
  o.local=vec3f(0.,smoothstep(0.,.1,phase)*pow(1.-phase,1.6)*(.22+charge*.38)*activation,0.);return o;
 }
 @fragment fn portalFXFS(o:Out)->@location(0) vec4f{
  var alpha=o.local.y;var color=o.color*1.8;
  if(o.material<9.5){let radius=length(o.local.xz);alpha*=exp(-radius*radius*4.)*(1.-smoothstep(.7,1.,radius));color=o.color*1.2;}
  return vec4f(color,alpha);
 }
 @vertex fn goalBeamVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let goal=scene.goals[instance];let victory=goal.color.w;let uv=vec2f(p.x,(p.z+1.)*.5);
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let width=mix(.2,.4,victory);let height=3.3;
  var o:Out;o.world=goal.position.xyz+right*uv.x*width+vec3f(0,.04+uv.y*height,0);o.clip=scene.vp*vec4f(o.world,1.);
  if(victory<.001){o.clip=vec4f(2,2,2,1);}
  o.normal=vec3f(0,1,0);o.color=goal.color.rgb*2.4;o.material=victory;o.local=vec3f(uv,goal.position.w*victory);return o;
 }
 @fragment fn goalBeamFS(o:Out)->@location(0) vec4f{
  let edge=exp(-o.local.x*o.local.x*5.);let tip=1.-smoothstep(.5,1.,o.local.y);let base=smoothstep(0.,.035,o.local.y);
  let breath=.97+.03*sin(scene.options.z*2.+o.local.y*8.);let core=exp(-o.local.x*o.local.x*45.)*o.material*.1;
  let alpha=o.local.z*(edge*.34+core)*tip*base*breath;
  return vec4f(o.color,alpha);
 }
 @vertex fn runeVS(@location(0) p:vec3f,@location(4) positionSize:vec4f,@location(5) colorOpacity:vec4f,@location(6) info:vec4f)->Out{
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let view=normalize(-vec3f(scene.vp[0].z,scene.vp[1].z,scene.vp[2].z));let up=normalize(cross(view,right));
  let c=cos(info.y);let s=sin(info.y);let uv=vec2f(p.x*c-p.z*s,p.x*s+p.z*c);var o:Out;
  o.world=positionSize.xyz+(right*uv.x+up*uv.y)*positionSize.w;o.clip=scene.vp*vec4f(o.world,1.);
  o.normal=view;o.color=colorOpacity.rgb*2.5;o.material=info.x;o.local=vec3f(p.x*.3,-p.z*.3,colorOpacity.w);return o;
 }
 @vertex fn dustVS(@builtin(vertex_index) vertex:u32,@location(4) mote:vec4f)->Out{
  let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(1,1),vec2f(-1,-1),vec2f(1,1),vec2f(-1,1));let uv=corners[vertex];
  let phase=mote.w;let t=scene.options.z*.24*scene.options.w+phase;
  let drift=vec3f(sin(t)*.28,sin(t*.73+phase)*.16,cos(t*.85)*.28);
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let up=normalize(vec3f(scene.vp[0].y,scene.vp[1].y,scene.vp[2].y));
  let size=.028+.022*fract(phase*13.71);var o:Out;
  o.world=mote.xyz+drift+(right*uv.x+up*uv.y)*size;o.clip=scene.vp*vec4f(o.world,1.);
  o.normal=vec3f(0,1,0);o.color=mix(vec3f(.8,.56,.25),vec3f(1.,.85,.53),fract(phase*7.13));
  o.material=0.;o.local=vec3f(uv,.28+.16*(.5+.5*sin(t*.8+phase)));return o;
 }
 @fragment fn dustFS(o:Out)->@location(0) vec4f{
  let radius=dot(o.local.xy,o.local.xy);let core=exp(-radius*18.);let halo=exp(-radius*4.)*(1.-smoothstep(.5,1.,sqrt(radius)));
  return vec4f(o.color*2.,(core+halo*.2)*o.local.z);
 }
 @fragment fn runeFS(o:Out)->@location(0) vec4f{
  let distance=runeDistance(o.local.xy,u32(o.material));let aa=max(.001,fwidth(distance));
  let stroke=1.-smoothstep(.022-aa,.022+aa,distance);let glow=exp(-distance*35.)*.22;
  return vec4f(o.color,(stroke*.85+glow)*o.local.z);
 }
 struct BeamOut { @builtin(position) clip:vec4f, @location(0) uv:vec2f, @location(1) tint:vec4f, @location(2) @interpolate(flat) beamLength:f32, @location(3) @interpolate(flat) impact:f32, @location(4) @interpolate(flat) tip:f32 };
 @vertex fn beamVS(@builtin(vertex_index) vertex:u32,@location(4) start:vec4f,@location(5) end:vec4f,@location(6) tint:vec4f)->BeamOut{
  let corners=array<vec2f,6>(vec2f(-1,-1),vec2f(1,-1),vec2f(1,1),vec2f(-1,-1),vec2f(1,1),vec2f(-1,1));let p=corners[vertex%6u];
  let direction=normalize(end.xyz-start.xyz);let view=normalize(scene.eye.xyz-(start.xyz+end.xyz)*.5);let side=cross(direction,view);
  let fallback=cross(direction,select(vec3f(0,1,0),vec3f(1,0,0),abs(direction.y)>.9));
  let right=normalize(select(fallback,side,dot(side,side)>.0001));let beamLength=length(end.xyz-start.xyz);
  // Leave room for rounded glow caps instead of cutting the quad at the raycast hit.
  let uv=vec2f(p.x,mix(-.22,beamLength+.22,(p.y+1.)*.5));var o:BeamOut;
  var world=start.xyz+direction*uv.y+right*uv.x*.24;o.uv=uv;o.tip=0.;
  if(vertex>=6u){
   // Face the contact halo toward the camera so it stays round at every beam angle.
   let cameraRight=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let cameraUp=normalize(vec3f(scene.vp[0].y,scene.vp[1].y,scene.vp[2].y));
   let towardEye=normalize(scene.eye.xyz-end.xyz);
   world=end.xyz-direction*.025+towardEye*.045+(cameraRight*p.x+cameraUp*p.y)*.2;o.uv=p;o.tip=1.;
  }
  o.clip=scene.vp*vec4f(world,1.);o.tint=tint;o.beamLength=beamLength;o.impact=end.w;return o;
 }
 fn arcNoise(x:f32,seed:f32)->f32{
  let cell=floor(x);let a=fract(sin(cell*127.1+seed*311.7)*43758.5453)*2.-1.;let b=fract(sin((cell+1.)*127.1+seed*311.7)*43758.5453)*2.-1.;
  return mix(a,b,fract(x));
 }
 @fragment fn beamFS(o:BeamOut)->@location(0) vec4f{
  let uv=o.uv;let time=scene.options.z;let along=uv.y;let progress=clamp(along/o.beamLength,0.,1.);let envelope=sin(progress*3.14159265);
  // Piecewise linear noise forms travelling lightning kinks. Both endpoints
  // stay attached to the emitter and the raycast hit, even on short beams.
  let epoch=floor(time*11.);let blend=smoothstep(0.,1.,fract(time*11.));
  let arc=mix(arcNoise(along*5.5,epoch),arcNoise(along*5.5,epoch+1.),blend)*.34*envelope;
  let branch=arc+arcNoise(along*9.-time*3.,19.)*.42*envelope;
  let distance=abs(uv.x-arc);let width=max(.08,fwidth(uv.x)*.7);let core=exp(-pow(distance/width,2.));
  let glow=exp(-pow(distance/.36,2.));let filament=exp(-pow((uv.x-branch)/max(.018,fwidth(uv.x)*.5),2.));
  let flow=.88+.12*sin(along*24.-time*17.);
  let endFade=1.-smoothstep(o.beamLength-min(.1,o.beamLength*.35),o.beamLength+.005,along);
  let startFade=smoothstep(-.025,min(.045,o.beamLength*.35),along);
  let outside=max(0.,max(-along,along-o.beamLength));let glowCap=exp(-pow(outside/.075,2.));
  let sourceFlare=exp(-uv.x*uv.x*15.-pow(along/.065,2.))*.35;
  var alpha=((core*.95+filament*.3)*startFade*endFade+glow*.23*glowCap+sourceFlare)*o.tint.w*flow;
  var color=mix(o.tint.rgb*2.3,vec3f(3.),core*.7);
  if(o.tip>.5){
   let radius=length(o.uv);let hot=exp(-radius*radius*25.);let halo=exp(-radius*radius*4.8)*(1.-smoothstep(.7,1.,radius));
   color=mix(o.tint.rgb*2.3,vec3f(3.),hot*.85);alpha=(hot*1.2+halo*.5)*o.tint.w*o.impact;
  }
  return vec4f(color,alpha);
 }
 @vertex fn goalGlowVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let goal=scene.goals[instance];var o:Out;
  o.world=goal.position.xyz+vec3f(p.x*.68,.061,p.z*.68);o.clip=scene.vp*vec4f(o.world,1.);
  o.normal=vec3f(0,1,0);o.color=goal.color.rgb;o.material=9.;o.local=vec3f(p.x,.13+goal.position.w*.45,p.z);return o;
 }
 // The seal sits outside the jelly's footprint, so its charge remains readable.
 @vertex fn goalSealVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let goal=scene.goals[instance];var o:Out;
  o.world=goal.position.xyz+vec3f(p.x*.86,.064,p.z*.86);o.clip=scene.vp*vec4f(o.world,1.);
  if(scene.goalSlots[instance/4u][instance%4u]<0.){o.clip=vec4f(2,2,2,1);}
  o.normal=vec3f(0,1,0);o.color=goal.color.rgb;o.material=scene.goalSlots[instance/4u][instance%4u];o.local=vec3f(p.x*.86,scene.finish.x,p.z*.86);return o;
 }
 @fragment fn goalSealFS(o:Out)->@location(0) vec4f{
  let uv=o.local.xz;let radius=length(uv);let progress=o.local.y;
  let phase=fract(atan2(uv.x,-uv.y)/6.2831853+1.);
  let filled=1.-smoothstep(progress-.006,progress+.006,phase);
  let node=select(vec2f(0.,sign(uv.y)*.73),vec2f(sign(uv.x)*.73,0.),abs(uv.x)>abs(uv.y));
  let distance=runeDistance((uv-node)/.25,u32(o.material))*.25;
  let aa=max(.001,fwidth(radius));
  let ring=1.-smoothstep(.009-aa,.009+aa,abs(radius-.59));
  let glyph=1.-smoothstep(.006-aa,.006+aa,distance);
  let halo=exp(-abs(radius-.59)*80.)*.12+exp(-distance*110.)*.13;
  let head=exp(-pow((phase-progress)*100.,2.))*(1.-step(1.,progress));
  let alpha=(ring*.7+glyph+halo)*(.12+filled*.75)+ring*head*.35;
  return vec4f(o.color*(2.+progress),alpha*smoothstep(0.,.045,progress));
 }
 @vertex fn shadowVS(@location(0) p:vec3f)->@builtin(position) vec4f{return scene.lightVP*vec4f(p,1);}
 @group(0) @binding(2) var shadowMap:texture_depth_2d;
 @group(0) @binding(3) var shadowSampler:sampler_comparison;
 fn shadow(p:vec3f,n:vec3f)->f32{
  let clip=scene.lightVP*vec4f(p+n*.012,1);let uv=vec2f(clip.x*.5+.5,.5-clip.y*.5);var lit=0.;
  for(var y=-1;y<=1;y++){for(var x=-1;x<=1;x++){lit+=textureSampleCompareLevel(shadowMap,shadowSampler,uv+vec2f(f32(x),f32(y))/.1024e4,clip.z-.001);}}
  return lit/9.;
 }
 // Arithmetic hash (no transcendental functions), cheap enough for per-pixel noise.
 fn hash(p:vec3f)->f32{var q=fract(p*.1031);q+=dot(q,q.zyx+31.32);return fract((q.x+q.y)*q.z);}
 // The void fog below the lowest floor fades into the sky colour painted by the post pass.
 const VOID_COLOR=vec3f(${VOID_COLOR});
 fn voidFog(p:vec3f,color:vec3f)->vec3f{return mix(color,VOID_COLOR,smoothstep(.05,1.2,scene.finish.y-p.y)*.96);}
 // Torch flames are camera-facing, additive billboards drawn after the opaque scene,
 // so jelly refraction still sees them. Each one sways with its own phase.
 @vertex fn flameVS(@location(0) p:vec3f,@builtin(instance_index) instance:u32)->Out{
  let torch=scene.torches[instance];var o:Out;
  let right=normalize(vec3f(scene.vp[0].x,scene.vp[1].x,scene.vp[2].x));let view=normalize(-vec3f(scene.vp[0].z,scene.vp[1].z,scene.vp[2].z));let up=normalize(cross(view,right));
  let height=(p.z+1.)*.5*.6-.08;
  o.world=torch.xyz+vec3f(0.,-.12,0.)+right*p.x*.2+up*height;o.clip=scene.vp*vec4f(o.world,1.);
  if(torch.w<.5){o.clip=vec4f(2,2,2,1);}
  o.normal=view;o.color=vec3f(1.);o.material=f32(instance);o.local=vec3f(p.x,height/.5,0.);return o;
 }
 @fragment fn flameFS(o:Out)->@location(0) vec4f{
  let t=scene.options.z*1.1+o.material*1.93;let y=o.local.y;
  let sway=(sin(y*5.2-t*6.1)*.12+sin(y*11.5-t*10.3)*.05)*clamp(y,0.,1.);
  let x=o.local.x-sway;
  let profile=.72*pow(clamp(1.-y,0.,1.),.9)*smoothstep(-.16,.22,y)+.0001;
  let d=abs(x)/profile;
  let body=(1.-smoothstep(.4,1.,d))*(1.-smoothstep(.62,1.,y));
  let edge=body*smoothstep(.25,.95,d+y*.35);
  let core=(1.-smoothstep(.05,.55,d+max(y,0.)*1.25))*smoothstep(-.14,.04,y);
  let flicker=.9+.1*sin(t*14.3+y*4.)*sin(t*6.7);
  let r=vec2f(o.local.x,(y-.2)*.8);let halo=exp(-dot(r,r)*5.)*.2;
  let color=vec3f(1.,.4,.05)*body+vec3f(.9,.12,.01)*edge*.6+vec3f(1.,.72,.3)*core*.62+vec3f(1.,.28,.03)*halo;
  return vec4f(color*flicker,1.);
 }
 fn neutral(input:vec3f)->vec3f{
  var c=max(input,vec3f(0));let x=min(c.r,min(c.g,c.b));let offset=select(.04,x-6.25*x*x,x<.08);c-=vec3f(offset);
  let peak=max(c.r,max(c.g,c.b));if(peak<.76){return c;}
  let d=.24;let newPeak=1.-d*d/(peak+d-.76);c*=newPeak/peak;let g=1.-1./(.15*(peak-newPeak)+1.);return mix(c,vec3f(newPeak),g);
 }
 fn environment(r:vec3f)->vec3f{
  var color=mix(vec3f(.028,.045,.055),vec3f(.55,.57,.48),smoothstep(-.25,1.,r.y));
  let softbox=pow(max(0.,dot(r,normalize(vec3f(-.4,1.,.2)))),45.);
  let strip=pow(max(0.,dot(r,normalize(vec3f(.5,.55,-.65)))),75.);
  return color+vec3f(3.8,3.4,2.5)*softbox+vec3f(.8,1.4,2.1)*strip;
 }
 struct Stone { albedo:vec3f, normal:vec3f, occlusion:f32 };
 // texel/value: the atlas sample; slope: screen derivatives of value, taken in uniform control flow.
 // Kept lean on purpose: it shades most of the screen on low-end integrated GPUs.
 // broad: the moss amount baked per vertex (see mossAt).
 fn stoneSurface(p:vec3f,normal:vec3f,base:vec3f,texel:vec3f,value:f32,slope:vec2f,uv:vec2f,dp1:vec3f,dp2:vec3f,masonry:bool,broad:f32)->Stone{
  // Painted cracks and pits become relief through the screen-derivative surface gradient.
  let r1=cross(dp2,normal);let r2=cross(normal,dp1);let det=dot(dp1,r1);
  var n=normal;if(abs(det)>1e-14){n-=(r1*slope.x+r2*slope.y)*(.012/det);}
  var albedo=base*mix(vec3f(clamp(value*3.6,.38,1.22)),texel*3.6,.2);
  let tile=fract(uv*4.);let edge=min(min(tile.x,tile.y),min(1.-tile.x,1.-tile.y));
  let axisPeak=max(abs(normal.x),max(abs(normal.y),abs(normal.z)));let bevel=smoothstep(.02,.24,1.-axisPeak);
  // Worn, lighter bevels, chipped where the painted stone is dark; the outermost line stays a dark joint.
  let chip=1.-smoothstep(.11,.19,value);
  albedo*=(1.+bevel*.34*(1.-chip))*mix(1.,.55,bevel*chip)*mix(.45,1.,smoothstep(.02,.034,edge));
  var occlusion=mix(.6,1.,smoothstep(.1,.32,value));var joint=0.;
  if(masonry&&abs(normal.y)<.72){
   // Two courses per block, each split into one to three stones; one hash seeds a whole course.
   let alongX=abs(normal.z)>abs(normal.x);let tangent=select(vec3f(0,0,1),vec3f(1,0,0),alongX);
   let along=select(p.z,p.x,alongX);let column=round(along);let a=along-column+.5;
   let course=floor(p.y*2.);let seed=hash(vec3f(column,course,round(select(p.x,p.z,alongX)*2.)));let count=1.+floor(seed*2.7);
   let j1=(1.+(fract(seed*13.7)-.5)*.2)/count;let j2=(2.+(fract(seed*29.3)-.5)*.2)/count;
   let d1=a-j1;let d2=select(9.,a-j2,count>2.5);let near=select(d1,d2,abs(d2)<abs(d1));
   let jointGap=select(1.,abs(near)*.97,count>1.5);let level=fract(p.y);let courseGap=abs(level-.5);
   let gap=min(jointGap,courseGap)+(value-.22)*.05;
   joint=1.-smoothstep(.006,.022,gap);let bend=(1.-smoothstep(.004,.045,gap))*.55;
   if(jointGap<courseGap){n-=tangent*sign(near)*bend;}else{n.y+=select(-1.,1.,level<.5)*bend;}
   let tone=fract(seed*71.3+step(j1,a)*.37+step(j2,a)*.61);
   albedo*=mix(.25,1.,1.-joint)*(.86+tone*.26)*mix(vec3f(1.),vec3f(1.07,.98,.88),step(.62,tone));
   occlusion*=mix(.45,1.,1.-joint);
  }
  // Moss gathers in cracks, joints and along worn edges, in broad irregular patches.
  let growth=broad+(.24-value)*.6;
  let crevice=1.-smoothstep(.1,.3,value);let rim=1.-smoothstep(.034,.09,edge);
  let moss=smoothstep(.56,.78,growth)*clamp(crevice*.9+joint*.8+bevel*.55+rim*.45,0.,1.);
  albedo=mix(albedo,vec3f(.075,.115,.035)*(.6+value*2.2),moss*.62);
  var s:Stone;s.albedo=albedo;s.normal=normalize(n);s.occlusion=occlusion;return s;
 }
 struct Lighting { light:vec3f, marks:vec3f, sun:f32 };
 fn jellyTint(slot:f32)->vec3f{
  if(slot<.5){return vec3f(.09,.85,.18);}if(slot<1.5){return vec3f(.035,.17,1.);}if(slot<2.5){return vec3f(1.,.08,.035);}if(slot<3.5){return vec3f(.65,.08,1.);}return vec3f(1.,.7,.025);
 }
 // One jelly's coloured transmission pool (scale/add) and glowing footprint outline (marks).
 // Called once per body with constant arguments: a dynamically indexed local array would
 // spill to slow memory on some GPUs.
 struct BodyLight { scale:vec3f, add:vec3f, marks:vec3f };
 fn bodyLight(p:vec3f,up:f32,body:vec4f,slot:f32,acc:BodyLight)->BodyLight{
  let delta=p.xz-body.xz;let d2=dot(delta,delta);
  // Beyond about 1.6 units every term below is negligible.
  if(body.w<=0.||d2>2.6||p.y>=body.y-.2){return acc;}
  let height=max(0.,body.y-.42-(body.w-4.));let radius=.28+height*.18;let tint=jellyTint(slot);var r=acc;
  r.scale*=mix(vec3f(1.),tint*.6+vec3f(.2),exp(-d2/(radius*radius))*.36/(1.+height*2.));
  r.add+=tint*exp(-d2/.34)*.22/(1.+height*3.);
  if(up>.6&&abs(p.y-(body.w-4.))<.12){
   let q=abs(delta)-vec2f(.33);let outline=length(max(q,vec2f(0.)))+min(max(q.x,q.y),0.)-.09;
   r.marks+=tint*(exp(-pow(outline/.015,2.))*1.15+exp(-max(outline,0.)*22.)*smoothstep(-.025,0.,outline)*.3)*(1.-smoothstep(.3,.65,height));
  }
  return r;
 }
 // Shared dungeon lighting: cool sky ambient and moonlit key with shadows, warm torches,
 // and each jelly's coloured transmission pool plus its glowing footprint outline (marks).
 fn dungeonLight(p:vec3f,n:vec3f,up:f32,occlusion:f32)->Lighting{
  let l=normalize(scene.light.xyz-p);
  let ambient=mix(vec3f(.04,.034,.032),vec3f(.092,.11,.165),n.y*.5+.5);
  let sun=shadow(p,n);
  var light=(ambient+vec3f(.08,.13,.27)*max(0.,dot(n,normalize(vec3f(-.6,.4,-.6)))))*occlusion+vec3f(.98,.85,.69)*max(0.,dot(n,l))*sun;
  var torchLight=vec3f(0.);
  for(var i=0;i<8;i++){
   let delta=scene.torches[i].xyz-p;let reach=dot(delta,delta);
   if(scene.torches[i].w<.5||reach>13.69){continue;}
   let distance=sqrt(reach);let falloff=1.-smoothstep(.1,3.7,distance);let attenuation=falloff*falloff;
   let flicker=1.+(sin(scene.options.z*8.+f32(i)*2.)*.6+sin(scene.options.z*13.7+f32(i)*5.)*.4)*.045;
   torchLight+=vec3f(4.5,1.75,.36)*attenuation*max(.12,dot(n,delta/distance))*flicker;
  }
  light+=torchLight*(.5+.5*occlusion);
  var bodies:BodyLight;bodies.scale=vec3f(1.);
  bodies=bodyLight(p,up,scene.body0,scene.bodySlots[0].x,bodies);bodies=bodyLight(p,up,scene.body1,scene.bodySlots[0].y,bodies);
  bodies=bodyLight(p,up,scene.body2,scene.bodySlots[0].z,bodies);bodies=bodyLight(p,up,scene.body3,scene.bodySlots[0].w,bodies);
  bodies=bodyLight(p,up,scene.body4,scene.bodySlots[1].x,bodies);
  var r:Lighting;r.light=light*bodies.scale+bodies.add;r.marks=bodies.marks;r.sun=sun;return r;
 }
 // Dedicated pass for the static masonry keeps the heavier stone code out of solidFS.
 @fragment fn stoneFS(o:Out)->@location(0) vec4f{
  let normal=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let h=normalize(v+normalize(scene.light.xyz-o.world));
  let uv=o.local.xz;let dx=dpdx(uv);let dy=dpdy(uv);let dp1=dpdx(o.world);let dp2=dpdy(o.world);
  let atlas=textureSampleGrad(stoneAtlas,materialSampler,uv,dx,dy).rgb;let value=dot(atlas,vec3f(.25,.6,.15));
  let stone=stoneSurface(o.world,normal,o.color,atlas,value,vec2f(dpdxFine(value),dpdyFine(value)),uv,dp1,dp2,true,o.material/${STONE_DETAIL});
  let lit=dungeonLight(o.world,stone.normal,normal.y,stone.occlusion);
  let result=stone.albedo*lit.light+vec3f(.045,.05,.06)*pow(max(0.,dot(stone.normal,h)),26.)*lit.sun*stone.occlusion;
  return vec4f(voidFog(o.world,result+lit.marks),1.);
 }
 @fragment fn solidFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let l=normalize(scene.light.xyz-o.world);let h=normalize(v+l);
  var color=o.color;var metalWear=0.;
  let uv=o.local.xz;let dx=dpdx(uv);let dy=dpdy(uv);
  let spikeMetal=o.material>26.5&&o.material<28.5;
  if(spikeMetal){
   // Face-local UVs keep pitting and tool marks attached while spikes slide or mount on walls.
   let socket=o.material>27.5;let texScale=vec2f(select(.83,2.7,socket),.87);let texUV=vec2f(.51,.26)+fract(uv*texScale)*.22;
   let texel=textureSampleGrad(stoneAtlas,materialSampler,texUV,dx*texScale*.22,dy*texScale*.22).rgb;
   let relief=clamp(dot(texel,vec3f(.25,.6,.15))*3.6,0.,1.);
   let edge=min(uv.x-uv.y*.5,1.-uv.y*.5-uv.x);
   let bladeWear=max(1.-smoothstep(.008,.055,edge),smoothstep(.65,.98,uv.y)*.8);
   let socketWear=1.-smoothstep(.025,.09,abs(uv.y-.5));
   metalWear=select(bladeWear,socketWear,socket);
   let root=select(1.-smoothstep(.05,.6,uv.y),smoothstep(.6,.95,uv.y),socket);
   let patina=(1.-smoothstep(.18,.48,relief))*root;
   let footprint=max(length(dx),length(dy));
   let grooves=pow(.5+.5*sin(uv.x*310.+sin(uv.y*18.)*2.),18.)*(1.-smoothstep(.006,.035,footprint));
   color=o.color*(.54+relief*.4)*(1.-grooves*.18);
   color=mix(color,vec3f(.14,.075,.032),patina*.42);
   color=mix(color,o.color*.55+vec3f(.2,.21,.19),metalWear*.5);
  }
  if(o.material<.5||(o.material>16.5&&o.material<17.5)){
   let texel=textureSampleGrad(stoneAtlas,materialSampler,uv,dx,dy).rgb;color*=mix(vec3f(clamp(dot(texel,vec3f(.25,.6,.15))*3.6,.38,1.22)),texel*3.6,.2);
  }
  if(o.material>17.5&&o.material<18.5){color*=.86+.14*sin(o.world.y*97.)*sin(o.world.x*113.+o.world.z*113.);}
  if(o.material>10.5&&o.material<11.5){
   let timber=textureSampleGrad(oakTexture,materialSampler,uv,dx,dy).rgb;
   let grain=clamp(.48+dot(timber,vec3f(.25,.6,.15))*3.,.54,1.22);
   color*=mix(vec3f(grain),timber*2.7,.18);
  }
  if(o.material>11.5&&o.material<12.5){let age=.5+.5*sin(o.world.x*11.+sin(o.world.y*7.))*sin(o.world.z*13.+o.world.y*5.);color=mix(color,vec3f(.065,.125,.095),smoothstep(.67,.95,age)*.32);}
  if(o.material>13.5&&o.material<14.5){let stone=textureSampleGrad(stoneAtlas,materialSampler,uv,dx,dy).rgb;color*=clamp(dot(stone,vec3f(.25,.6,.15))*3.5,.3,1.35);}
  if(o.material>15.5&&o.material<16.5){
   let axes=array<vec2f,4>(vec2f(0,1),vec2f(1,0),vec2f(0,-1),vec2f(-1,0));let axis=axes[min(u32(round(o.local.x)),3u)];
   let across=dot(o.world.xz-round(o.world.xz),vec2f(axis.y,-axis.x));let track=dot(o.world.xz,axis)-scene.options.z*o.local.z;
   let groove=1.-smoothstep(.02,.055,abs(fract(track*5.)-.5));
   let chevron=(1.-smoothstep(.035,.065,abs(fract((track+abs(across)*.7)*2.)-.5)))*(1.-smoothstep(.2,.24,abs(across)));
   color=mix(vec3f(.18,.23,.18),vec3f(.035,.05,.04),groove)+chevron*vec3f(.55,.38,.12);
  }
  let lit=dungeonLight(o.world,n,n.y,1.);let light=lit.light;let marks=lit.marks;
  var result=color*light;
  if(o.material>16.5&&o.material<17.5){result+=color*.22;}
  if(o.material>.5&&o.material<1.5){result+=vec3f(.28)*pow(max(0.,dot(n,h)),55.);}
  if(o.material>25.5&&o.material<26.5){let rim=pow(1.-max(0.,dot(n,v)),1.6);result=o.color*(.22+rim*1.25)+vec3f(1.5,1.5,1.4)*pow(max(0.,dot(n,h)),36.);}
  if(o.material>3.5&&o.material<4.5){result=color*(1.4+sin(scene.options.z*4.)*.08);}
  if(o.material>11.5&&o.material<12.5){result+=vec3f(.56,.4,.21)*pow(max(0.,dot(n,h)),45.);}
  if(o.material>13.5&&o.material<14.5){result+=color*.12+vec3f(.18)*pow(max(0.,dot(n,h)),80.);}
  if(spikeMetal){
   let reflected=environment(reflect(-v,n));let gloss=pow(max(0.,dot(n,h)),mix(32.,85.,metalWear));
   result+=reflected*mix(.045,.12,metalWear)+vec3f(.36,.33,.27)*gloss*lit.sun;
  }
  if(o.material>4.5&&o.material<5.5){let portal=scene.portals[u32(o.local.x)];let activation=portal.animation.x;let charge=portal.position.w;let delta=o.world.xz-portal.position.xz;let radius=length(delta);let swirl=.5+.5*sin(atan2(delta.y,delta.x)*3.-radius*35.+portal.animation.y);let tint=mix(mix(vec3f(.19,.21,.24),color,.16),color,activation);result=(tint*(.55+swirl*mix(.35,1.8,activation))+vec3f(.06)*exp(-radius*12.))*mix(.7,.55+charge*1.9,activation);}
  if(o.material>7.5&&o.material<8.5){let portal=scene.portals[u32(o.local.x)];result=mix(mix(vec3f(.16,.18,.2),color,.12),color*(.65+portal.position.w*2.8),portal.animation.x);}
  if(o.material>9.5&&o.material<10.5){let goal=scene.goals[u32(o.local.x)];let charge=goal.position.w;
   result=mix(color*light,goal.color.rgb*.9,charge);
   if(o.local.z>.5){
    let strokePosition=clamp((o.world.z-goal.position.z+.42)/.84,0.,1.);
    let inscribed=(1.-smoothstep(scene.finish.x-.025,scene.finish.x+.025,strokePosition))*smoothstep(0.,.04,scene.finish.x)*step(0.,scene.goalSlots[u32(o.local.x)/4u][u32(o.local.x)%4u]);
    // Idle runes keep a soft neon glow, so every finish reads at a glance.
    result=color*(mix(1.1,2.8,charge)*(.93+.07*sin(scene.options.z*2.2+o.local.x*1.7))+inscribed*3.);
   }
  }
  return vec4f(voidFog(o.world,result+marks),1.);
 }
 fn energyRune(p:vec2f,glyph:u32)->f32{
  if(glyph==4u){return runeDistance(p*.45,4u)/.45;}
  if(glyph==0u){
   let a=vec2f(0,-.63);let b=vec2f(.58,.43);let c=vec2f(-.58,.43);
   let outer=min(runeSegment(p,a,b),min(runeSegment(p,b,c),runeSegment(p,c,a)));
   let inner=min(runeSegment(p,a*.35,b*.35),min(runeSegment(p,b*.35,c*.35),runeSegment(p,c*.35,a*.35)));
   return min(outer,inner);
  }
  if(glyph==1u){return min(abs(length(p)-.51),max(0.,length(p)-.065));}
  if(glyph==2u){let d=abs(p.x)+abs(p.y);return min(abs(d-.66),abs(d-.15))*.7071;}
  var distance=abs(length(p)-.29);
  for(var i=0;i<8;i++){let a=f32(i)*.785398;let axis=vec2f(cos(a),sin(a));distance=min(distance,runeSegment(p,axis*.43,axis*.61));}
  return distance;
 }
 @fragment fn crystalFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let l=normalize(scene.light.xyz-o.world);
  let fresnel=pow(1.-abs(dot(n,v)),3.);let reflection=environment(reflect(-v,n));let gloss=pow(abs(dot(n,normalize(v+l))),80.);
  let uv=o.local.xz;let edge=min(min(uv.x,1.-uv.x),min(uv.y,1.-uv.y));let aa=max(.002,length(fwidth(uv))*.6);
  let seam=1.-smoothstep(.008-aa,.016+aa,edge);let lit=.45+max(0.,dot(n,l))*.55;
  let color=o.color*(lit+fresnel*.7)+reflection*(.12+fresnel*.28)+vec3f(1.4,1.65,1.9)*(gloss*.7+seam*.17);
  return vec4f(color,.23+fresnel*.23+seam*.17);
 }
 @fragment fn phaseFS(o:Out)->@location(0) vec4f{
  let uv=o.local.xz;let aa=max(.002,length(fwidth(uv))*.6);
  if(o.material>24.5){let radius=length(uv);let glow=exp(-radius*radius*3.5)*(1.-smoothstep(.55,1.,radius));return vec4f(o.color*2.4,glow*.18);}
  if(o.material>18.5){
   let distance=energyRune(uv,u32(round(o.material-19.)));
   let stroke=1.-smoothstep(.047-aa,.047+aa,distance);let halo=exp(-distance*14.);
   return vec4f(o.color*3.2+vec3f(.26,.2,.12),min(.97,stroke*.86+halo*.42));
  }
  let n=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let l=normalize(scene.light.xyz-o.world);
  let edge=1.-max(abs(uv.x),abs(uv.y));let rim=1.-smoothstep(.025,.17,edge);let lip=1.-smoothstep(.012,.055,edge);
  let fresnel=pow(1.-abs(dot(n,v)),3.);let reflection=environment(reflect(-v,n));
  let haze=.5+.5*sin(o.world.y*9.+sin(o.world.x*7.+scene.options.z*.3)+sin(o.world.z*8.-scene.options.z*.2));
  let bead=length((abs(uv)-vec2f(.66,.65))*vec2f(1.,1.25));let inclusions=exp(-abs(bead-.043)*100.);
  let gloss=pow(max(0.,dot(n,normalize(v+l))),110.);
  let color=o.color*(.6+max(0.,dot(n,l))*.3+rim*1.65+fresnel*.7+inclusions*.9)+reflection*(.08+fresnel*.18)+vec3f(1.5,1.65,1.8)*gloss;
  return vec4f(color,.18+rim*.25+lip*.09+fresnel*.1+inclusions*.12+haze*.018);
 }
 @fragment fn effectFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let v=normalize(scene.eye.xyz-o.world);let l=normalize(scene.light.xyz-o.world);
  let fresnel=pow(1.-abs(dot(n,v)),3.);
  var color=o.color*(.5+.65*max(0.,dot(n,l)))+o.color*fresnel*.7;
  color+=vec3f(1.8,1.9,1.6)*pow(max(0.,dot(n,normalize(v+l))),85.);
  if(o.material>6.5&&o.material<14.5){color=o.color*2.2+vec3f(.16)*fresnel;}
  if(o.material>14.5){color=o.color*(.55+.7*max(0.,dot(n,l)));}
  return vec4f(color,clamp(o.local.x,0.,1.));
 }
 `;
const skin = `
 @group(1) @binding(0) var behind:texture_2d<f32>;
 @group(1) @binding(1) var backFaces:texture_2d<f32>;
 @group(1) @binding(2) var linearSampler:sampler;
 // Embedded ivory marks use rest coordinates, so they stretch with the actual gel.
 fn inlay(p:vec3f)->f32{
  // Opposites sum to seven: +Y/-Y = 1/6, +Z/-Z = 2/5, +X/-X = 3/4.
  let a=abs(p);var face=p.xy;var count=select(5u,2u,p.z>=0.);
  if(a.x>=a.y&&a.x>=a.z){face=p.zy;count=select(4u,3u,p.x>=0.);}
  else if(a.y>=a.z){face=p.xz;count=select(6u,1u,p.y>=0.);}
  var distance=10.;
  if(count%2u==1u){distance=length(face);}
  if(count==2u||count==3u){distance=min(distance,min(length(face-vec2f(-.185)),length(face-vec2f(.185))));}
  if(count>=4u){distance=min(distance,length(abs(face)-vec2f(.185)));}
  if(count==6u){distance=min(distance,length(vec2f(abs(face.x)-.185,face.y)));}
  let aa=max(.0015,fwidth(distance)*.8);
  return 1.-smoothstep(.041-aa,.041+aa,distance);
 }
 @fragment fn backFS(o:Out)->@location(0) vec4f{return vec4f(o.world,1.+inlay(o.local));}
 @fragment fn skinFS(o:Out)->@location(0) vec4f{
  let n=normalize(o.normal);let ray=select(normalize(vec3f(scene.vp[0].z,scene.vp[1].z,scene.vp[2].z)),normalize(o.world-scene.eye.xyz),scene.eye.w>.5);let uv=o.clip.xy/scene.options.xy;
  let back=textureSampleLevel(backFaces,linearSampler,uv,0.);var thick=max(.03,length(back.xyz-o.world));
  let inside=refract(ray,n,1./1.38);let estimated=o.world+inside*thick;
  let exitClip=scene.vp*vec4f(estimated,1);let exitUV=vec2f(exitClip.x/exitClip.w*.5+.5,.5-exitClip.y/exitClip.w*.5);
  let exit=textureSampleLevel(backFaces,linearSampler,clamp(exitUV,vec2f(.001),vec2f(.999)),0.);
  if(exit.w>.5){thick=clamp(dot(exit.xyz-o.world,inside),.03,1.4);}
  var refractedUV=mix(uv,exitUV,.55);refractedUV=clamp(refractedUV,vec2f(.002),vec2f(.998));
  let pigment=o.color;var absorption=select(vec3f(2.1,.13,1.95),vec3f(2.9,1.7,.12),o.material>2.5);
  if(o.material>3.5){absorption=vec3f(.13,2.35,2.8);}
  if(o.material>4.5){absorption=vec3f(.75,2.8,.13);}
  if(o.material>5.5){absorption=vec3f(.12,.4,3.1);}
  let transmission=exp(-absorption*thick*1.2);
  let background=textureSampleLevel(behind,linearSampler,refractedUV,0.).rgb;
  var color=background*transmission+pigment*(1.-transmission)*.55;
  let farInlay=clamp(exit.w-1.,0.,1.);
  color=mix(color,vec3f(.65,.6,.33)*transmission+pigment*.11,farInlay*.22);
  let frontInlay=inlay(o.local);
  color=mix(color,vec3f(.72,.68,.42)*(.76+.24*max(0.,dot(n,normalize(scene.light.xyz-o.world))))+pigment*.07,frontInlay*.83);
  let f=.025+.975*pow(1.-max(0.,dot(n,-ray)),5.);
  color=mix(color,environment(reflect(ray,n)),min(.85,f*.78+.025));
  color+=pigment*pow(1.-max(0.,dot(n,-ray)),3.)*.34;
  let l=normalize(scene.light.xyz-o.world);let h=normalize(l-ray);
  // A tight glint: flat faces would otherwise flare white across their whole area.
  color+=(vec3f(1.25,1.15,.95)+pigment*.3)*pow(max(0.,dot(n,h)),260.);
  color+=pigment*.07;
  color+=pigment*.28*pow(max(0.,dot(-n,l)),2.)*exp(-thick*2.);
  // Glassy rounded edges catch light; the rest-space face grid locates the bevel band.
  let a=abs(o.local);let mid=a.x+a.y+a.z-max(a.x,max(a.y,a.z))-min(a.x,min(a.y,a.z));
  let band=smoothstep(.3,.365,mid);let facing=pow(1.-abs(dot(n,ray)),1.4);
  color+=(vec3f(1.,.98,.93)*(.05+.6*smoothstep(-.1,.9,n.y))+pigment*.28)*band*(.35+.4*facing+.35*max(0.,dot(n,l)));
  // Light scattered inside the gel pools near its base.
  color+=pigment*.16*(1.-smoothstep(-.38,.06,o.local.y));
  return vec4f(voidFog(o.world,color),1.);
 }
 `;
const compute = `
 struct Bind { param:vec4f, rest:vec4f, normal:vec4f };
 struct Vertex { position:vec4f, normal:vec4f, info:vec4f };
 @group(0) @binding(0) var<storage,read> nodes:array<vec4f>;
 @group(0) @binding(1) var<storage,read> restNodes:array<vec4f>;
 @group(0) @binding(2) var<storage,read> binds:array<Bind>;
 @group(0) @binding(3) var<storage,read_write> output:array<Vertex>;
 @compute @workgroup_size(64) fn deform(@builtin(global_invocation_id) id:vec3u){
  if(id.x>=6750u){return;}let instance=id.x/1350u;if(nodes[instance*64u].w<0.){return;}let bind=binds[id.x%1350u];
  let grid=clamp((bind.param.xyz+vec3f(.38))/.76*3.,vec3f(0.),vec3f(2.99999));let cell=vec3u(floor(grid));let f=fract(grid);
  var displacement=vec3f(0);var dx=vec3f(0);var dy=vec3f(0);var dz=vec3f(0);
  for(var z=0u;z<2u;z++){for(var y=0u;y<2u;y++){for(var x=0u;x<2u;x++){
   let k=cell+vec3u(x,y,z);let index=k.x+4u*(k.y+4u*k.z);
   let w=select(vec3f(1.)-f,f,vec3u(x,y,z)==vec3u(1));let sign=vec3f(vec3u(x,y,z))*2.-vec3f(1.);
   let delta=nodes[index+instance*64u].xyz-restNodes[index].xyz;
   displacement+=delta*w.x*w.y*w.z;dx+=delta*sign.x*w.y*w.z*(3./.76);dy+=delta*w.x*sign.y*w.z*(3./.76);dz+=delta*w.x*w.y*sign.z*(3./.76);
  }}}
  // Cofactor(F) transforms normals correctly under non-rigid deformation.
  let a=vec3f(1,0,0)+dx;let b=vec3f(0,1,0)+dy;let c=vec3f(0,0,1)+dz;
  let cofactor=mat3x3f(cross(b,c),cross(c,a),cross(a,b));
  output[id.x].position=vec4f(bind.rest.xyz+displacement,1.);output[id.x].normal=vec4f(normalize(cofactor*bind.normal.xyz),0.);output[id.x].info=vec4f(bind.param.xyz,nodes[instance*64u].w);
 }
 `;
const post = `
 @group(0) @binding(0) var image:texture_2d<f32>;
 @group(0) @binding(1) var linearSampler:sampler;
 @group(0) @binding(2) var bloomImage:texture_2d<f32>;
 @group(0) @binding(3) var<uniform> film:vec4f;
 const BLOOM_STRENGTH=.15;
 const VOID_COLOR=vec3f(${VOID_COLOR});
 // Indigo haze behind the diorama. The scene clears to zero alpha, so the sky only
 // shows where nothing was drawn and stays out of the MSAA and refraction buffers.
 fn skyColor(uv:vec2f,aspect:f32)->vec3f{
  let p=(uv-vec2f(.5,.38))*vec2f(aspect,1.);let falloff=max(0.,1.-dot(p,p)*.9);
  return mix(vec3f(.0038,.0049,.0088),VOID_COLOR,uv.y)+vec3f(.0036,.0056,.0118)*falloff*falloff;
 }
 @vertex fn postVS(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);}
 fn tone(input:vec3f)->vec3f{var c=max(input,vec3f(0));let x=min(c.r,min(c.g,c.b));c-=vec3f(select(.04,x-6.25*x*x,x<.08));let peak=max(c.r,max(c.g,c.b));if(peak<.76){return c;}let newPeak=1.-.0576/(peak+.24-.76);c*=newPeak/peak;return mix(c,vec3f(newPeak),1.-1./(.15*(peak-newPeak)+1.));}
 @fragment fn postFS(@builtin(position) p:vec4f)->@location(0) vec4f{
  let size=vec2f(textureDimensions(image));let uv=p.xy/size;let scene=textureSampleLevel(image,linearSampler,uv,0.);
  var hdr=scene.rgb;let cover=clamp(scene.a,0.,1.);if(cover<.999){hdr+=skyColor(uv,size.x/size.y)*(1.-cover);}
  hdr+=textureSampleLevel(bloomImage,linearSampler,uv,0.).rgb*BLOOM_STRENGTH;
  let vignette=1.-.24*smoothstep(.22,.8,length((uv-vec2f(.5))*vec2f(1.,.86)));hdr*=vignette;
  var c=tone(hdr);c=pow(max(c,vec3f(0)),vec3f(1./2.2));
  var q=fract(vec3f(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);let noise=fract((q.x+q.y)*q.z)-.5;
  // Monochrome film grain at 24 Hz, independent of the subtle static output dither.
  let cell=floor(p.xy/max(.5,film.z));let tick=floor(film.x*24.);
  var g=fract(vec3f(cell.x,cell.y,tick)*.1031);g+=dot(g,g.yzx+33.33);
  let grain=fract((g.x+g.y)*g.z)-.5;let luma=dot(c,vec3f(.2126,.7152,.0722));
  c+=vec3f(grain*film.y*(.3+.7*sqrt(clamp(luma,0.,1.))));
  return vec4f(clamp(c+noise/255.,vec3f(0),vec3f(1)),1);
 }
 `;
// Bright emissive pixels feed a four-level dual-filter blur from quarter resolution down:
// runes, flames, beams and jelly glints glow without extra full-resolution passes.
const BLOOM_LEVELS = 4;
const bloomShader = `
 @group(0) @binding(0) var source:texture_2d<f32>;
 @group(0) @binding(1) var linearSampler:sampler;
 struct V { @builtin(position) clip:vec4f, @location(0) uv:vec2f };
 @vertex fn bloomVS(@builtin(vertex_index) i:u32)->V{let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var o:V;o.clip=vec4f(p[i],0,1);o.uv=vec2f(p[i].x*.5+.5,.5-p[i].y*.5);return o;}
 fn tap(uv:vec2f)->vec3f{return textureSampleLevel(source,linearSampler,uv,0.).rgb;}
 fn down(uv:vec2f)->vec3f{let h=.5/vec2f(textureDimensions(source));return (tap(uv)*4.+tap(uv-h)+tap(uv+h)+tap(uv+vec2f(h.x,-h.y))+tap(uv-vec2f(h.x,-h.y)))/8.;}
 // The first level reads the full-resolution scene: four bilinear taps average its 4x4 block.
 @fragment fn bloomPrefilterFS(o:V)->@location(0) vec4f{
  let t=1./vec2f(textureDimensions(source));
  let c=(tap(o.uv-t)+tap(o.uv+t)+tap(o.uv+vec2f(t.x,-t.y))+tap(o.uv-vec2f(t.x,-t.y)))*.25;let peak=max(c.r,max(c.g,c.b));let threshold=.92;let knee=.45;
  var soft=clamp(peak-threshold+knee,0.,2.*knee);soft=soft*soft/(4.*knee);
  return vec4f(min(c*max(soft,peak-threshold)/max(peak,.0001),vec3f(14.)),1.);
 }
 @fragment fn bloomDownFS(o:V)->@location(0) vec4f{return vec4f(down(o.uv),1.);}
 @fragment fn bloomUpFS(o:V)->@location(0) vec4f{
  let h=.5/vec2f(textureDimensions(source));let uv=o.uv;
  let c=tap(uv+vec2f(-h.x*2.,0.))+tap(uv+vec2f(0.,h.y*2.))+tap(uv+vec2f(h.x*2.,0.))+tap(uv+vec2f(0.,-h.y*2.))+(tap(uv+vec2f(-h.x,h.y))+tap(uv+h)+tap(uv+vec2f(h.x,-h.y))+tap(uv-h))*2.;
  return vec4f(c/12.,1.);
 }
 `;
const latticeShader = `
 struct Portal { position:vec4f, color:vec4f, animation:vec4f };
 struct Goal { position:vec4f, color:vec4f };
 struct Scene { vp:mat4x4f, lightVP:mat4x4f, eye:vec4f, light:vec4f, body0:vec4f, body1:vec4f, body2:vec4f, options:vec4f, portals:array<Portal,${PORTAL_LIMIT}>, goals:array<Goal,5>, torches:array<vec4f,8>, body3:vec4f, body4:vec4f, bodySlots:array<vec4f,2>, finish:vec4f, goalSlots:array<vec4f,2> };
 @group(0) @binding(0) var<uniform> scene:Scene;
 @group(0) @binding(1) var<storage,read> nodes:array<vec4f>;
 @group(0) @binding(2) var<storage,read> edges:array<u32>;
 @vertex fn latticeVS(@builtin(vertex_index) id:u32,@builtin(instance_index) body:u32)->@builtin(position) vec4f{return scene.vp*vec4f(nodes[edges[id]+body*64u].xyz,1);}
 @fragment fn latticeFS()->@location(0) vec4f{return vec4f(.7,1.,.55,.48);}
 `;
const colliderShader = `
 struct View { vp:mat4x4f };
 @group(0) @binding(0) var<uniform> view:View;
 struct Line { @builtin(position) clip:vec4f,@location(0) color:vec3f };
 @vertex fn colliderVS(@location(0) position:vec3f,@location(1) color:vec3f)->Line{var o:Line;o.clip=view.vp*vec4f(position,1);o.color=color;return o;}
 @fragment fn colliderFS(o:Line)->@location(0) vec4f{return vec4f(o.color,.72);}
 `;
class Renderer {
  constructor(canvas, soft) {
    this.canvas = canvas;
    this.soft = soft;
    this.ready = false;
    this.error = null;
    this.mesh = false;
    this.grain = true;
    this.dust = true;
    this.grainStrength = 1;
    this.grainSize = 1;
    this.dustDensity = 1;
    this.dustSpeed = 1;
    this.filmData = new Float32Array(4);
    this.frames = 0;
    this.errors = [];
  }
  async init() {
    this.onProgress?.(0.05, 'loadingGraphics');
    if (!navigator.gpu)
      throw Error(
        'В этом браузере нет WebGPU. Откройте игру в актуальном Chrome или Edge с аппаратным ускорением.',
      );
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter)
      throw Error('Браузер не предоставил WebGPU-адаптер. Проверьте аппаратное ускорение.');
    const d = (this.device = await adapter.requestDevice());
    this.adapterInfo = adapter.info;
    this.onProgress?.(0.18, 'loadingShaders');
    d.addEventListener('uncapturederror', (e) => {
      this.errors.push(e.error.message);
      console.error(e.error.message);
    });
    d.lost.then((info) => {
      this.ready = false;
      this.error = info.message || 'Соединение с графическим устройством потеряно.';
      this.onFailure?.(this.error);
    });
    this.context = this.canvas.getContext('webgpu');
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({ device: d, format: this.format, alphaMode: 'opaque' });
    const module = async (label, code) => {
      const m = d.createShaderModule({ label, code });
      const info = await m.getCompilationInfo();
      const errors = info.messages.filter((x) => x.type === 'error');
      if (errors.length) throw Error(label + ': ' + errors.map((e) => e.message).join('\n'));
      return m;
    };
    const main = await module('Dungeon and candy', shared + skin),
      deform = await module('Cofactor deformation', compute),
      finish = await module('Khronos PBR Neutral', post),
      lattice = await module('XPBD lattice overlay', latticeShader),
      collider = await module('Level collision overlay', colliderShader),
      bloom = await module('Bloom', bloomShader);
    this.onProgress?.(0.4, 'loadingScene');
    this.uniform = this.buffer(
      new Float32Array(SCENE_FLOATS),
      GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    );
    const bindings = surfaceBindings(this.soft);
    this.bindingCount = bindings.count;
    this.bindBuffer = this.buffer(bindings.vertices, GPUBufferUsage.STORAGE);
    this.indexBuffer = this.buffer(bindings.indices, GPUBufferUsage.INDEX);
    this.indexCount = bindings.indices.length;
    this.nodes = this.buffer(
      new Float32Array(320 * 4),
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    this.restNodes = this.buffer(
      new Float32Array(this.soft.rest.flatMap((p) => [...p, 0])),
      GPUBufferUsage.STORAGE,
    );
    this.deformed = d.createBuffer({
      size: 6750 * 48,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX,
    });
    this.compute = d.createComputePipeline({
      layout: 'auto',
      compute: { module: deform, entryPoint: 'deform' },
    });
    this.computeGroup = d.createBindGroup({
      layout: this.compute.getBindGroupLayout(0),
      entries: [this.nodes, this.restNodes, this.bindBuffer, this.deformed].map(
        (buffer, binding) => ({ binding, resource: { buffer } }),
      ),
    });
    this.sceneLayout = d.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: 'uniform' },
        },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    this.skinLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const layout = d.createPipelineLayout({
      bindGroupLayouts: [this.sceneLayout, this.skinLayout],
    });
    const vertexBuffers = [
      {
        arrayStride: 48,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'float32x3' },
          { shaderLocation: 3, offset: 36, format: 'float32x3' },
        ],
      },
    ];
    const pipeline = (
      vertexEntry,
      fragmentEntry,
      cullMode = 'back',
      samples = 4,
      depthCompare = 'less',
      depthWrite = true,
      blend = undefined,
      buffers = [
        'solidVS',
        'portalHaloVS',
        'portalRingVS',
        'goalBeamVS',
        'goalGlowVS',
        'goalSealVS',
      ].includes(vertexEntry)
        ? vertexBuffers
        : [],
    ) =>
      d.createRenderPipeline({
        layout,
        vertex: { module: main, entryPoint: vertexEntry, buffers },
        fragment: {
          module: main,
          entryPoint: fragmentEntry,
          targets: [{ format: 'rgba16float', blend }],
        },
        primitive: { topology: 'triangle-list', cullMode, frontFace: 'ccw' },
        depthStencil: { format: 'depth32float', depthWriteEnabled: depthWrite, depthCompare },
        multisample: { count: samples },
      });
    this.opaque = pipeline('solidVS', 'solidFS');
    const assemblyBuffers = [
      ...vertexBuffers,
      { arrayStride: 16, attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }] },
    ];
    this.stonePipeline = pipeline(
      'assemblyVS',
      'stoneFS',
      'back',
      4,
      'less',
      true,
      undefined,
      assemblyBuffers,
    );
    this.skin = pipeline('softVS', 'skinFS');
    this.back = pipeline('softVS', 'backFS', 'front', 1, 'greater');
    this.effectPipeline = pipeline('solidVS', 'effectFS', 'back', 4, 'less', false, {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    });
    this.phasePipeline = pipeline(
      'assemblyVS',
      'phaseFS',
      'back',
      4,
      'less',
      false,
      {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      },
      assemblyBuffers,
    );
    const crystalBlend = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    this.crystalBackPipeline = pipeline(
      'solidVS',
      'crystalFS',
      'front',
      4,
      'less',
      false,
      crystalBlend,
    );
    this.crystalPipeline = pipeline('solidVS', 'crystalFS', 'back', 4, 'less', false, crystalBlend);
    const additive = {
      color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    };
    this.runePipeline = pipeline('runeVS', 'runeFS', 'none', 4, 'less', false, additive, [
      vertexBuffers[0],
      {
        arrayStride: 48,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 4, offset: 0, format: 'float32x4' },
          { shaderLocation: 5, offset: 16, format: 'float32x4' },
          { shaderLocation: 6, offset: 32, format: 'float32x4' },
        ],
      },
    ]);
    this.runeData = new Float32Array(32 * 12);
    this.runeBuffer = d.createBuffer({
      size: this.runeData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.beamPipeline = pipeline('beamVS', 'beamFS', 'none', 4, 'less', false, additive, [
      {
        arrayStride: 48,
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 4, offset: 0, format: 'float32x4' },
          { shaderLocation: 5, offset: 16, format: 'float32x4' },
          { shaderLocation: 6, offset: 32, format: 'float32x4' },
        ],
      },
    ]);
    this.beamData = new Float32Array(16 * 12);
    this.beamBuffer = d.createBuffer({
      size: this.beamData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.dustPipeline = pipeline('dustVS', 'dustFS', 'none', 4, 'less', false, additive, [
      {
        arrayStride: 16,
        stepMode: 'instance',
        attributes: [{ shaderLocation: 4, offset: 0, format: 'float32x4' }],
      },
    ]);
    this.dustData = new Float32Array(64 * 4);
    this.dustBuffer = d.createBuffer({
      size: this.dustData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.portalHaloPipeline = pipeline(
      'portalHaloVS',
      'portalFXFS',
      'none',
      4,
      'less',
      false,
      additive,
    );
    this.portalRingPipeline = pipeline(
      'portalRingVS',
      'portalFXFS',
      'back',
      4,
      'less',
      false,
      additive,
    );
    this.goalBeamPipeline = pipeline(
      'goalBeamVS',
      'goalBeamFS',
      'none',
      4,
      'less',
      false,
      additive,
    );
    this.goalGlowPipeline = pipeline(
      'goalGlowVS',
      'portalFXFS',
      'none',
      4,
      'less',
      false,
      additive,
    );
    this.goalSealPipeline = pipeline(
      'goalSealVS',
      'goalSealFS',
      'none',
      4,
      'less',
      false,
      additive,
    );
    const glow = {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
    };
    this.flamePipeline = pipeline('flameVS', 'flameFS', 'none', 4, 'less', false, glow, [
      vertexBuffers[0],
    ]);
    const ring = [];
    portalRing(ring, 0, 0, 0, [1, 1, 1]);
    this.portalRingCount = ring.length / 12;
    this.portalRingBuffer = this.buffer(new Float32Array(ring), GPUBufferUsage.VERTEX);
    const halo = [];
    for (const p of [
      [-1, 0, -1],
      [1, 0, 1],
      [1, 0, -1],
      [-1, 0, -1],
      [-1, 0, 1],
      [1, 0, 1],
    ])
      halo.push(...p, 0, 1, 0, 1, 1, 1, 0, 0, 0);
    this.portalHaloBuffer = this.buffer(new Float32Array(halo), GPUBufferUsage.VERTEX);
    this.shadow = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.sceneLayout] }),
      vertex: { module: main, entryPoint: 'shadowVS', buffers: vertexBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.assemblyShadow = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.sceneLayout] }),
      vertex: { module: main, entryPoint: 'assemblyShadowVS', buffers: assemblyBuffers },
      primitive: { topology: 'triangle-list', cullMode: 'back' },
      depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.post = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: finish, entryPoint: 'postVS' },
      fragment: { module: finish, entryPoint: 'postFS', targets: [{ format: this.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.filmUniform = this.buffer(this.filmData, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.bloomLayout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });
    const bloomLayout = d.createPipelineLayout({ bindGroupLayouts: [this.bloomLayout] });
    const bloomPipeline = (entryPoint, blend) =>
      d.createRenderPipeline({
        layout: bloomLayout,
        vertex: { module: bloom, entryPoint: 'bloomVS' },
        fragment: { module: bloom, entryPoint, targets: [{ format: 'rgba16float', blend }] },
        primitive: { topology: 'triangle-list' },
      });
    this.bloomPrefilter = bloomPipeline('bloomPrefilterFS');
    this.bloomDown = bloomPipeline('bloomDownFS');
    this.bloomUp = bloomPipeline('bloomUpFS', {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    });
    this.latticePipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: lattice, entryPoint: 'latticeVS' },
      fragment: {
        module: lattice,
        entryPoint: 'latticeFS',
        targets: [
          {
            format: 'rgba16float',
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'line-list' },
      multisample: { count: 4 },
    });
    const edgeData = new Uint32Array(this.soft.edges.flatMap((e) => [e.a, e.b]));
    this.edgeCount = edgeData.length;
    this.edgeBuffer = this.buffer(edgeData, GPUBufferUsage.STORAGE);
    this.latticeGroup = d.createBindGroup({
      layout: this.latticePipeline.getBindGroupLayout(0),
      entries: [this.uniform, this.nodes, this.edgeBuffer].map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
    this.colliderPipeline = d.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: collider,
        entryPoint: 'colliderVS',
        buffers: [
          {
            arrayStride: 24,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              { shaderLocation: 1, offset: 12, format: 'float32x3' },
            ],
          },
        ],
      },
      fragment: {
        module: collider,
        entryPoint: 'colliderFS',
        targets: [
          {
            format: 'rgba16float',
            blend: {
              color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
            },
          },
        ],
      },
      primitive: { topology: 'line-list' },
      multisample: { count: 4 },
    });
    this.colliderGroup = d.createBindGroup({
      layout: this.colliderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniform } }],
    });
    this.colliderBuffer = d.createBuffer({
      size: 256000,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.shadowTexture = d.createTexture({
      size: [1024, 1024],
      format: 'depth32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.sampler = d.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.compareSampler = d.createSampler({
      compare: 'less',
      magFilter: 'linear',
      minFilter: 'linear',
    });
    this.onProgress?.(0.65, 'loadingTextures');
    let texturesLoaded = 0;
    [this.stoneTexture, this.woodTexture] = await Promise.all(
      ['dungeon-stone-atlas.png', 'crate-oak.png'].map(async (name) => {
        const texture = await this.loadMaterialTexture('assets/materials/' + name);
        this.onProgress?.(0.65 + ++texturesLoaded * 0.12, 'loadingTextures');
        return texture;
      }),
    );
    this.materialSampler = d.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      mipmapFilter: 'linear',
      maxAnisotropy: 4,
    });
    const materialEntries = [
      { binding: 4, resource: this.stoneTexture.createView() },
      { binding: 5, resource: this.woodTexture.createView() },
      { binding: 6, resource: this.materialSampler },
    ];
    this.sceneGroup = d.createBindGroup({
      layout: this.sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: { buffer: this.deformed } },
        { binding: 2, resource: this.shadowTexture.createView() },
        { binding: 3, resource: this.compareSampler },
        ...materialEntries,
      ],
    });
    // A distinct unsampled depth texture avoids attachment/sampling hazards in the shadow pass.
    this.dummyShadow = d.createTexture({
      size: [1, 1],
      format: 'depth32float',
      usage: GPUTextureUsage.TEXTURE_BINDING,
    });
    this.shadowGroup = d.createBindGroup({
      layout: this.sceneLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniform } },
        { binding: 1, resource: { buffer: this.deformed } },
        { binding: 2, resource: this.dummyShadow.createView() },
        { binding: 3, resource: this.compareSampler },
        ...materialEntries,
      ],
    });
    this.staticBuffer = d.createBuffer({
      size: 4e6,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.phaseBuffer = d.createBuffer({
      size: 65536,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.phaseFaces = [];
    this.propBuffer = d.createBuffer({
      size: 2e6,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.bridgeBuffer = d.createBuffer({
      size: 1e6,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.effectBuffer = d.createBuffer({
      size: 4e6,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.decorationBuffer = d.createBuffer({
      size: 2e6,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.ready = true;
    this.onProgress?.(1, 'loadingReady');
    return this;
  }
  buffer(data, usage) {
    const b = this.device.createBuffer({
      size: Math.max(4, data.byteLength),
      usage,
      mappedAtCreation: true,
    });
    new Uint8Array(b.getMappedRange()).set(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
    b.unmap();
    return b;
  }
  async loadMaterialTexture(url) {
    const response = await fetch(url);
    if (!response.ok) throw Error('Cannot load material: ' + url);
    const bitmap = await createImageBitmap(await response.blob()),
      { width, height } = bitmap,
      mipLevelCount = 1 + Math.floor(Math.log2(Math.max(width, height)));
    const texture = this.device.createTexture({
      label: url,
      size: [width, height],
      mipLevelCount,
      format: 'rgba8unorm-srgb',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    for (let mip = 0; mip < mipLevelCount; mip++) {
      const w = Math.max(1, width >> mip),
        h = Math.max(1, height >> mip),
        canvas = new OffscreenCanvas(w, h),
        ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, w, h);
      this.device.queue.copyExternalImageToTexture({ source: canvas }, { texture, mipLevel: mip }, [
        w,
        h,
      ]);
    }
    bitmap.close();
    return texture;
  }
  resize() {
    const rect = this.canvas.getBoundingClientRect(),
      width = Math.max(1, rect.width),
      height = Math.max(1, rect.height);
    const ratio = Math.min(devicePixelRatio || 1, 1.25, Math.sqrt(2e6 / (width * height))),
      w = Math.max(1, Math.round(width * ratio)),
      h = Math.max(1, Math.round(height * ratio));
    if (this.canvas.width === w && this.canvas.height === h && this.hdr) return;
    this.canvas.width = w;
    this.canvas.height = h;
    const d = this.device;
    for (const t of [
      this.hdr,
      this.background,
      this.msaa,
      this.depth,
      this.exitDepth,
      ...(this.exits || []),
      ...(this.bloomTextures || []),
    ])
      t?.destroy();
    const create = (format, sampleCount = 1, extra = 0) =>
      d.createTexture({
        size: [w, h],
        format,
        sampleCount,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | extra,
      });
    this.hdr = create('rgba16float', 1, GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC);
    this.background = create(
      'rgba16float',
      1,
      GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    );
    this.msaa = create('rgba16float', 4);
    this.depth = create('depth32float', 4);
    this.exitDepth = create('depth32float');
    this.exits = Array.from({ length: 5 }, () =>
      create('rgba16float', 1, GPUTextureUsage.TEXTURE_BINDING),
    );
    this.skinGroups = this.exits.map((t) =>
      d.createBindGroup({
        layout: this.skinLayout,
        entries: [
          { binding: 0, resource: this.background.createView() },
          { binding: 1, resource: t.createView() },
          { binding: 2, resource: this.sampler },
        ],
      }),
    );
    this.bloomTextures = [];
    for (let i = 0, bw = w >> 1, bh = h >> 1; i < BLOOM_LEVELS; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      this.bloomTextures.push(
        d.createTexture({
          size: [bw, bh],
          format: 'rgba16float',
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        }),
      );
    }
    this.bloomViews = this.bloomTextures.map((t) => t.createView());
    const bloomGroup = (view) =>
      d.createBindGroup({
        layout: this.bloomLayout,
        entries: [
          { binding: 0, resource: view },
          { binding: 1, resource: this.sampler },
        ],
      });
    // Down pass i reads the previous level (the HDR scene for i=0); up pass i reads level i.
    this.bloomDownGroups = [this.hdr.createView(), ...this.bloomViews.slice(0, -1)].map(bloomGroup);
    this.bloomUpGroups = this.bloomViews.map(bloomGroup);
    this.postGroup = d.createBindGroup({
      layout: this.post.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.hdr.createView() },
        { binding: 1, resource: this.sampler },
        { binding: 2, resource: this.bloomViews[0] },
        { binding: 3, resource: { buffer: this.filmUniform } },
      ],
    });
  }
  encodeBloom(encoder) {
    const pass = (view, loadOp) =>
      encoder.beginRenderPass({
        colorAttachments: [
          { view, loadOp, clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: 'store' },
        ],
      });
    this.bloomViews.forEach((view, i) => {
      const p = pass(view, 'clear');
      p.setPipeline(i ? this.bloomDown : this.bloomPrefilter);
      p.setBindGroup(0, this.bloomDownGroups[i]);
      p.draw(3);
      p.end();
    });
    for (let i = this.bloomViews.length - 1; i > 0; i--) {
      const p = pass(this.bloomViews[i - 1], 'load');
      p.setPipeline(this.bloomUp);
      p.setBindGroup(0, this.bloomUpGroups[i]);
      p.draw(3);
      p.end();
    }
  }
  buildScene(level) {
    this.buildDust(level.world);
    const mesh = [],
      phaseMesh = [],
      assembly = [],
      phaseAssembly = [],
      blocks = (level.world.blocks || []).filter(
        (b) =>
          !level.bridges.some((p) => p.x === b.x && p.z === b.z && p.y === b.y) &&
          !level.world.lifts.some((p) => p.x === b.x && p.z === b.z && p.base === b.y),
      ),
      occupied = new Set(
        blocks.filter((b) => b.color === undefined).map((b) => [b.x, b.y, b.z].join(',')),
      );
    let blockIndex = 0;
    const recordBlock = (target, source, from, center) => {
      for (let k = from; k < source.length; k += 12) target.push(...center, blockIndex);
      blockIndex++;
    };
    const blockTints = [
      [0.08, 0.88, 0.12],
      [0.025, 0.48, 1],
      [1, 0.045, 0.015],
      [0.64, 0.07, 1],
      [1, 0.67, 0.025],
    ];
    this.phaseFaces = [];
    // The void fog starts beneath the lowest walkable top of the map.
    this.fogBase = blocks.reduce(
      (low, b) => Math.min(low, b.y),
      level.floor?.size ? 0 : blocks.length ? Infinity : 0,
    );
    // Voxel-style contact occlusion: each face corner darkens with the stone cells around it.
    const AO = [0.46, 0.63, 0.81, 1],
      solid = (cell) => occupied.has(cell.join(','));
    const occlusion = (b) => {
      const corners = new Map();
      return (axis, sign, s, t) => {
        const key = axis * 2 + (sign > 0 ? 1 : 0);
        let c = corners.get(key);
        if (!c) {
          const u = (axis + 1) % 3,
            v = (axis + 2) % 3,
            front = [b.x, b.y, b.z];
          front[axis] += sign;
          const at = (du, dv) => {
            const cell = [...front];
            cell[u] += du;
            cell[v] += dv;
            return solid(cell) ? 1 : 0;
          };
          const corner = (du, dv) => {
            const a = at(du, 0),
              e = at(0, dv);
            return AO[a && e ? 0 : 3 - a - e - at(du, dv)];
          };
          // A face pressed against another stone is only seen through the joint: keep it as deep mortar.
          c = solid(front)
            ? [0.12, 0.12, 0.12, 0.12]
            : [corner(-1, -1), corner(1, -1), corner(-1, 1), corner(1, 1)];
          corners.set(key, c);
        }
        return (c[0] * (1 - s) + c[1] * s) * (1 - t) + (c[2] * (1 - s) + c[3] * s) * t;
      };
    };
    for (const b of blocks) {
      if (
        [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ].every((d) => occupied.has([b.x + d[0], b.y + d[1], b.z + d[2]].join(',')))
      )
        continue;
      if (b.color !== undefined) {
        const from = phaseMesh.length;
        phaseBlock(phaseMesh, this.phaseFaces, b, blockTints[b.color]);
        const support = level.world.heightAt(b.x, b.z, b.y - 0.99);
        if (support !== null && Math.abs(support - (b.y - 1)) < 0.01)
          phaseGroundGlow(phaseMesh, this.phaseFaces, b, blockTints[b.color]);
        recordBlock(phaseAssembly, phaseMesh, from, [b.x, b.y - 0.5, b.z]);
        continue;
      }
      const from = mesh.length;
      const n = ((((b.x * 73 + b.y * 31 + b.z * 137) % 19) + 19) % 19) / 19,
        color =
          b.y > 0
            ? [0.2 + n * 0.03, 0.172 + n * 0.026, 0.142 + n * 0.022]
            : [0.265 + n * 0.04, 0.225 + n * 0.035, 0.18 + n * 0.03];
      box(mesh, [b.x, b.y - 0.5, b.z], [0.97, 1, 0.97], color, 0.06, 0, 2, {
        crisp: true,
        shade: occlusion(b),
        detail: mossAt,
      });
      recordBlock(assembly, mesh, from, [b.x, b.y - 0.5, b.z]);
    }
    for (const key of level.floor) {
      const [x, z] = key.split(',').map(Number);
      if (level.bridges.some((b) => b.x === x && b.z === z)) continue;
      const from = mesh.length;
      const height = 0;
      const noise = ((x * 73 + z * 137) % 19) / 19,
        color = [0.265 + noise * 0.04, 0.225 + noise * 0.035, 0.18 + noise * 0.03];
      if (level.world.lifts.some((l) => l.x === x && l.z === z)) {
        const base = level.world.lifts.find((l) => l.x === x && l.z === z).base || 0;
        box(mesh, [x, base - 0.52, z], [0.99, 0.25, 0.99], [0.12, 0.14, 0.12], 0.025);
      } else {
        box(mesh, [x, height - 0.36, z], [0.97, 0.72, 0.97], color, 0.045);
        const upper = level.world.heights.get(key) || 0;
        for (let y = 0; y < upper; y++) {
          const span = Math.min(1, upper - y);
          box(mesh, [x, y + span * 0.5, z], [0.97, span, 0.97], color, 0.045);
        }
      }
      recordBlock(assembly, mesh, from, [x, height - 0.36, z]);
    }
    for (const o of level.world.collisionBoxes().filter((o) => o.kind === 'wall')) {
      const from = mesh.length;
      box(
        mesh,
        [o.x, (o.minY + o.maxY) * 0.5, o.z],
        [o.half * 2 - 0.03, o.maxY - o.minY, o.half * 2 - 0.03],
        o.half > 0.4 ? [0.12, 0.145, 0.18] : [0.105, 0.12, 0.115],
        0.045,
      );
      recordBlock(assembly, mesh, from, [o.x, (o.minY + o.maxY) * 0.5, o.z]);
    }
    for (const [key, values] of [
      ['assemblyBuffer', assembly],
      ['phaseAssemblyBuffer', phaseAssembly],
    ]) {
      for (let i = 3; i < values.length; i += 4) values[i] /= Math.max(1, blockIndex - 1);
      this[key]?.destroy();
      this[key] = this.buffer(
        new Float32Array(values.length ? values : [0, 0, 0, 0]),
        GPUBufferUsage.VERTEX,
      );
    }
    this.assemblyBlockCount = blockIndex;
    // Masonry comes first and uses the stone pipeline; decor follows in the same buffer.
    const decor = [];
    scatterDecor(decor, level, occupied);
    const data = new Float32Array(mesh.length + decor.length);
    data.set(mesh);
    data.set(decor, mesh.length);
    if (data.byteLength > this.staticBuffer.size) {
      this.staticBuffer.destroy();
      this.staticBuffer = this.device.createBuffer({
        size: Math.ceil(data.byteLength / 65536) * 65536,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    this.stoneCount = mesh.length / 12;
    this.staticCount = data.length / 12;
    this.device.queue.writeBuffer(this.staticBuffer, 0, data);
    const phaseData = new Float32Array(phaseMesh);
    if (phaseData.byteLength > this.phaseBuffer.size) {
      this.phaseBuffer.destroy();
      this.phaseBuffer = this.device.createBuffer({
        size: Math.ceil(phaseData.byteLength / 65536) * 65536,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
    if (phaseData.length) this.device.queue.writeBuffer(this.phaseBuffer, 0, phaseData);
  }
  bridges(level) {
    const mesh = [];
    level.bridges.forEach((bridge) => {
      const from = mesh.length;
      const progress = bridge.progress ?? (level.world.soft ? 0 : 1),
        x = bridge.x,
        z = bridge.z,
        height = (bridge.y || 0) - (1 - progress) * 0.72;
      // Two dark oak beams keep the full silhouette readable while the bridge rises.
      for (const side of [-1, 1])
        box(
          mesh,
          [x + side * 0.31, -0.13, z],
          [0.13, 0.2, 0.96],
          [0.18, 0.105, 0.045],
          0.014,
          11,
          2,
        );
      // Separate crosswise boards retain fixed UV scale and never stretch during motion.
      for (let n = 0; n < 5; n++) {
        const boardZ = z + (n - 2) * 0.19,
          warm = n % 2 ? 0.018 : 0;
        box(
          mesh,
          [x, -0.035 + (n % 3) * 0.002, boardZ],
          [0.92, 0.1, 0.18],
          [0.42 + warm, 0.225 + warm, 0.08],
          0.012,
          11,
          2,
        );
        for (const side of [-1, 1])
          if (n === 0 || n === 4)
            box(
              mesh,
              [x + side * 0.37, 0.022, boardZ],
              [0.07, 0.025, 0.055],
              [0.31, 0.23, 0.14],
              0.004,
              12,
              1,
            );
      }
      // Iron end brackets visually lock the deck into the banks.
      for (const end of [-1, 1])
        box(
          mesh,
          [x, 0.008, z + end * 0.445],
          [0.82, 0.035, 0.045],
          [0.19, 0.16, 0.13],
          0.006,
          12,
          1,
        );
      for (let k = from; k < mesh.length; k += 12) mesh[k + 1] += height;
    });
    if (mesh.length) {
      const data = new Float32Array(mesh);
      if (data.byteLength > this.bridgeBuffer.size) {
        this.bridgeBuffer.destroy();
        this.bridgeBuffer = this.device.createBuffer({
          size: Math.ceil(data.byteLength / 65536) * 65536,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      this.device.queue.writeBuffer(this.bridgeBuffer, 0, data);
    }
    return mesh.length / 12;
  }
  buildProps(level, players) {
    const pieces = [],
      crystals = [],
      bone = [0.88, 0.84, 0.65],
      dark = [0.018, 0.035, 0.027],
      r = [1, 0, 0],
      front = [0, 0, 1],
      basis = [r, [0, 1, 0], front];
    const append = (kind, index, mesh, extra = {}) =>
      pieces.push({ kind, index, data: new Float32Array(mesh), ...extra });
    for (let i = 0; i < players.length; i++) {
      const mesh = [],
        center = [0, 0, 0];
      sphere(mesh, center, [0.145, 0.14, 0.126], bone, 1, basis);
      sphere(
        mesh,
        [center[0], center[1] - 0.115, center[2]],
        [0.095, 0.055, 0.095],
        bone,
        1,
        basis,
      );
      for (const sign of [-1, 1]) {
        const eye = center.map((v, k) => v + front[k] * 0.108 + r[k] * sign * 0.055);
        eye[1] += 0.022;
        sphere(mesh, eye, [0.036, 0.043, 0.022], dark, 1, basis);
      }
      const nose = center.map((v, k) => v + front[k] * 0.125);
      nose[1] -= 0.042;
      sphere(mesh, nose, [0.019, 0.022, 0.012], dark, 1, basis);
      for (const t of [-1, 0, 1]) {
        const tooth = center.map((v, k) => v + front[k] * 0.085 + r[k] * t * 0.047);
        tooth[1] -= 0.152;
        sphere(mesh, tooth, [0.018, 0.022, 0.022], bone, 1, basis);
      }
      for (const sign of [-1, 1]) {
        const tilt = sign * 0.38,
          axis = r.map((v, k) => v * Math.cos(tilt) + (k === 1 ? Math.sin(tilt) : 0)),
          other = r.map((v, k) => -v * Math.sin(tilt) + (k === 1 ? Math.cos(tilt) : 0));
        const origin = center.map((v, k) => v - front[k] * 0.025);
        origin[1] -= 0.205;
        sphere(mesh, origin, [0.145, 0.019, 0.019], bone, 1, [axis, other, front]);
        for (const end of [-1, 1])
          sphere(
            mesh,
            origin.map((v, k) => v + axis[k] * end * 0.135),
            [0.025, 0.025, 0.025],
            bone,
            1,
          );
      }
      append('jelly', i, mesh);
      const tint = [
        [0.62, 0.95, 0.5],
        [0.55, 0.75, 1],
        [1, 0.6, 0.48],
        [0.85, 0.6, 1],
        [1, 0.88, 0.5],
      ][players[i].slot ?? i];
      for (let j = 0; j < BUBBLES; j++) {
        const mesh = [],
          phase = j * 2.4 + i,
          size = 0.011 + ((j * 7 + i * 3) % 5) * 0.0045,
          position = [
            Math.sin(phase) * (0.17 + (j % 3) * 0.035),
            -0.26 + j * BUBBLE_SPACING,
            Math.cos(phase) * (0.16 + ((j + 1) % 3) * 0.035),
          ];
        sphere(mesh, position, [size, size, size], tint, 26, null, lowSphere);
        append('bubble', i, mesh, { bubble: j });
      }
    }
    for (let i = 0; i < (level.crates || []).length; i++) append('crate', i, crateGeometry());
    for (let i = 0; i < (level.world.drones || []).length; i++) {
      const geometry = droneGeometry(beamColors[level.world.drones[i].color]);
      append('drone', i, geometry.mesh);
      crystals.push(geometry.crystal);
    }
    const shield = shieldGeometry(),
      heldShield = shield.slice();
    rod(heldShield, [0, -0.02, -0.25], [-0.045, -0.07, -0.11], 0.043, bone);
    rod(heldShield, [-0.045, -0.07, -0.11], [0, -0.04, -0.012], 0.035, bone);
    sphere(heldShield, [0, -0.04, -0.012], [0.044, 0.037, 0.035], bone);
    for (let i = 0; i < players.length; i++) append('shield', i, heldShield);
    for (let i = 0; i < players.length; i++)
      for (let damage = 1; damage <= 2; damage++) {
        const mesh = [],
          points =
            damage === 1
              ? [
                  [-0.13, 0.24, 0.057],
                  [-0.05, 0.12, 0.057],
                  [-0.1, 0.035, 0.057],
                ]
              : [
                  [0.1, -0.27, 0.057],
                  [0.04, -0.18, 0.057],
                  [0.13, -0.08, 0.057],
                ];
        for (let k = 1; k < points.length; k++)
          for (const depth of [0.057, -0.004])
            rod(
              mesh,
              [points[k - 1][0], points[k - 1][1], depth],
              [points[k][0], points[k][1], depth],
              0.009,
              [0.025, 0.015, 0.008],
              13,
            );
        append('shieldCrack', i, mesh, { damage });
      }
    const sword = swordGeometry(),
      heldSword = sword.slice();
    rod(heldSword, [0, -0.08, -0.25], [-0.03, -0.22, -0.11], 0.043, bone);
    rod(heldSword, [-0.03, -0.22, -0.11], [0, -0.22, -0.02], 0.035, bone);
    sphere(heldSword, [0, -0.22, -0.025], [0.043, 0.036, 0.035], bone);
    for (let i = 0; i < players.length; i++) append('sword', i, heldSword);
    for (let i = 0; i < level.world.pickups.length; i++)
      append('pickup', i, level.world.pickups[i].kind === 'sword' ? sword : shield);
    const arrow = arrowGeometry();
    for (let i = 0; i < 12; i++) append('arrow', i, arrow);
    for (let i = 0; i < level.world.archers.length; i++) {
      append('archer', i, archerGeometry());
      append('archerBow', i, bowGeometry());
      const string = [];
      rod(string, [-0.09, 0.19, 0.21], [-0.09, 0.57, 0.21], 0.008, [0.72, 0.62, 0.42], 1);
      rod(string, [-0.09, 0.57, 0.21], [-0.09, 0.95, 0.21], 0.008, [0.72, 0.62, 0.42], 1);
      append('archerString', i, string);
      append('nockedArrow', i, arrow);
    }
    for (let i = 0; i < level.plates.length; i++) {
      const mesh = [],
        plate = level.plates[i],
        palette = {
          green: [0.22, 0.65, 0.035],
          red: [0.78, 0.026, 0.012],
          blue: [0.018, 0.25, 0.78],
          violet: [0.5, 0.07, 0.78],
          amber: [0.78, 0.36, 0.012],
          dark: [0.12, 0.135, 0.14],
        },
        color = palette[plate.color] || [palette.red, palette.blue][i % 2];
      pressureSurface(
        mesh,
        [0, 0, 0],
        [
          [0, 0],
          [0.285, 0],
          [0.3, 0.009],
          [0.3, 0.052],
          [0.287, 0.065],
          [0, 0.065],
        ],
        color,
        14,
        (i * 7 + 2) % 16,
      );
      append('pressureButton', i, mesh);
    }
    for (let i = 0; i < level.world.lifts.length; i++) {
      const mesh = [],
        lift = { x: 0, z: 0, height: 0 };
      box(mesh, [0, -0.08, 0], [0.95, 0.16, 0.95], [0.12, 0.105, 0.08], 0.025, 12, 2);
      for (let n = 0; n < 4; n++)
        box(
          mesh,
          [(n - 1.5) * 0.21, 0.004, 0],
          [0.2, 0.024, 0.83],
          [0.43 + n * 0.02, 0.27 + n * 0.012, 0.12 + n * 0.008],
          0.008,
          11,
          2,
        );
      for (const dx of [-0.4, 0.4])
        box(mesh, [dx, 0.017, 0], [0.085, 0.04, 0.93], [0.4, 0.285, 0.13], 0.01, 12, 2);
      for (const dz of [-0.4, 0.4])
        box(mesh, [0, 0.017, dz], [0.93, 0.04, 0.085], [0.4, 0.285, 0.13], 0.01, 12, 2);
      for (const dx of [-0.4, 0.4])
        for (const dz of [-0.4, 0.4])
          sphere(mesh, [dx, 0.044, dz], [0.026, 0.014, 0.026], [0.65, 0.49, 0.26], 12);
      for (const sign of [-1, 1]) {
        rod(
          mesh,
          [-0.12, -0.15, sign * 0.471],
          [0.12, -0.15, sign * 0.471],
          0.035,
          [0.5, 0.35, 0.16],
          12,
        );
      }
      append('lift', i, mesh);
    }
    for (let i = 0; i < level.world.spikes.length; i++) {
      const mesh = [],
        trap = level.world.spikes[i],
        color = spikeTint(trap);
      for (const dx of [-0.21, 0.21]) for (const dz of [-0.21, 0.21]) spike(mesh, dx, 0, dz, color);
      append('spikes', i, mesh);
    }
    // Transparent shells occupy the tail of the same upload buffer. Opaque props
    // stop before that range; shells join the depth-sorted glass/jelly layers.
    crystals.forEach((mesh, i) => append('droneCrystal', i, mesh));
    this.propPieces = pieces;
    this.propData = new Float32Array(pieces.reduce((sum, p) => sum + p.data.length, 0));
    if (this.propData.byteLength > this.propBuffer.size) {
      this.propBuffer.destroy();
      this.propBuffer = this.device.createBuffer({
        size: this.propData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
    }
  }
  props(level, players, angle, time, dt = 1 / 60) {
    const key = [
      players.length,
      (level.crates || []).length,
      level.world.lifts.length,
      level.world.spikes.length,
      level.plates.length,
      level.world.archers.length,
      level.world.pickups.length,
      (level.world.drones || []).map((d) => d.color).join('.'),
    ].join(',');
    if (this.propGeometryKey !== key) {
      this.buildProps(level, players);
      this.propGeometryKey = key;
    }
    this.platePress ??= [];
    const plateBodies = [...players, ...(level.crates || [])],
      pressFade = level.reducedMotion ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 14);
    level.plates.forEach((plate, i) => {
      const target = level.world.active(i, plateBodies) ? 1 : 0;
      this.platePress[i] =
        (this.platePress[i] || 0) + (target - (this.platePress[i] || 0)) * pressFade;
    });
    const data = this.propData,
      c = Math.cos(angle),
      s = Math.sin(angle),
      rx = (c - s) * 0.7071,
      rz = -(s + c) * 0.7071,
      fx = (c + s) * 0.7071,
      fz = (c - s) * 0.7071;
    let cursor = 0,
      opaqueCount = null;
    this.crystalPieces = [];
    // Reuse immutable local meshes and one upload array. No per-frame tessellation
    // or large JS number arrays for rigid decorations.
    for (const piece of this.propPieces) {
      const i = piece.index,
        source = piece.data;
      let x = 0,
        y = 0,
        z = 0,
        rotate = false,
        matrix = null,
        stringPull = 0,
        swing = 0;
      if (piece.kind === 'jelly' || piece.kind === 'bubble') {
        const p = players[i];
        if (p.state === 'dead') continue;
        const core = level.soft.get(p).core;
        x = core[0];
        y = core[1];
        z = core[2];
        rotate = piece.kind === 'jelly';
        if (piece.kind === 'bubble')
          y +=
            ((piece.bubble * BUBBLE_SPACING + time * 0.03) % 0.51) - piece.bubble * BUBBLE_SPACING;
      } else if (piece.kind === 'drone' || piece.kind === 'droneCrystal') {
        [x, y, z] = level.world.droneOrigin(level.world.drones[i]);
        const spin = level.reducedMotion ? 0 : time * 0.35;
        matrix = [Math.cos(spin), 0, Math.sin(spin), 0, 1, 0, -Math.sin(spin), 0, Math.cos(spin)];
        if (piece.kind === 'droneCrystal') {
          opaqueCount ??= cursor / 12;
          this.crystalPieces.push({
            kind: 'crystal',
            center: [x, y, z],
            first: cursor / 12,
            count: source.length / 12,
          });
        }
      } else if (piece.kind === 'crate') {
        const p = level.crates[i];
        if (p.state === 'dead') continue;
        x = p.x;
        y = (p.y || 0) + 0.42;
        z = p.z;
        matrix = level.soft.get(p).r;
      } else if (
        piece.kind === 'shield' ||
        piece.kind === 'shieldCrack' ||
        piece.kind === 'sword'
      ) {
        const p = players[i],
          sword = piece.kind === 'sword';
        if (!(sword ? p.sword : p.shield) || p.state === 'dead') continue;
        if (piece.kind === 'shieldCrack' && (p.shieldHP ?? 3) > 3 - piece.damage) continue;
        const core = level.soft.get(p).core,
          fx = p.facingX || 0,
          fz = p.facingZ ?? 1;
        x = core[0] + fx * 0.55;
        y = core[1];
        z = core[2] + fz * 0.55;
        matrix = [fz, 0, fx, 0, 1, 0, -fx, 0, fz];
        if (sword && p.attackTime > 0 && !level.reducedMotion)
          swing = Math.sin((1 - p.attackTime / 0.32) * Math.PI) * 1.15;
      } else if (piece.kind === 'pickup') {
        const p = level.world.pickups[i];
        if (p.destroyed || (p.holder !== null && p.holder !== undefined)) continue;
        x = p.x;
        y =
          (p.y ?? level.world.heightAt(p.x, p.z) ?? 0) +
          0.065 +
          (level.reducedMotion ? 0 : Math.sin(time * 2) * 0.012);
        z = p.z;
        matrix = [1, 0, 0, 0, 0, 1, 0, -1, 0];
      } else if (piece.kind === 'arrow') {
        const p = level.world.arrows[i];
        if (!p) continue;
        x = p.x;
        y = p.y;
        z = p.z;
        matrix = [p.dz, 0, p.dx, 0, 1, 0, -p.dx, 0, p.dz];
      } else if (piece.kind.startsWith('archer') || piece.kind === 'nockedArrow') {
        const a = level.world.archers[i],
          length = Math.hypot(a.dx || 0, a.dz ?? 1) || 1,
          fx = (a.dx || 0) / length,
          fz = (a.dz ?? 1) / length;
        if (a.state === 'dead') continue;
        x = a.x;
        y = a.y ?? level.world.heightAt(a.x, a.z) ?? 0;
        z = a.z;
        matrix = [fz, 0, fx, 0, 1, 0, -fx, 0, fz];
        const pull = Math.max(0, 1 - (a.cooldown ?? a.firstShot ?? 1.6) / 0.65) * 0.22;
        if (piece.kind === 'archerString') stringPull = pull;
        if (piece.kind === 'nockedArrow') {
          if ((a.cooldown ?? 1.6) > 0.85) continue;
          x += fx * (0.21 - pull) - fz * 0.09;
          y += 0.57;
          z += fz * (0.21 - pull) + fx * 0.09;
        }
      } else if (piece.kind === 'pressureButton') {
        const p = level.plates[i];
        x = p.x;
        y = (p.y ?? level.world.heightAt(p.x, p.z) ?? 0) + 0.02 - this.platePress[i] * 0.065;
        z = p.z;
      } else if (piece.kind === 'lift') {
        const lift = level.world.lifts[i];
        x = lift.x;
        y = lift.height;
        z = lift.z;
      } else {
        const trap = level.world.spikes[i],
          state = level.world.spikeState(trap);
        if (state.extension <= 0) continue;
        const f = level.world.spikeFrame(trap);
        [x, y, z] = f.origin.map((p, k) => p + f.n[k] * (0.015 - 0.24 * (1 - state.extension)));
        matrix = [0, 1, 2].flatMap((k) => [f.u[k], f.n[k], f.v[k]]);
      }
      data.set(source, cursor);
      if (swing) {
        const c = Math.cos(swing),
          s = Math.sin(swing);
        for (let n = 0; n < source.length; n += 12)
          for (const offset of [0, 3]) {
            const k = cursor + n + offset,
              a = data[k],
              b = data[k + 1] + (offset ? 0 : 0.13);
            data[k] = a * c - b * s;
            data[k + 1] = a * s + b * c - (offset ? 0 : 0.13);
          }
      }
      if (matrix) {
        for (let n = 0; n < source.length; n += 12) {
          const k = cursor + n,
            px = data[k],
            py = data[k + 1],
            localZ = data[k + 2] - stringPull * Math.max(0, 1 - Math.abs(py - 0.57) / 0.38),
            nx = data[k + 3],
            ny = data[k + 4],
            nz = data[k + 5];
          for (let axis = 0; axis < 3; axis++) {
            const a = axis * 3;
            data[k + axis] =
              (axis === 0 ? x : axis === 1 ? y : z) +
              matrix[a] * px +
              matrix[a + 1] * py +
              matrix[a + 2] * localZ;
            data[k + 3 + axis] = matrix[a] * nx + matrix[a + 1] * ny + matrix[a + 2] * nz;
          }
        }
      } else if (rotate) {
        for (let n = 0; n < source.length; n += 12) {
          const k = cursor + n;
          data[k] = x + rx * source[n] + fx * source[n + 2];
          data[k + 1] = y + source[n + 1];
          data[k + 2] = z + rz * source[n] + fz * source[n + 2];
          data[k + 3] = rx * source[n + 3] + fx * source[n + 5];
          data[k + 5] = rz * source[n + 3] + fz * source[n + 5];
        }
      } else {
        for (let n = 0; n < source.length; n += 12) {
          const k = cursor + n;
          data[k] = x + source[n];
          data[k + 1] = y + source[n + 1];
          data[k + 2] = z + source[n + 2];
        }
      }
      cursor += source.length;
    }
    const dynamicCount = opaqueCount ?? cursor / 12;
    this.device.queue.writeBuffer(this.propBuffer, 0, data.buffer, 0, cursor * 4);
    const decorationKey = [
      level.goals.length,
      level.plates.length,
      level.world.spikes.length,
      level.world.portals.length,
      level.world.conveyors.length,
      JSON.stringify(level.world.torches || []),
    ].join(',');
    if (this.decorationKey !== decorationKey) {
      const mesh = [];
      level.goals.forEach((g, i) => {
        if (!g) return;
        const y = g.y ?? level.world.heightAt(g.x, g.z) ?? 0,
          color = [
            [0.45, 1, 0.08],
            [0.035, 0.17, 1],
            [1, 0.055, 0.025],
            [0.68, 0.12, 1],
            [1, 0.65, 0.025],
          ][g.slot ?? i],
          base = mesh.length;
        box(mesh, [g.x, y + 0.023, g.z], [0.86, 0.045, 0.86], [0.065, 0.08, 0.095], 0.025, 10);
        for (let n = base; n < mesh.length; n += 12) mesh[n + 10] = i;
        const trim = mesh.length;
        for (let k = 0; k < 4; k++) {
          const x = k < 2 ? g.x + (k ? 1 : -1) * 0.39 : g.x,
            z = k >= 2 ? g.z + (k === 2 ? 1 : -1) * 0.39 : g.z;
          box(
            mesh,
            [x, y + 0.05, z],
            k < 2 ? [0.026, 0.012, 0.8] : [0.8, 0.012, 0.026],
            color,
            0.005,
            10,
          );
        }
        goalRune(mesh, [g.x, y + 0.053, g.z], g.slot ?? i, color);
        for (let n = trim; n < mesh.length; n += 12) {
          mesh[n + 10] = i;
          mesh[n + 11] = 1;
        }
      });
      level.plates.forEach((p) => {
        const y = p.y ?? level.world.heightAt(p.x, p.z) ?? 0;
        pressureSurface(
          mesh,
          [p.x, y, p.z],
          [
            [0.293, 0.003],
            [0.342, 0.003],
            [0.346, 0.014],
            [0.334, 0.038],
            [0.304, 0.038],
            [0.293, 0.024],
            [0.293, 0.003],
          ],
          [0.09, 0.095, 0.093],
          12,
        );
        pressureSurface(
          mesh,
          [p.x, y + 0.004, p.z],
          [
            [0, 0],
            [0.294, 0],
            [0.294, 0.012],
            [0, 0.012],
          ],
          [0.027, 0.03, 0.029],
          13,
        );
      });
      for (const torch of level.world.torches || []) {
        const from = mesh.length,
          f = Levels.torchFrame(torch),
          iron = [0.085, 0.1, 0.105],
          bronze = [0.4, 0.255, 0.1];
        box(mesh, [0, -0.05, 0.025], [0.18, 0.44, 0.065], iron, 0.02, 12, 2);
        for (const y of [-0.21, 0.11])
          sphere(mesh, [0, y, 0.064], [0.026, 0.026, 0.018], bronze, 12);
        rod(mesh, [0, -0.2, 0.065], [0, -0.13, 0.23], 0.035, iron, 12);
        rod(mesh, [0, -0.23, 0.15], [0, 0.1, 0.25], 0.042, [0.22, 0.115, 0.035], 11);
        for (const y of [-0.12, 0.04])
          box(mesh, [0, y, 0.21 + (y + 0.12) * 0.3], [0.11, 0.035, 0.11], bronze, 0.007, 12, 2);
        pressureSurface(
          mesh,
          [0, 0.08, 0.25],
          [
            [0, 0],
            [0.055, 0],
            [0.11, 0.12],
            [0.11, 0.145],
            [0.08, 0.145],
            [0.04, 0.06],
            [0, 0.06],
          ],
          iron,
          12,
          0,
          12,
        );
        // Glowing coals fill the bowl; the flame itself is an animated billboard.
        sphere(mesh, [0, 0.2, 0.25], [0.082, 0.034, 0.082], [1.25, 0.36, 0.05], 4);
        for (let k = from; k < mesh.length; k += 12)
          for (const off of [0, 3]) {
            const u = mesh[k + off],
              y = mesh[k + off + 1],
              n = mesh[k + off + 2];
            for (let axis = 0; axis < 3; axis++)
              mesh[k + off + axis] =
                (off ? 0 : f.origin[axis]) + f.u[axis] * u + (axis === 1 ? y : 0) + f.n[axis] * n;
          }
      }
      for (const trap of level.world.spikes) {
        const from = mesh.length,
          f = level.world.spikeFrame(trap);
        for (const dx of [-0.21, 0.21])
          for (const dz of [-0.21, 0.21]) spikeSocket(mesh, dx, dz, spikeTint(trap));
        for (let k = from; k < mesh.length; k += 12)
          for (const off of [0, 3]) {
            const a = mesh[k + off],
              b = mesh[k + off + 1],
              c = mesh[k + off + 2];
            for (let axis = 0; axis < 3; axis++)
              mesh[k + off + axis] =
                (off ? 0 : f.origin[axis]) + f.u[axis] * a + f.n[axis] * b + f.v[axis] * c;
          }
      }
      for (const belt of level.world.conveyors) {
        const from = mesh.length,
          y = belt.y ?? level.world.heightAt(belt.x, belt.z) ?? 0,
          dx = belt.dx || 0,
          dz = belt.dz ?? 1,
          code = dx > 0 ? 1 : dx < 0 ? 3 : dz < 0 ? 2 : 0;
        box(mesh, [0, 0.005, 0], [0.78, 0.018, 1], [0.18, 0.23, 0.18], 0.004, 16, 2);
        for (let k = from; k < mesh.length; k += 12) {
          mesh[k + 10] = code;
          mesh[k + 11] = belt.speed ?? 0.85;
        }
        for (const side of [-1, 1]) {
          box(mesh, [side * 0.435, 0.019, 0], [0.065, 0.045, 1], [0.22, 0.25, 0.23], 0.01, 12, 2);
          for (const z of [-0.31, 0.31])
            box(
              mesh,
              [side * 0.435, 0.046, z],
              [0.026, 0.012, 0.027],
              [0.5, 0.43, 0.29],
              0.004,
              12,
              1,
            );
          if (!level.world.conveyorJoined(belt, side))
            box(
              mesh,
              [0, 0.012, side * 0.46],
              [0.8, 0.055, 0.075],
              [0.24, 0.26, 0.23],
              0.018,
              12,
              2,
            );
        }
        for (let k = from; k < mesh.length; k += 12)
          for (const offset of [0, 3]) {
            const x = mesh[k + offset],
              py = mesh[k + offset + 1],
              z = mesh[k + offset + 2];
            mesh[k + offset] = (offset ? 0 : belt.x) + dz * x + dx * z;
            mesh[k + offset + 1] = (offset ? 0 : y) + py;
            mesh[k + offset + 2] = (offset ? 0 : belt.z) - dx * x + dz * z;
          }
      }
      level.world.portals.forEach((portal, i) => {
        const y = portal.y ?? level.world.heightAt(portal.x, portal.z) ?? 0,
          color = Levels.portalColor(portal.color).glow;
        box(mesh, [portal.x, y + 0.012, portal.z], [0.75, 0.024, 0.75], [0.08, 0.075, 0.095], 0.05);
        const rim = mesh.length;
        portalRing(mesh, portal.x, y + 0.053, portal.z, color);
        for (let n = rim; n < mesh.length; n += 12) {
          mesh[n + 9] = 8;
          mesh[n + 10] = i;
          mesh[n + 11] = 0;
        }
        const from = mesh.length;
        sphere(mesh, [portal.x, y + 0.04, portal.z], [0.267, 0.012, 0.267], color, 5);
        for (let n = from; n < mesh.length; n += 12) {
          mesh[n + 10] = i;
          mesh[n + 11] = 0;
        }
      });
      const decorations = new Float32Array(mesh);
      if (decorations.byteLength > this.decorationBuffer.size) {
        this.decorationBuffer.destroy();
        this.decorationBuffer = this.device.createBuffer({
          size: Math.ceil(decorations.byteLength / 65536) * 65536,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      this.decorationCount = mesh.length / 12;
      this.device.queue.writeBuffer(this.decorationBuffer, 0, decorations);
      this.decorationKey = decorationKey;
    }
    return dynamicCount;
  }
  effects(system, view) {
    if (!system || (!system.particles.length && !system.rings.length && !system.bones?.length))
      return 0;
    const mesh = [],
      items = [...system.particles, ...system.rings, ...(system.bones || [])].sort(
        (a, b) => dot(a.position || a.center, view) - dot(b.position || b.center, view),
      );
    for (const item of items) {
      const t = item.age / item.life,
        fade = item.kind === 'bone' ? 1 : 1 - t * t * (3 - 2 * t),
        from = mesh.length;
      if (item.kind === 'spark') {
        rod(
          mesh,
          item.position.map((v, k) => v - item.velocity[k] * 0.035),
          item.position,
          item.size * (0.5 + fade * 0.5),
          item.color,
          7,
        );
      } else if (item.position) {
        const a = item.phase + Math.min(item.age, 0.8) * 8,
          c = Math.cos(a),
          s = Math.sin(a),
          size = item.size * (0.65 + 0.35 * fade),
          jelly = item.kind === 'jelly',
          bone = item.kind === 'bone',
          wood = item.kind === 'wood',
          wobble = 1 + Math.sin(a * 1.8) * 0.22;
        sphere(
          mesh,
          item.position,
          bone
            ? item.skull
              ? [size, size * 1.1, size]
              : [size * 0.4, size * 1.6, size * 0.4]
            : wood
              ? [size * 0.4, size * 1.8, size * 0.3]
              : [size * wobble, size / (wobble * (jelly ? 1.3 : 1)), size],
          item.color,
          bone || wood ? 15 : jelly ? 6 : 7,
          [
            [c, s, 0],
            [-s, c, 0],
            [0, 0, 1],
          ],
        );
        if (bone && item.skull)
          for (const side of [-1, 1])
            sphere(
              mesh,
              [
                item.position[0] + side * size * 0.4,
                item.position[1] + size * 0.12,
                item.position[2] + size * 0.9,
              ],
              [size * 0.27, size * 0.31, size * 0.1],
              [0.02, 0.018, 0.014],
              15,
            );
      } else {
        const [x, y, z] = item.center;
        portalRing(mesh, x, y + 0.075 + t * 0.09, z, item.color);
        // An expanding horizontal shock ring and a brief, translucent volume flash.
        for (let k = from; k < mesh.length; k += 12) {
          mesh[k] = x + (mesh[k] - x) * (1 + t * 2.5);
          mesh[k + 2] = z + (mesh[k + 2] - z) * (1 + t * 2.5);
        }
        const flash = Math.max(0, 1 - t * 3);
        if (flash > 0)
          sphere(mesh, [x, y + 0.36, z], [0.35 * flash, 0.48 * flash, 0.35 * flash], item.color, 7);
      }
      for (let k = from; k < mesh.length; k += 12) {
        mesh[k + 9] =
          item.kind === 'bone' || item.kind === 'wood' ? 15 : item.kind === 'jelly' ? 6 : 7;
        mesh[k + 10] = fade * (item.kind === 'bone' ? 1 : item.position ? 0.85 : 0.45);
        mesh[k + 11] = 0;
      }
    }
    this.device.queue.writeBuffer(this.effectBuffer, 0, new Float32Array(mesh));
    return mesh.length / 12;
  }
  updateRunes(system) {
    const runes = system?.runes || [],
      count = Math.min(32, runes.length),
      data = this.runeData;
    for (let i = 0; i < count; i++) {
      const p = runes[i],
        k = i * 12,
        t = p.age / p.life,
        enter = Math.min(1, p.age / 0.18),
        end = Math.max(0, Math.min(1, (1 - t) / 0.4)),
        opacity = enter * enter * (3 - 2 * enter) * end * end * (3 - 2 * end) * 0.8;
      data[k] = p.position[0];
      data[k + 1] = p.position[1];
      data[k + 2] = p.position[2];
      data[k + 3] = p.size;
      data[k + 4] = p.color[0];
      data[k + 5] = p.color[1];
      data[k + 6] = p.color[2];
      data[k + 7] = opacity;
      data[k + 8] = p.glyph;
      data[k + 9] = Math.sin(p.phase + p.age * 0.9) * 0.12;
      data[k + 10] = data[k + 11] = 0;
    }
    if (count) this.device.queue.writeBuffer(this.runeBuffer, 0, data.buffer, 0, count * 48);
    this.runeCount = count;
  }
  updateBeams(level) {
    const beams = [...(level.world.droneBeams || []), ...(level.effects?.lasers || [])]
      .filter((b) => Math.hypot(...b.to.map((v, k) => v - b.from[k])) > 0.001)
      .slice(0, 16);
    this.beamCount = beams.length;
    beams.forEach((b, i) => {
      const k = i * 12;
      this.beamData.set(
        [
          ...b.from,
          0,
          ...b.to,
          b.impact ? 1 : 0,
          ...beamColors[b.color],
          b.life ? Math.max(0, 1 - b.age / b.life) : 1,
        ],
        k,
      );
    });
    if (beams.length)
      this.device.queue.writeBuffer(this.beamBuffer, 0, this.beamData.buffer, 0, beams.length * 48);
  }
  buildDust(world) {
    const blocks = world.blocks || [],
      occupied = new Set(blocks.map((b) => `${b.x},${b.y},${b.z}`)),
      surfaces = blocks.length
        ? blocks.filter((b) => !occupied.has(`${b.x},${b.y + 1},${b.z}`))
        : [...world.floor].map((key) => {
            const [x, z] = key.split(',').map(Number);
            return { x, y: world.heightAt(x, z) ?? 0, z };
          });
    this.dustCount = surfaces.length ? 64 : 0;
    let seed = 41;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < this.dustCount; i++) {
      const surface = surfaces[Math.floor(random() * surfaces.length)];
      this.dustData.set(
        [
          surface.x + (random() - 0.5) * 0.8,
          surface.y + 0.35 + random() * 2.2,
          surface.z + (random() - 0.5) * 0.8,
          random() * Math.PI * 2,
        ],
        i * 4,
      );
    }
    if (this.dustCount) this.device.queue.writeBuffer(this.dustBuffer, 0, this.dustData);
  }
  drawEffects(pass, level, effectCount) {
    pass.setBindGroup(0, this.sceneGroup);
    pass.setBindGroup(1, this.skinGroups[0]);
    const visibleDust = Math.round(this.dustCount * this.dustDensity);
    if (this.dust && visibleDust) {
      pass.setPipeline(this.dustPipeline);
      pass.setVertexBuffer(0, this.dustBuffer);
      pass.draw(6, visibleDust);
    }
    if (level.assembly) return;
    if (effectCount) {
      pass.setPipeline(this.effectPipeline);
      pass.setVertexBuffer(0, this.effectBuffer);
      pass.draw(effectCount);
    }
    if (this.runeCount) {
      pass.setPipeline(this.runePipeline);
      pass.setVertexBuffer(0, this.portalHaloBuffer);
      pass.setVertexBuffer(1, this.runeBuffer);
      pass.draw(6, this.runeCount);
    }
    if (this.beamCount) {
      pass.setPipeline(this.beamPipeline);
      pass.setVertexBuffer(0, this.beamBuffer);
      pass.draw(12, this.beamCount);
    }
    const count = Math.min(PORTAL_LIMIT, level.world.portals.length);
    if (count) {
      pass.setPipeline(this.portalHaloPipeline);
      pass.setVertexBuffer(0, this.portalHaloBuffer);
      pass.draw(6, count);
      pass.setPipeline(this.portalRingPipeline);
      pass.setVertexBuffer(0, this.portalRingBuffer);
      pass.draw(this.portalRingCount, count * 3);
    }
    if (level.goals.length) {
      pass.setVertexBuffer(0, this.portalHaloBuffer);
      pass.setPipeline(this.goalGlowPipeline);
      pass.draw(6, Math.min(5, level.goals.length));
      if (level.finishProgress > 0) {
        pass.setPipeline(this.goalSealPipeline);
        pass.draw(6, Math.min(5, level.goals.length));
      }
      if (this.goalWinGlow > 0.001) {
        pass.setPipeline(this.goalBeamPipeline);
        pass.draw(6, Math.min(5, level.goals.length));
      }
    }
  }
  updatePortalVisuals(level, players, dt) {
    this.portalVisuals ??= new Map();
    const keys = new Set(),
      elapsed = Math.max(0, Math.min(0.1, dt)),
      blend = 1 - Math.exp(-8 * elapsed),
      chargeBlend = 1 - Math.exp(-12 * elapsed),
      bodies = level.bodies || [...players, ...(level.crates || [])];
    this.portalStates = level.world.portals.slice(0, PORTAL_LIMIT).map((p, i) => {
      const key = `${p.color}:${p.x}:${p.y ?? level.world.heightAt(p.x, p.z) ?? 0}:${p.z}`,
        active = level.world.portalInactive(p, bodies) ? 0 : 1,
        charge = active ? level.world.portalCharge(p, bodies, true) : 0;
      keys.add(key);
      let state = this.portalVisuals.get(key);
      if (!state) {
        state = { active, charge, phase: 0, offset: i * 0.23 };
        this.portalVisuals.set(key, state);
      }
      if (level.reducedMotion) {
        state.active = active;
        state.charge = charge;
      } else {
        // Integrate the eased speed: changing modes never replaces time*speed and
        // therefore cannot jump the vortex phase, including halfway reversals.
        const activeTime = active * elapsed + ((state.active - active) * blend) / 8;
        state.phase = (state.phase + 0.35 * elapsed + 2.65 * activeTime) % (Math.PI * 2);
        state.active += (active - state.active) * blend;
        state.charge += (charge - state.charge) * chargeBlend;
      }
      return state;
    });
    for (const key of this.portalVisuals.keys()) if (!keys.has(key)) this.portalVisuals.delete(key);
  }
  render(level, players, camera, angle, time, scale, dt = 1 / 60) {
    if (!this.ready) return;
    this.resize();
    const d = this.device,
      w = this.canvas.width,
      h = this.canvas.height;
    const rect = this.canvas.getBoundingClientRect(),
      frame = (this.cameraState = cameraFrame(camera, angle, rect.width, rect.height, scale)),
      { vp, view, eye } = frame;
    const extent = level.definition?.size ?? 12,
      lightVP = viewMatrix(
        [(extent - 1) * 0.5, 0, (extent - 1) * 0.5],
        normalize([-0.45, 1, 0.35]),
        Math.max(18, extent + 4),
        Math.max(18, extent + 4),
      );
    if (this.bridgeKey === undefined) {
      this.buildScene(level);
      this.bridgeKey = 'static';
    }
    const uniforms = new Float32Array(SCENE_FLOATS);
    uniforms.set(vp);
    uniforms.set(lightVP, 16);
    uniforms.set([...eye, frame.perspective ? 1 : 0], 32);
    uniforms.set([-2, 12, 9, 1], 36);
    uniforms[FINISH_OFFSET] = Math.max(0, Math.min(1, level.finishProgress || 0));
    uniforms[FINISH_OFFSET + 1] = this.fogBase ?? 0;
    uniforms[FINISH_OFFSET + 2] = level.assembly?.progress ?? 1;
    (level.world.torches || [])
      .slice(0, 8)
      .forEach((p, i) => uniforms.set([...Levels.torchFrame(p).light, 1], TORCHES_OFFSET + i * 4));
    players.forEach((p, i) =>
      uniforms.set(
        [
          p.x,
          (p.y || 0) + 0.42,
          p.z,
          level.assembly || p.state === 'dead'
            ? 0
            : 4 + (level.world.heightAt(p.x, p.z, (p.y || 0) + 0.2, p) || 0),
        ],
        i === 4 ? BODY4_OFFSET : i === 3 ? BODY3_OFFSET : 40 + i * 4,
      ),
    );
    uniforms.set([w, h, time, this.dustSpeed], 52);
    this.updatePortalVisuals(level, players, dt);
    level.world.portals.slice(0, PORTAL_LIMIT).forEach((p, i) => {
      const state = this.portalStates[i],
        offset = 56 + i * PORTAL_FLOATS;
      uniforms.set([p.x, p.y ?? level.world.heightAt(p.x, p.z) ?? 0, p.z, state.charge], offset);
      uniforms.set([...Levels.portalColor(p.color).glow, state.offset], offset + 4);
      uniforms.set([state.active, state.phase, 0, 0], offset + 8);
    });
    this.goalGlowStrength ??= [];
    this.goalWinGlow ??= 0;
    const fade = level.reducedMotion ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 8),
      celebrate = level.reducedMotion ? 1 : 1 - Math.exp(-Math.min(dt, 0.1) * 4);
    this.goalWinGlow += ((level.won ? 1 : 0) - this.goalWinGlow) * celebrate;
    level.goals.slice(0, 5).forEach((g, i) => {
      if (!g) return;
      const player = players.find((p, j) => (p.slot ?? j) === (g.slot ?? i)),
        target = level.world.goalCharge(g, player);
      this.goalGlowStrength[i] =
        (this.goalGlowStrength[i] || 0) + (target - (this.goalGlowStrength[i] || 0)) * fade;
      uniforms.set(
        [g.x, g.y ?? level.world.heightAt(g.x, g.z) ?? 0, g.z, this.goalGlowStrength[i]],
        GOALS_OFFSET + i * 8,
      );
      uniforms.set(
        [
          ...[
            [0.45, 1, 0.08],
            [0.035, 0.17, 1],
            [1, 0.055, 0.025],
            [0.68, 0.12, 1],
            [1, 0.65, 0.025],
          ][g.slot ?? i],
          this.goalWinGlow,
        ],
        GOALS_OFFSET + 4 + i * 8,
      );
      uniforms[GOAL_SLOTS_OFFSET + i] = player ? (g.slot ?? i) : -1;
    });
    players.forEach((p, i) => (uniforms[BODY_SLOTS_OFFSET + i] = p.slot ?? i));
    d.queue.writeBuffer(this.uniform, 0, uniforms);
    this.filmData.set([
      time,
      this.grain ? 0.045 * this.grainStrength : 0,
      1.35 * this.grainSize,
      0,
    ]);
    d.queue.writeBuffer(this.filmUniform, 0, this.filmData);
    const nodes = new Float32Array(320 * 4);
    for (let i = 0; i < 5; i++) nodes[i * 256 + 3] = -1;
    players.forEach((p, i) =>
      level.soft
        .get(p)
        .positions.forEach((q, j) =>
          nodes.set([q[0], p.state === 'dead' ? -100 : q[1], q[2], p.slot ?? i], (i * 64 + j) * 4),
        ),
    );
    d.queue.writeBuffer(this.nodes, 0, nodes);
    const assembling = !!level.assembly,
      bridgeCount = assembling ? 0 : this.bridges(level),
      propCount = assembling ? 0 : this.props(level, players, angle, time, dt),
      effectCount = this.effects(level.effects, view);
    this.updateRunes(level.effects);
    this.updateBeams(level);
    const encoder = d.createCommandEncoder();
    const computePass = encoder.beginComputePass();
    computePass.setPipeline(this.compute);
    computePass.setBindGroup(0, this.computeGroup);
    computePass.dispatchWorkgroups(Math.ceil((players.length * 1350) / 64));
    computePass.end();
    const shadowPass = encoder.beginRenderPass({
      colorAttachments: [],
      depthStencilAttachment: {
        view: this.shadowTexture.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    // Only masonry casts shadows: tiny decor shadows are invisible, and half-buried pebbles
    // made this depth-only pass about 6 ms slower on an integrated Radeon.
    shadowPass.setPipeline(this.assemblyShadow);
    shadowPass.setBindGroup(0, this.shadowGroup);
    shadowPass.setVertexBuffer(0, this.staticBuffer);
    shadowPass.setVertexBuffer(1, this.assemblyBuffer);
    shadowPass.draw(this.stoneCount);
    if (bridgeCount) {
      shadowPass.setPipeline(this.shadow);
      shadowPass.setVertexBuffer(0, this.bridgeBuffer);
      shadowPass.draw(bridgeCount);
    }
    shadowPass.end();
    const opaque = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.msaa.createView(),
          resolveTarget: this.hdr.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthClearValue: 1,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });
    opaque.setBindGroup(0, this.sceneGroup);
    opaque.setBindGroup(1, this.skinGroups[0]);
    opaque.setVertexBuffer(0, this.staticBuffer);
    if (this.stoneCount) {
      opaque.setPipeline(this.stonePipeline);
      opaque.setVertexBuffer(1, this.assemblyBuffer);
      opaque.draw(this.stoneCount);
    }
    opaque.setPipeline(this.opaque);
    if (!assembling && this.staticCount > this.stoneCount)
      opaque.draw(this.staticCount - this.stoneCount, 1, this.stoneCount);
    if (bridgeCount) {
      opaque.setVertexBuffer(0, this.bridgeBuffer);
      opaque.draw(bridgeCount);
    }
    opaque.setVertexBuffer(0, this.propBuffer);
    opaque.draw(propCount);
    opaque.setVertexBuffer(0, this.decorationBuffer);
    if (!assembling) opaque.draw(this.decorationCount);
    const torchCount = assembling ? 0 : Math.min(8, (level.world.torches || []).length);
    if (torchCount) {
      opaque.setPipeline(this.flamePipeline);
      opaque.setVertexBuffer(0, this.portalHaloBuffer);
      opaque.draw(6, torchCount);
    }
    opaque.end();
    const order = players.flatMap((p, i) =>
      assembling || p.state === 'dead'
        ? []
        : [{ kind: 'jelly', i, center: [p.x, (p.y || 0) + 0.42, p.z] }],
    );
    if (!assembling) order.push(...this.crystalPieces);
    for (const face of this.phaseFaces)
      if (
        dot(
          face.normal,
          eye.map((v, k) => v - face.center[k]),
        ) > 0
      )
        order.push(face);
    order.sort((a, b) => dot(a.center, view) - dot(b.center, view));
    const layerPass = () =>
      encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.msaa.createView(),
            resolveTarget: this.hdr.createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.depth.createView(),
          depthLoadOp: 'load',
          depthStoreOp: 'store',
        },
      });
    for (let layer = 0; layer < order.length; layer++) {
      if (order[layer].kind === 'crystal') {
        const glass = layerPass(),
          crystal = order[layer];
        glass.setBindGroup(0, this.sceneGroup);
        glass.setBindGroup(1, this.skinGroups[0]);
        glass.setVertexBuffer(0, this.propBuffer);
        glass.setPipeline(this.crystalBackPipeline);
        glass.draw(crystal.count, 1, crystal.first);
        glass.setPipeline(this.crystalPipeline);
        glass.draw(crystal.count, 1, crystal.first);
        if (layer === order.length - 1) this.drawEffects(glass, level, effectCount);
        glass.end();
        continue;
      }
      if (order[layer].kind === 'phase') {
        const glass = layerPass();
        glass.setPipeline(this.phasePipeline);
        glass.setBindGroup(0, this.sceneGroup);
        glass.setBindGroup(1, this.skinGroups[0]);
        glass.setVertexBuffer(0, this.phaseBuffer);
        glass.setVertexBuffer(1, this.phaseAssemblyBuffer);
        do {
          const face = order[layer];
          glass.draw(face.count, 1, face.first);
          layer++;
        } while (layer < order.length && order[layer].kind === 'phase');
        if (layer === order.length) this.drawEffects(glass, level, effectCount);
        layer--;
        glass.end();
        continue;
      }
      const i = order[layer].i;
      const backPass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.exits[i].createView(),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.exitDepth.createView(),
          depthClearValue: 0,
          depthLoadOp: 'clear',
          depthStoreOp: 'store',
        },
      });
      backPass.setPipeline(this.back);
      backPass.setBindGroup(0, this.sceneGroup);
      backPass.setBindGroup(1, this.skinGroups[(i + 1) % 5]);
      backPass.setIndexBuffer(this.indexBuffer, 'uint32');
      backPass.drawIndexed(this.indexCount, 1, 0, 0, i);
      backPass.end();
      encoder.copyTextureToTexture({ texture: this.hdr }, { texture: this.background }, [w, h]);
      const skin = layerPass();
      skin.setPipeline(this.skin);
      skin.setBindGroup(0, this.sceneGroup);
      skin.setBindGroup(1, this.skinGroups[i]);
      skin.setIndexBuffer(this.indexBuffer, 'uint32');
      skin.drawIndexed(this.indexCount, 1, 0, 0, i);
      if (layer === order.length - 1) this.drawEffects(skin, level, effectCount);
      skin.end();
    }
    if (
      !order.length &&
      (effectCount ||
        this.beamCount ||
        (this.dust && this.dustCount) ||
        level.world.portals.length ||
        level.goals.length)
    ) {
      const effects = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.msaa.createView(),
            resolveTarget: this.hdr.createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
        depthStencilAttachment: {
          view: this.depth.createView(),
          depthLoadOp: 'load',
          depthStoreOp: 'store',
        },
      });
      this.drawEffects(effects, level, effectCount);
      effects.end();
    }
    if (this.mesh) {
      const lattice = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.msaa.createView(),
            resolveTarget: this.hdr.createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
      });
      lattice.setPipeline(this.latticePipeline);
      lattice.setBindGroup(0, this.latticeGroup);
      lattice.draw(this.edgeCount, players.length);
      lattice.end();
    }
    if (this.colliders) {
      const lines = colliderLines(level.world.debugBoxes());
      if (lines.byteLength > this.colliderBuffer.size) {
        this.colliderBuffer.destroy();
        this.colliderBuffer = d.createBuffer({
          size: Math.ceil(lines.byteLength / 65536) * 65536,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      d.queue.writeBuffer(this.colliderBuffer, 0, lines);
      const debug = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.msaa.createView(),
            resolveTarget: this.hdr.createView(),
            loadOp: 'load',
            storeOp: 'store',
          },
        ],
      });
      debug.setPipeline(this.colliderPipeline);
      debug.setBindGroup(0, this.colliderGroup);
      debug.setVertexBuffer(0, this.colliderBuffer);
      debug.draw(lines.length / 6);
      debug.end();
    }
    this.encodeBloom(encoder);
    const finish = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    finish.setPipeline(this.post);
    finish.setBindGroup(0, this.postGroup);
    finish.draw(3);
    finish.end();
    d.queue.submit([encoder.finish()]);
    this.frames++;
  }
}
export { Renderer, viewMatrix, cameraFrame, projectPoint, surfaceBindings };
