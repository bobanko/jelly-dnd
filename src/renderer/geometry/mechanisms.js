import { cross, normalize } from '../math.js';
import { box } from '../mesh.js';
export const spikeTints = [
  [0.16, 0.75, 0.09],
  [0.045, 0.24, 0.95],
  [0.95, 0.045, 0.025],
  [0.63, 0.12, 0.88],
  [0.95, 0.6, 0.025],
];
export const phaseTints = [
  [0.08, 0.88, 0.12],
  [0.025, 0.48, 1],
  [1, 0.045, 0.015],
  [0.64, 0.07, 1],
  [1, 0.67, 0.025],
];
export const spikeTint = (trap) =>
  trap.color === undefined ? [0.36, 0.31, 0.27] : spikeTints[trap.color];
// A square socket matching the square spike base; the profile gives its rim a chamfer.
export function spikeSocket(mesh, x, z, tint) {
  const profile = [
      [0.094, 0.002],
      [0.094, 0.018],
      [0.112, 0.034],
      [0.148, 0.034],
      [0.165, 0.017],
      [0.157, 0.003],
    ],
    color = tint.map((c) => c * 0.62 + 0.018),
    segments = 4,
    // Corners on the diagonals keep the sides axis-aligned; profile values are half-widths.
    corner = (side) => Math.PI / 4 + (side / segments) * Math.PI * 2;
  for (let band = 0; band < profile.length - 1; band++) {
    const [r0, y0] = profile[band],
      [r1, y1] = profile[band + 1];
    for (let side = 0; side < segments; side++) {
      const a = corner(side),
        b = corner(side + 1),
        point = (angle, radius, y) => [
          x + Math.cos(angle) * radius * Math.SQRT2,
          y,
          z + Math.sin(angle) * radius * Math.SQRT2,
        ],
        vertices = [point(a, r0, y0), point(a, r1, y1), point(b, r1, y1), point(b, r0, y0)];
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
          (side + (i >= 2 ? 1 : 0)) / segments,
          (band + (i === 1 || i === 2 ? 1 : 0)) / (profile.length - 1),
        );
    }
  }
  const center = [x, 0.001, z],
    hole = [0.006, 0.007, 0.009];
  for (let side = 0; side < segments; side++) {
    const a = corner(side),
      b = corner(side + 1),
      edge = (angle) => [
        x + Math.cos(angle) * 0.096 * Math.SQRT2,
        0.001,
        z + Math.sin(angle) * 0.096 * Math.SQRT2,
      ];
    for (const point of [center, edge(b), edge(a)])
      mesh.push(...point, 0, 1, 0, ...hole, 13, 0.5, 0.5);
  }
}
export function spike(mesh, x, y, z, tint) {
  const corners = (radius, height) => [
      [x - radius, y + height, z - radius],
      [x + radius, y + height, z - radius],
      [x + radius, y + height, z + radius],
      [x - radius, y + height, z + radius],
    ],
    base = corners(0.084, 0),
    shoulder = corners(0.07, 0.032),
    top = [x, y + 0.24, z];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4,
      lower = [base[i], shoulder[i], shoulder[j], base[j]],
      lowerNormal = normalize(
        cross(
          lower[1].map((v, k) => v - lower[0][k]),
          lower[2].map((v, k) => v - lower[0][k]),
        ),
      ),
      p = shoulder[i],
      q = shoulder[j],
      n = normalize(
        cross(
          top.map((v, k) => v - p[k]),
          q.map((v, k) => v - p[k]),
        ),
      ),
      color = tint.map((c) => c * (i % 2 ? 1 : 0.8));
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const v = lower[index],
        u = index === 0 || index === 3 ? 0 : 1,
        height = index === 0 || index === 3 ? 0 : 0.135;
      mesh.push(...v, ...lowerNormal, ...color.map((c) => c * 0.72), 27, u, height);
    }
    for (const [v, u, height] of [
      [p, 0, 0.135],
      [top, 0.5, 1],
      [q, 1, 0.135],
    ])
      mesh.push(...v, ...n, ...color, 27, u, height);
  }
}
export function portalRing(mesh, x, y, z, color) {
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
export function pressureSurface(mesh, center, profile, color, material, tile = 0, segments = 48) {
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
// One straight conveyor tile in local space, moving towards +z. The belt's plates,
// seams and chevrons are drawn by solidFS (material 16); rails, rivets and the end
// rollers are geometry. Rollers close only the ends that do not join another belt.
export function conveyorTile(
  mesh,
  { code, speed, openBack, openFront, railLeft = true, railRight = true },
) {
  const iron = [0.16, 0.14, 0.12],
    bronze = [0.34, 0.25, 0.15],
    from = mesh.length;
  box(mesh, [0, 0.007, 0], [0.76, 0.022, 1], [0.13, 0.12, 0.11], 0.004, 16, 2);
  for (let k = from; k < mesh.length; k += 12) {
    mesh[k + 10] = code;
    mesh[k + 11] = speed;
  }
  for (const side of [-1, 1]) {
    if (!(side < 0 ? railLeft : railRight)) continue;
    box(mesh, [side * 0.425, 0.024, 0], [0.075, 0.05, 1], iron, 0.014, 1, 2);
    box(mesh, [side * 0.425, 0.05, 0], [0.05, 0.008, 1], bronze, 0.003, 1, 1);
    for (const z of [-0.33, 0, 0.33])
      box(mesh, [side * 0.425, 0.055, z], [0.024, 0.012, 0.024], [0.62, 0.48, 0.28], 0.01, 1, 2);
  }
  for (const [end, open] of [
    [-1, openBack],
    [1, openFront],
  ]) {
    if (!open) continue;
    // A rounded roller across the belt end, with bolt heads on both rails.
    box(mesh, [0, 0.032, end * 0.455], [0.8, 0.07, 0.07], iron, 0.034, 1, 4);
    for (const side of [-1, 1])
      if (side < 0 ? railLeft : railRight)
        box(mesh, [side * 0.425, 0.034, end * 0.455], [0.08, 0.08, 0.08], bronze, 0.04, 1, 4);
  }
}
