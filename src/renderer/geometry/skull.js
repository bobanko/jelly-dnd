import { box, sphere } from '../mesh.js';
// One shared skull, built facing +z with a cranium half-width of 0.145 units: a rounded
// vault, brow and cheekbones, a narrower upper jaw and separate mandible, slanted sockets,
// a heart-shaped nasal cavity and two rows of individual teeth. Returns the socket centres
// so callers can light them (the archer's embers).
export function skullGeometry(mesh, { bone, dark, scale = 1 }) {
  const at = (p) => p.map((v) => v * scale),
    size = (v) => v.map((x) => x * scale),
    tilt = (angle) => [
      [Math.cos(angle), Math.sin(angle), 0],
      [-Math.sin(angle), Math.cos(angle), 0],
      [0, 0, 1],
    ];
  sphere(mesh, at([0, 0.02, -0.012]), size([0.145, 0.135, 0.15]), bone, 1);
  sphere(mesh, at([0, 0.01, 0.07]), size([0.12, 0.06, 0.08]), bone, 1);
  for (const side of [-1, 1])
    sphere(mesh, at([side * 0.085, -0.048, 0.07]), size([0.045, 0.034, 0.045]), bone, 1);
  sphere(mesh, at([0, -0.088, 0.062]), size([0.086, 0.044, 0.074]), bone, 1);
  sphere(mesh, at([0, -0.14, 0.038]), size([0.076, 0.03, 0.07]), bone, 1);
  const sockets = [-1, 1].map((side) => at([side * 0.052, -0.008, 0.12]));
  sockets.forEach((socket, i) =>
    sphere(mesh, socket, size([0.041, 0.043, 0.03]), dark, 1, tilt((i ? -1 : 1) * 0.22)),
  );
  for (const side of [-1, 1])
    sphere(
      mesh,
      at([side * 0.009, -0.055, 0.135]),
      size([0.011, 0.021, 0.01]),
      dark,
      1,
      tilt(side * 0.45),
    );
  box(mesh, at([0, -0.114, 0.122]), size([0.1, 0.009, 0.02]), dark, 0.002 * scale, 1, 1);
  for (let k = -2.5; k <= 2.5; k++)
    box(
      mesh,
      at([k * 0.019, -0.099, 0.128]),
      size([0.016, 0.022, 0.014]),
      bone,
      0.004 * scale,
      1,
      2,
    );
  for (let k = -1.5; k <= 1.5; k++)
    box(
      mesh,
      at([k * 0.019, -0.127, 0.118]),
      size([0.016, 0.018, 0.014]),
      bone,
      0.004 * scale,
      1,
      2,
    );
  return sockets;
}
// Moves a mesh built at the origin: scale is already applied, then turn about +y and translate.
export function placeMesh(mesh, from, center, angle = 0) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  for (let k = from; k < mesh.length; k += 12)
    for (const offset of [0, 3]) {
      const x = mesh[k + offset],
        z = mesh[k + offset + 2];
      mesh[k + offset] = (offset ? 0 : center[0]) + x * c + z * s;
      mesh[k + offset + 1] += offset ? 0 : center[1];
      mesh[k + offset + 2] = (offset ? 0 : center[2]) - x * s + z * c;
    }
}
