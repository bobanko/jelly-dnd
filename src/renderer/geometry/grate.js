import { grateFrame, GRATE_HALF_THICKNESS } from '../../world/grates.js';
import { box } from '../mesh.js';

// Forged iron only: open sides let adjacent sections join without stone posts.
export function grate(mesh, p) {
  // The barrel hoop material supplies the dark metal, patina and painted edge wear.
  const iron = [0.86, 0.84, 0.82],
    edge = [0.95, 0.92, 0.88],
    frame = grateFrame(p),
    part = (u, y, depth, width, height, thickness, color, bevel = 0.012) => {
      box(
        mesh,
        frame.center.map(
          (c, k) => c + u * frame.u[k] + (y - 0.5) * frame.v[k] + depth * frame.n[k],
        ),
        frame.u.map(
          (v, k) =>
            Math.abs(v) * width + Math.abs(frame.v[k]) * height + Math.abs(frame.n[k]) * thickness,
        ),
        color,
        bevel,
        31,
        2,
      );
    };
  for (const y of [0.055, 0.945]) {
    part(0, y, 0, 1, 0.11, 0.18, iron);
    // Narrow worn lips catch the dungeon light without making the bars bright.
    for (const depth of [-(GRATE_HALF_THICKNESS - 0.009), GRATE_HALF_THICKNESS - 0.009]) {
      part(0, y + 0.035, depth, 0.98, 0.012, 0.008, edge, 0.003);
      for (const u of [-0.39, 0.39]) part(u, y, depth, 0.045, 0.045, 0.018, edge, 0.009);
    }
  }
  for (const u of [-0.375, -0.125, 0.125, 0.375]) {
    part(u, 0.5, 0, 0.055, 0.82, 0.065, iron, 0.016);
    for (const y of [0.145, 0.855]) part(u, y, 0, 0.075, 0.06, 0.085, iron);
  }
}
