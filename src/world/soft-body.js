// CPU XPBD tetrahedral solids. No rendering code or graphics-library dependency.
const RES = 3,
  WIDTH = 0.76,
  RADIUS = 0.085,
  NODE_COUNT = (RES + 1) ** 3;
const add = (a, b) => a.map((x, i) => x + b[i]),
  sub = (a, b) => a.map((x, i) => x - b[i]),
  mul = (a, s) => a.map((x) => x * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
const len = (a) => Math.hypot(...a),
  ident = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
const mv = (m, v) => [dot(m.slice(0, 3), v), dot(m.slice(3, 6), v), dot(m.slice(6, 9), v)];
const SIXTH = 1 / 6;
// Reusable 3x3 matrices for the solver hot paths. rotation() copies its input, so a
// scratch matrix is never retained.
const scratchA = new Array(9).fill(0),
  scratchF = new Array(9).fill(0);
// Row-major out = a · b, summed in the same order as the original accumulation loop.
function multiply(a, b, out) {
  for (let j = 0; j < 3; j++)
    for (let k = 0; k < 3; k++)
      out[j * 3 + k] = 0 + a[j * 3] * b[k] + a[j * 3 + 1] * b[3 + k] + a[j * 3 + 2] * b[6 + k];
  return out;
}
function nearestMovementFace(r, direction) {
  const length = Math.hypot(direction.x, direction.z);
  if (length < 1e-8) return null;
  const target = [direction.x / length, direction.z / length],
    faces = [
      [r[0], r[6]],
      [-r[0], -r[6]],
      [r[2], r[8]],
      [-r[2], -r[8]],
    ];
  let best = null,
    bestDot = -Infinity;
  for (const face of faces) {
    const faceLength = Math.hypot(...face);
    if (faceLength < 1e-8) continue;
    const normal = face.map((v) => v / faceLength),
      alignment = normal[0] * target[0] + normal[1] * target[1];
    if (alignment > bestDot) {
      bestDot = alignment;
      best = normal;
    }
  }
  if (!best) return null;
  return {
    normal: best,
    angle: Math.atan2(best[1] * target[0] - best[0] * target[1], bestDot),
  };
}
// Row-major 3x3 determinant: row0 · (row1 × row2).
const det = (m) =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) +
  m[1] * (m[5] * m[6] - m[3] * m[8]) +
  m[2] * (m[3] * m[7] - m[4] * m[6]);
function inverse(m) {
  const d = det(m);
  if (Math.abs(d) < 1e-10) return ident();
  const a = cross(m.slice(3, 6), m.slice(6, 9)),
    b = cross(m.slice(6, 9), m.slice(0, 3)),
    c = cross(m.slice(0, 3), m.slice(3, 6));
  return [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]].map((v) => v / d);
}
function rotation(a) {
  const r = a.slice();
  if (det(r) < 0) {
    r[2] *= -1;
    r[5] *= -1;
    r[8] *= -1;
  }
  for (let k = 0; k < 4; k++) {
    const a = r[0],
      b = r[1],
      c = r[2],
      d = r[3],
      e = r[4],
      f = r[5],
      g = r[6],
      h = r[7],
      i = r[8];
    const A = e * i - f * h,
      B = f * g - d * i,
      C = d * h - e * g,
      D = c * h - b * i,
      E = a * i - c * g,
      F = b * g - a * h,
      G = b * f - c * e,
      H = c * d - a * f,
      I = a * e - b * d;
    const determinant = a * A + b * B + c * C;
    if (Math.abs(determinant) < 1e-9) return ident();
    const t = 1 / determinant;
    r[0] = (a + A * t) * 0.5;
    r[1] = (b + B * t) * 0.5;
    r[2] = (c + C * t) * 0.5;
    r[3] = (d + D * t) * 0.5;
    r[4] = (e + E * t) * 0.5;
    r[5] = (f + F * t) * 0.5;
    r[6] = (g + G * t) * 0.5;
    r[7] = (h + H * t) * 0.5;
    r[8] = (i + I * t) * 0.5;
  }
  return r.every(Number.isFinite) ? r : ident();
}
function rounded(p, radius = RADIUS, width = WIDTH) {
  const b = width / 2 - radius,
    c = p.map((v) => Math.max(-b, Math.min(b, v))),
    d = sub(p, c),
    l = len(d);
  return l > radius ? add(c, mul(d, radius / l)) : p.slice();
}
const index = (x, y, z) => x + (RES + 1) * (y + (RES + 1) * z);
const rest = [],
  cells = [],
  tets = [],
  edges = [],
  edgeSet = new Set();
for (let z = 0; z <= RES; z++)
  for (let y = 0; y <= RES; y++)
    for (let x = 0; x <= RES; x++)
      rest.push(
        rounded([
          (x / RES) * WIDTH - WIDTH / 2,
          (y / RES) * WIDTH - WIDTH / 2,
          (z / RES) * WIDTH - WIDTH / 2,
        ]),
      );
for (let z = 0; z < RES; z++)
  for (let y = 0; y < RES; y++)
    for (let x = 0; x < RES; x++) {
      const ids = [
        index(x, y, z),
        index(x + 1, y, z),
        index(x, y + 1, z),
        index(x + 1, y + 1, z),
        index(x, y, z + 1),
        index(x + 1, y, z + 1),
        index(x, y + 1, z + 1),
        index(x + 1, y + 1, z + 1),
      ];
      cells.push(ids);
      for (const local of [
        [0, 1, 3, 7],
        [0, 3, 2, 7],
        [0, 2, 6, 7],
        [0, 6, 4, 7],
        [0, 4, 5, 7],
        [0, 5, 1, 7],
      ]) {
        const ids2 = local.map((i) => ids[i]);
        let [a, b, c, d] = ids2.map((i) => rest[i]);
        let volume = dot(sub(b, a), cross(sub(c, a), sub(d, a))) / 6;
        if (volume < 0) {
          [ids2[1], ids2[2]] = [ids2[2], ids2[1]];
          volume = -volume;
        }
        tets.push({ ids: ids2, volume });
        for (let i = 0; i < 4; i++)
          for (let j = i + 1; j < 4; j++) {
            const ia = Math.min(ids2[i], ids2[j]),
              ib = Math.max(ids2[i], ids2[j]),
              key = ia + ',' + ib;
            if (!edgeSet.has(key)) {
              edgeSet.add(key);
              edges.push({ a: ia, b: ib, length: len(sub(rest[ia], rest[ib])) });
            }
          }
      }
    }
function boxRest(width) {
  const points = [];
  for (let z = 0; z <= RES; z++)
    for (let y = 0; y <= RES; y++)
      for (let x = 0; x <= RES; x++)
        points.push(
          rounded(
            [
              (x / RES) * width - width / 2,
              (y / RES) * width - width / 2,
              (z / RES) * width - width / 2,
            ],
            0.025,
            width,
          ),
        );
  return points;
}
// Large crates almost fill a cell and slide without turning (see Lattice.slide).
const LARGE_WIDTH = 0.94;
const crateRest = boxRest(WIDTH),
  largeRest = boxRest(LARGE_WIDTH);
// Bottom nodes of a box lattice, and how far an overhanging sliding crate slips per solver
// iteration (about 5 cells per second, well above a jelly's push).
const SLIDE_BASE = [];
for (let z = 0; z <= RES; z++) for (let x = 0; x <= RES; x++) SLIDE_BASE.push(index(x, 0, z));
// A respawning crate reappears this far above its spawn and falls into place.
const CRATE_RESPAWN_DROP = 0.9;
const SLIP_STEP = 0.008,
  SLIDE_INSET = 0.06;
// Height of a body's lattice centre above its feet (p.y).
const bodyLift = (p) => (p.kind === 'crate' && p.large ? LARGE_WIDTH / 2 + 0.04 : 0.42);
function group(ids, points = rest) {
  const center = [0, 0, 0];
  ids.forEach((i) => points[i].forEach((v, k) => (center[k] += v / ids.length)));
  const q = ids.map((i) => sub(points[i], center)),
    a = new Array(9).fill(0);
  q.forEach((v) => {
    for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) a[j * 3 + k] += v[j] * v[k];
  });
  return { ids, q, inverse: inverse(a) };
}
const groups = [...cells.map((ids) => group(ids)), ...tets.map((t) => group(t.ids))],
  globalShape = group(rest.map((_, i) => i));
const crateShape = group(
  rest.map((_, i) => i),
  crateRest,
);
class Lattice {
  constructor(p) {
    this.reset(p);
  }
  reset(p) {
    this.rigid = p.kind === 'crate';
    this.slides = this.rigid && !!p.large;
    this.lift = bodyLift(p);
    // Half size of the rounded box that other bodies collide with, and its corner radius.
    this.half = this.slides ? LARGE_WIDTH / 2 - 0.025 : this.rigid ? 0.355 : 0.315;
    this.rounding = this.rigid ? 0.025 : 0.045;
    this.extent = this.slides ? LARGE_WIDTH / 2 : WIDTH / 2;
    this.positions = (this.slides ? largeRest : this.rigid ? crateRest : rest).map((q) => [
      q[0] + p.x,
      q[1] + this.lift + (p.y || 0),
      q[2] + p.z,
    ]);
    this.velocities = rest.map(() => [p.vx || 0, p.vy || 0, p.vz || 0]);
    this.old = this.positions.map((p) => p.slice());
    this.sleeping = false;
    this.calm = 0;
    this.r = ident();
    this.center = [p.x, this.lift + (p.y || 0), p.z];
    this.previousCenter = this.center.slice();
    this.core = this.center.slice();
    this.coreVelocity = [0, 0, 0];
    this.support = null;
    this.carryVelocity = [0, 0, 0];
    this.state = p.state;
    this.deaths = p.deaths || 0;
  }
  // The solver's hot paths below run per node or tetrahedron, several times per step.
  // They work on scalars and shared scratch matrices to avoid temporary arrays; the
  // arithmetic order matches the vector helpers so results stay bit-identical.
  shape(g, stiffness) {
    const ids = g.ids,
      count = ids.length,
      positions = this.positions;
    let cx = 0,
      cy = 0,
      cz = 0;
    for (let n = 0; n < count; n++) {
      const p = positions[ids[n]];
      cx += p[0] / count;
      cy += p[1] / count;
      cz += p[2] / count;
    }
    const apq = scratchA.fill(0);
    for (let n = 0; n < count; n++) {
      const p = positions[ids[n]],
        q = g.q[n],
        px = p[0] - cx,
        py = p[1] - cy,
        pz = p[2] - cz;
      apq[0] += px * q[0];
      apq[1] += px * q[1];
      apq[2] += px * q[2];
      apq[3] += py * q[0];
      apq[4] += py * q[1];
      apq[5] += py * q[2];
      apq[6] += pz * q[0];
      apq[7] += pz * q[1];
      apq[8] += pz * q[2];
    }
    const r = rotation(multiply(apq, g.inverse, scratchF));
    for (let n = 0; n < count; n++) {
      const p = positions[ids[n]],
        q = g.q[n];
      p[0] += (cx + r[0] * q[0] + r[1] * q[1] + r[2] * q[2] - p[0]) * stiffness;
      p[1] += (cy + r[3] * q[0] + r[4] * q[1] + r[5] * q[2] - p[1]) * stiffness;
      p[2] += (cz + r[6] * q[0] + r[7] * q[1] + r[8] * q[2] - p[2]) * stiffness;
    }
    return r;
  }
  volume(t, lambda, dt) {
    const ids = t.ids,
      a = this.positions[ids[0]],
      b = this.positions[ids[1]],
      c = this.positions[ids[2]],
      d = this.positions[ids[3]];
    const abx = b[0] - a[0],
      aby = b[1] - a[1],
      abz = b[2] - a[2],
      acx = c[0] - a[0],
      acy = c[1] - a[1],
      acz = c[2] - a[2],
      adx = d[0] - a[0],
      ady = d[1] - a[1],
      adz = d[2] - a[2];
    // Cross products ac×ad, ad×ab and ab×ac are the volume gradients of b, c and d.
    const bx = acy * adz - acz * ady,
      by = acz * adx - acx * adz,
      bz = acx * ady - acy * adx,
      v = (abx * bx + aby * by + abz * bz) / 6;
    const gbx = bx * SIXTH,
      gby = by * SIXTH,
      gbz = bz * SIXTH,
      gcx = (ady * abz - adz * aby) * SIXTH,
      gcy = (adz * abx - adx * abz) * SIXTH,
      gcz = (adx * aby - ady * abx) * SIXTH,
      gdx = (aby * acz - abz * acy) * SIXTH,
      gdy = (abz * acx - abx * acz) * SIXTH,
      gdz = (abx * acy - aby * acx) * SIXTH,
      gax = (gbx + gcx + gdx) * -1,
      gay = (gby + gcy + gdy) * -1,
      gaz = (gbz + gcz + gdz) * -1;
    const alpha = 2e-11 / (dt * dt),
      denom =
        alpha +
        (gax * gax + gay * gay + gaz * gaz) +
        (gbx * gbx + gby * gby + gbz * gbz) +
        (gcx * gcx + gcy * gcy + gcz * gcz) +
        (gdx * gdx + gdy * gdy + gdz * gdz),
      dl = (-(v - t.volume) - alpha * lambda) / Math.max(1e-12, denom);
    const bound =
        Math.max(
          Math.hypot(gax, gay, gaz),
          Math.hypot(gbx, gby, gbz),
          Math.hypot(gcx, gcy, gcz),
          Math.hypot(gdx, gdy, gdz),
        ) * Math.abs(dl),
      limited = dl * Math.min(1, 0.045 / (bound || 1));
    a[0] += gax * limited;
    a[1] += gay * limited;
    a[2] += gaz * limited;
    b[0] += gbx * limited;
    b[1] += gby * limited;
    b[2] += gbz * limited;
    c[0] += gcx * limited;
    c[1] += gcy * limited;
    c[2] += gcz * limited;
    d[0] += gdx * limited;
    d[1] += gdy * limited;
    d[2] += gdz * limited;
    return lambda + limited;
  }
  strain() {
    const positions = this.positions;
    for (let i = 0; i < edges.length; i++) {
      const e = edges[i],
        a = positions[e.a],
        b = positions[e.b],
        dx = b[0] - a[0],
        dy = b[1] - a[1],
        dz = b[2] - a[2],
        l = Math.hypot(dx, dy, dz),
        target = Math.max(e.length * 0.65, Math.min(e.length * 1.35, l));
      if (l > 1e-9 && l !== target) {
        const s = ((l - target) / l) * 0.5,
          cx = dx * s,
          cy = dy * s,
          cz = dz * s;
        a[0] += cx;
        a[1] += cy;
        a[2] += cz;
        b[0] -= cx;
        b[1] -= cy;
        b[2] -= cz;
      }
    }
  }
  summarize() {
    let x = 0,
      y = 0,
      z = 0;
    for (let n = 0; n < NODE_COUNT; n++) {
      const p = this.positions[n];
      x += p[0] / NODE_COUNT;
      y += p[1] / NODE_COUNT;
      z += p[2] / NODE_COUNT;
    }
    this.center = [x, y, z];
    return this.center;
  }
  // Large crates: rigid translation only. Nodes return to the rest box around their centre.
  slide() {
    const [cx, cy, cz] = this.summarize();
    for (let n = 0; n < NODE_COUNT; n++) {
      const p = this.positions[n],
        q = largeRest[n];
      p[0] = cx + q[0];
      p[1] = cy + q[1];
      p[2] = cz + q[2];
    }
    this.r = ident();
  }
  orientation() {
    if (this.slides) {
      this.r = ident();
      return;
    }
    const points = this.rigid ? crateRest : rest,
      shape = this.rigid ? crateShape : globalShape,
      [cx, cy, cz] = this.center,
      a = scratchA.fill(0);
    for (let n = 0; n < NODE_COUNT; n++) {
      const p = this.positions[n],
        q = points[n],
        px = p[0] - cx,
        py = p[1] - cy,
        pz = p[2] - cz;
      a[0] += px * q[0];
      a[1] += px * q[1];
      a[2] += px * q[2];
      a[3] += py * q[0];
      a[4] += py * q[1];
      a[5] += py * q[2];
      a[6] += pz * q[0];
      a[7] += pz * q[1];
      a[8] += pz * q[2];
    }
    this.r = rotation(multiply(a, shape.inverse, scratchF));
  }
  snapshot() {
    return {
      positions: this.positions.map((p) => p.slice()),
      velocities: this.velocities.map((v) => v.slice()),
      core: this.core.slice(),
      coreVelocity: this.coreVelocity.slice(),
      sleeping: this.sleeping,
      calm: this.calm,
    };
  }
  restore(s) {
    this.positions = s.positions.map((p) => p.slice());
    this.old = this.positions.map((p) => p.slice());
    this.velocities = s.velocities.map((v) => v.slice());
    this.sleeping = s.sleeping;
    this.calm = s.calm;
    this.summarize();
    this.orientation();
    this.core = (s.core || this.center).slice();
    this.coreVelocity = (s.coreVelocity || [0, 0, 0]).slice();
  }
}
class System {
  constructor() {
    this.bodies = new WeakMap();
    this.softness = 0.5;
    this.decay = 0.5;
    this.iterations = 5;
  }
  get(p) {
    let b = this.bodies.get(p);
    if (!b) {
      b = new Lattice(p);
      this.bodies.set(p, b);
    }
    return b;
  }
  reset() {
    this.bodies = new WeakMap();
  }
  translate(p, x, y, z, stop = false) {
    const b = this.get(p),
      delta = [x, y, z];
    for (const collection of [b.positions, b.old])
      for (const point of collection) for (let k = 0; k < 3; k++) point[k] += delta[k];
    for (const point of [b.center, b.previousCenter, b.core])
      for (let k = 0; k < 3; k++) point[k] += delta[k];
    p.x += x;
    p.y = (p.y || 0) + y;
    p.z += z;
    p.rx = p.x;
    p.rz = p.z;
    b.sleeping = false;
    b.calm = 0;
    if (stop) {
      p.vx = p.vy = p.vz = 0;
      b.velocities.forEach((v) => v.fill(0));
      b.coreVelocity.fill(0);
    }
  }
  snapshot(players) {
    return players.map((p) => this.get(p).snapshot());
  }
  restore(players, snapshots) {
    this.reset();
    players.forEach((p, i) => {
      if (snapshots?.[i]) this.get(p).restore(snapshots[i]);
    });
  }
  poke(p, point = [p.x, 0.8 + (p.y || 0), p.z]) {
    const b = this.get(p);
    b.sleeping = false;
    b.calm = 0;
    b.disturbance = 0.3;
    for (let i = 0; i < NODE_COUNT; i++) {
      const d = len(sub(b.positions[i], point));
      b.velocities[i][1] -= 2.8 * Math.exp((-d * d) / 0.045);
    }
  }
  contacts(world, p, b) {
    if (p.state === 'dead') return;
    const level = b.slides ? this.slideSupport(world, p, b) : null;
    for (let i = 0; i < NODE_COUNT; i++) {
      const node = b.positions[i];
      const height = world.heightAt(node[0], node[2], (p.y || 0) + 0.2, p),
        old = b.old[i];
      if (
        (level === null ||
          (level !== false && height !== null && Math.abs(height - level) < 0.1)) &&
        height !== null &&
        height <= (p.y || 0) + 0.2 &&
        node[1] < height + 0.035 &&
        (old[1] > height - 0.14 || (p.state === 'alive' && Math.abs((p.y || 0) - height) < 0.18))
      ) {
        const penetration = height + 0.035 - node[1];
        node[1] = height + 0.035;
        const dx = node[0] - old[0] - (b.surfaceVelocity?.x || 0) * (this.contactStep || 0),
          dz = node[2] - old[2] - (b.surfaceVelocity?.z || 0) * (this.contactStep || 0),
          slip = Math.hypot(dx, dz);
        // Coulomb floor friction: static contact sticks; sliding uses a smaller coefficient.
        const friction =
          !b.driven && slip < penetration * 0.65
            ? 1
            : Math.min(1, (penetration * (b.driven ? 0.12 : 0.38)) / (slip || 1));
        node[0] -= dx * friction;
        node[2] -= dz * friction;
      }
      for (const o of b.collisionBoxes || []) {
        if (node[1] > o.maxY - 0.005 || node[1] < o.minY) continue;
        const dx = node[0] - o.x,
          dz = node[2] - o.z,
          ex = (o.halfX ?? o.half) + 0.015 - Math.abs(dx),
          ez = (o.halfZ ?? o.half) + 0.015 - Math.abs(dz);
        if (ex > 0 && ez > 0) {
          if (o.kind === 'block' && old[1] <= o.minY + 0.04) {
            node[1] = o.minY - 0.015;
            continue;
          }
          if (ex < ez) node[0] += Math.sign(dx || 1) * ex;
          else node[2] += Math.sign(dz || 1) * ez;
        }
      }
    }
  }
  // A sliding crate cannot tip. It stands still while at least half of its base (8 of the 16
  // bottom nodes) is over the highest surface beneath it, so over a straight edge it can hang
  // out by about two thirds. With less it slips towards the drop, and with a quarter or less it
  // falls (b.airborne), straight down. Returns the supporting height, or false.
  slideSupport(world, p, b) {
    // Only surfaces at or below its base hold it: a rim it has already sunk past is a wall.
    const ceiling = b.center[1] - LARGE_WIDTH / 2 + 0.05,
      // Sampled slightly inside the base, so a crate lined up over a one-cell pit (0.94 in
      // 1.0) is not held up by a rim it only grazes.
      heights = SLIDE_BASE.map((n) => {
        const node = b.positions[n],
          inset = 1 - SLIDE_INSET / (LARGE_WIDTH / 2);
        return world.heightAt(
          b.center[0] + (node[0] - b.center[0]) * inset,
          b.center[2] + (node[2] - b.center[2]) * inset,
          ceiling,
          p,
        );
      }),
      top = Math.max(...heights.map((h) => (h === null ? -Infinity : h))),
      supported = heights.map((h) => h !== null && h > top - 0.1),
      count = supported.filter(Boolean).length;
    // One edge row of the base (or less) on a rim is not enough to hold it: it drops, and the
    // small overlap with the rim is pushed out by the block collision on the way down.
    b.airborne = count <= 4;
    if (b.airborne) return false;
    if (count < 8) {
      let dx = 0,
        dz = 0;
      SLIDE_BASE.forEach((n, k) => {
        if (supported[k]) return;
        dx += b.positions[n][0] - b.center[0];
        dz += b.positions[n][2] - b.center[2];
      });
      const length = Math.hypot(dx, dz);
      if (length > 1e-6)
        for (const node of b.positions) {
          node[0] += (dx / length) * SLIP_STEP;
          node[2] += (dz / length) * SLIP_STEP;
        }
    }
    return top;
  }
  stackContact(pa, pb, a, b) {
    if (pa.state === 'dead' || pb.state === 'dead') return false;
    const ac = a.summarize(),
      bc = b.summarize(),
      dy = ac[1] - bc[1];
    const reach = a.slides || b.slides ? a.extent + b.extent - 0.1 : 0.66;
    if (Math.abs(dy) < 0.36 || Math.abs(ac[0] - bc[0]) > reach || Math.abs(ac[2] - bc[2]) > reach)
      return false;
    const upper = dy > 0 ? a : b,
      lower = dy > 0 ? b : a;
    const top = Math.max(...lower.positions.map((n) => n[1])),
      bottom = Math.min(...upper.positions.map((n) => n[1]));
    if (bottom > top + 0.065) return false;
    // Keep a consistent upward contact normal during a fall. Whole-body separation
    // prevents deeply embedded nodes from choosing opposite exit faces.
    const lift = top + 0.012 - bottom;
    if (lift > 0) {
      for (const n of upper.positions) n[1] += lift;
      upper.summarize();
    }
    upper.support = dy > 0 ? pb : pa;
    return true;
  }
  pair(pa, pb, a, b) {
    if (pa.state === 'dead' || pb.state === 'dead' || (a.sleeping && b.sleeping)) return;
    const ac = a.summarize(),
      bc = b.summarize();
    if (Math.hypot(ac[0] - bc[0], ac[1] - bc[1], ac[2] - bc[2]) > 1.5) return;
    if (this.stackContact(pa, pb, a, b)) return;
    let touching = false;
    // Symmetric node/rounded-body contacts. Contact corrections deform the lattice,
    // and their opposite impulses are distributed across the neighbour's mass.
    // Scalar form of the vector expressions, in the same arithmetic order.
    for (let side = 0; side < 2; side++) {
      const src = side ? b : a,
        dst = side ? a : b,
        r = dst.r,
        c = dst.center,
        half = dst.half,
        rounding = dst.rounding;
      for (let nodeIndex = 0; nodeIndex < NODE_COUNT; nodeIndex++) {
        const node = src.positions[nodeIndex];
        const w0 = node[0] - c[0],
          w1 = node[1] - c[1],
          w2 = node[2] - c[2];
        const d0 = r[0] * w0 + r[3] * w1 + r[6] * w2,
          d1 = r[1] * w0 + r[4] * w1 + r[7] * w2,
          d2 = r[2] * w0 + r[5] * w1 + r[8] * w2;
        const q0 = Math.abs(d0) - half,
          q1 = Math.abs(d1) - half,
          q2 = Math.abs(d2) - half,
          o0 = Math.max(0, q0),
          o1 = Math.max(0, q1),
          o2 = Math.max(0, q2),
          l = Math.hypot(o0, o1, o2),
          qMax = Math.max(q0, q1, q2),
          distance = l + Math.min(qMax, 0) - rounding;
        if (distance >= 0) continue;
        touching = true;
        let l0 = 0,
          l1 = 0,
          l2 = 0;
        if (l > 1e-7) {
          l0 = (o0 / l) * Math.sign(d0 || 1);
          l1 = (o1 / l) * Math.sign(d1 || 1);
          l2 = (o2 / l) * Math.sign(d2 || 1);
        } else if (q0 === qMax) l0 = Math.sign(d0 || 1);
        else if (q1 === qMax) l1 = Math.sign(d1 || 1);
        else l2 = Math.sign(d2 || 1);
        const n0 = r[0] * l0 + r[1] * l1 + r[2] * l2,
          n1 = r[3] * l0 + r[4] * l1 + r[5] * l2,
          n2 = r[6] * l0 + r[7] * l1 + r[8] * l2;
        const push = Math.min(0.08, -distance) * 0.65,
          p0 = n0 * push,
          p1 = n1 * push,
          p2 = n2 * push;
        node[0] += p0;
        node[1] += p1;
        node[2] += p2;
        for (const other of dst.positions) {
          other[0] -= p0 / NODE_COUNT;
          other[1] -= p1 / NODE_COUNT;
          other[2] -= p2 / NODE_COUNT;
        }
        const old = src.old[nodeIndex],
          previous = dst.previousCenter,
          r0 = node[0] - old[0] - (c[0] - previous[0]),
          r1 = node[1] - old[1] - (c[1] - previous[1]),
          r2 = node[2] - old[2] - (c[2] - previous[2]),
          along = r0 * n0 + r1 * n1 + r2 * n2,
          t0 = r0 - n0 * along,
          t1 = r1 - n1 * along,
          t2 = r2 - n2 * along,
          distanceMoved = Math.hypot(t0, t1, t2),
          friction = Math.min(1, (push * 0.28) / (distanceMoved || 1)),
          f0 = t0 * friction,
          f1 = t1 * friction,
          f2 = t2 * friction;
        node[0] -= f0;
        node[1] -= f1;
        node[2] -= f2;
        for (const other of dst.positions) {
          other[0] += f0 / NODE_COUNT;
          other[1] += f1 / NODE_COUNT;
          other[2] += f2 / NODE_COUNT;
        }
      }
    }
    if (touching && a.rigid !== b.rigid && Math.abs(a.center[1] - b.center[1]) < 0.35) {
      a.pushingCrate = true;
      b.pushingCrate = true;
    }
  }
  step(world, players, inputs, dt) {
    this.contactStep = dt;
    const events = [],
      lattices = players.map((p) => this.get(p));
    lattices.forEach((b) => (b.pushingCrate = false));
    world.refresh(players);
    const previousCenters = lattices.map((b) => b.summarize().slice());
    const supports = lattices.map((b, i) => {
      const support = b.support,
        j = players.indexOf(support);
      return j >= 0 &&
        support.state !== 'dead' &&
        Math.abs(players[i].x - support.x) < 0.68 &&
        Math.abs(players[i].z - support.z) < 0.68
        ? j
        : -1;
    });
    players.forEach((p, i) => {
      p.spawn ??= { x: p.x, z: p.z };
      p.state ??= 'alive';
      p.y ??= 0;
      p.vy ??= 0;
      p.deaths ??= 0;
      p.respawnFlash = Math.max(0, (p.respawnFlash || 0) - dt);
      const b = lattices[i],
        input = inputs[i] || { x: 0, z: 0 },
        magnitude = p.launchTimer > 0 ? 0 : Math.hypot(input.x, input.z);
      const belt =
          supports[i] >= 0
            ? { x: 0, z: 0 }
            : world.conveyorVelocity(
                p,
                b.rigid ? Math.min(...b.positions.map((n) => n[1])) - 0.035 : p.y || 0,
              ),
        onBelt = Math.hypot(belt.x, belt.z) > 0.001;
      b.surfaceVelocity = belt;
      b.driven = magnitude > 0 || onBelt;
      b.driveDirection = magnitude > 0 ? input : onBelt ? belt : null;
      if (p.state === 'dead') {
        p.respawnTimer -= dt;
        const spawn = p.respawnTimer <= 0 && world.respawnPosition(p, players);
        // Ready but the spawn is taken: the renderer shows a ghost there.
        p.respawnBlocked = p.respawnTimer <= 0 && !spawn;
        if (spawn) {
          // A crate is teleported back above its spawn and drops into place.
          const crate = p.kind === 'crate';
          Object.assign(p, spawn, {
            state: crate ? 'falling' : 'alive',
            y: (spawn.y || 0) + (crate ? CRATE_RESPAWN_DROP : 0),
            vy: 0,
            vx: 0,
            vz: 0,
            impact: 0,
            respawnFlash: 0.65,
            portalLock: null,
            portalCooldown: 0,
            deathReason: null,
            respawnBlocked: false,
          });
          b.reset(p);
          events.push({ type: 'respawn', player: i });
        }
        return;
      }
      if (
        Math.hypot(p.x - b.center[0], p.z - b.center[2]) > 0.25 ||
        Math.abs((p.y || 0) + b.lift - b.center[1]) > 0.5
      )
        b.reset(p);
      b.collisionBoxes = world
        .collisionBoxes()
        .filter(
          (o) =>
            world.blockSolid(p, o) &&
            Math.abs(o.x - p.x) < o.half + 1 &&
            Math.abs(o.z - p.z) < o.half + 1,
        );
      b.disturbance = Math.max(0, (b.disturbance || 0) - dt);
      const neighbour = players.some(
        (other, j) =>
          j !== i &&
          other.state !== 'dead' &&
          !lattices[j].sleeping &&
          (Math.hypot(other.vx, other.vy || 0, other.vz) > 0.05 ||
            lattices[j].disturbance > 0 ||
            Math.hypot(inputs[j]?.x || 0, inputs[j]?.z || 0) > 0) &&
          Math.hypot(p.x - other.x, p.z - other.z) < 1.25,
      );
      if (magnitude || onBelt || neighbour || p.state === 'falling' || !world.supported(p)) {
        b.sleeping = false;
        b.calm = 0;
      }
      if (b.sleeping) return;
      for (let n = 0; n < NODE_COUNT; n++) {
        const node = b.positions[n],
          old = b.old[n];
        old[0] = node[0];
        old[1] = node[1];
        old[2] = node[2];
      }
      b.previousCenter = b.center.slice();
      // Drive relative to the supporting body. Its displacement is added once below,
      // avoiding both sliding passengers and doubled carrier velocity.
      if (supports[i] >= 0) {
        p.vx -= b.carryVelocity[0];
        p.vz -= b.carryVelocity[2];
        for (const v of b.velocities) {
          v[0] -= b.carryVelocity[0];
          v[1] -= b.carryVelocity[1];
          v[2] -= b.carryVelocity[2];
        }
      }
      b.carryVelocity = [0, 0, 0];
      const driveGain = magnitude ? 13 : onBelt ? 8 : 18;
      const ax =
        p.state === 'alive' && !p.launchTimer
          ? ((magnitude ? (input.x / magnitude) * 2.6 : 0) + belt.x - (p.vx || 0)) * driveGain
          : 0;
      const az =
        p.state === 'alive' && !p.launchTimer
          ? ((magnitude ? (input.z / magnitude) * 2.6 : 0) + belt.z - (p.vz || 0)) * driveGain
          : 0;
      for (let n = 0; n < NODE_COUNT; n++) {
        const v = b.velocities[n];
        v[0] += ax * dt;
        v[1] -= 15 * dt;
        v[2] += az * dt;
        for (let k = 0; k < 3; k++) b.positions[n][k] += v[k] * dt;
      }
    });
    const ascending = players
      .map((_, i) => i)
      .sort((a, b) => previousCenters[a][1] - previousCenters[b][1]);
    for (const i of ascending) {
      const b = lattices[i],
        j = supports[i];
      if (j < 0 || b.sleeping || players[i].state === 'dead') continue;
      const delta = sub(lattices[j].summarize(), previousCenters[j]);
      for (const n of b.positions) for (let k = 0; k < 3; k++) n[k] += delta[k];
      b.carryVelocity = mul(delta, 1 / dt);
    }
    lattices.forEach((b) => (b.support = null));
    const lambdas = players.map(() => new Float64Array(tets.length));
    for (let iter = 0; iter < this.iterations; iter++) {
      players.forEach((p, i) => {
        const b = lattices[i];
        if (p.state === 'dead' || b.sleeping) return;
        if (p.kind === 'crate') {
          if (b.slides) b.slide();
          else {
            b.r = b.shape(crateShape, 1);
            b.summarize();
          }
          this.contacts(world, p, b);
          return;
        }
        for (let g = 0; g < groups.length; g++)
          if (g < cells.length || iter === 0)
            b.shape(groups[g], (g < cells.length ? 0.045 : 0.008) * (1.3 - this.softness * 0.95));
        tets.forEach((t, j) => {
          lambdas[i][j] = b.volume(t, lambdas[i][j], dt);
        });
        b.strain();
        this.contacts(world, p, b);
      });
      for (let i = 0; i < players.length; i++)
        for (let j = i + 1; j < players.length; j++)
          this.pair(players[i], players[j], lattices[i], lattices[j]);
    }
    // Resolve from the bottom up, including sleeping supports and fast falling bodies.
    for (const i of ascending)
      for (const j of ascending)
        if (previousCenters[i][1] > previousCenters[j][1] + 0.35)
          this.stackContact(players[i], players[j], lattices[i], lattices[j]);
    players.forEach((p, i) => {
      const b = lattices[i];
      if (p.state === 'dead' || b.sleeping) return;
      const center = b.summarize(),
        vcom = [0, 0, 0];
      b.orientation();
      const inverseDt = 1 / dt;
      for (let n = 0; n < NODE_COUNT; n++) {
        const v = b.velocities[n],
          node = b.positions[n],
          old = b.old[n];
        for (let k = 0; k < 3; k++) {
          v[k] = (node[k] - old[k]) * inverseDt;
          vcom[k] += v[k] / NODE_COUNT;
        }
      }
      // A sliding crate leaves a ledge only once clear of it, then drops straight down.
      if (b.slides && b.airborne) {
        vcom[0] = 0;
        vcom[2] = 0;
      }
      if (b.support) {
        const support = this.get(b.support),
          supportV = (support.summarize()[1] - support.previousCenter[1]) / dt;
        if (vcom[1] < supportV + 0.08) {
          const correction = supportV - vcom[1];
          for (const v of b.velocities) v[1] += correction;
          vcom[1] = supportV;
        }
      }
      // Remove only internal wobble, leaving translation and rigid angular motion intact.
      const inertia = new Array(9).fill(0),
        angular = [0, 0, 0],
        r = [0, 0, 0];
      for (let n = 0; n < NODE_COUNT; n++) {
        const node = b.positions[n],
          velocity = b.velocities[n];
        r[0] = node[0] - center[0];
        r[1] = node[1] - center[1];
        r[2] = node[2] - center[2];
        const v0 = velocity[0] - vcom[0],
          v1 = velocity[1] - vcom[1],
          v2 = velocity[2] - vcom[2],
          r2 = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
        angular[0] += r[1] * v2 - r[2] * v1;
        angular[1] += r[2] * v0 - r[0] * v2;
        angular[2] += r[0] * v1 - r[1] * v0;
        for (let j = 0; j < 3; j++)
          for (let k = 0; k < 3; k++) inertia[j * 3 + k] += (j === k ? r2 : 0) - r[j] * r[k];
      }
      const touchingGround = b.positions.some((node) => {
          const height = world.heightAt(node[0], node[2], node[1] + 0.06);
          return height !== null && Math.abs(node[1] - height - 0.035) < 0.025;
        }),
        crateGrounded = b.rigid && touchingGround,
        stableCratePush = b.pushingCrate && touchingGround;
      let omega = mv(inverse(inertia), angular);
      if (b.slides) omega = [0, 0, 0];
      else if (b.rigid)
        omega = mul(omega, Math.exp(-dt * (stableCratePush ? 50 : crateGrounded ? 2.5 : 0.12)));
      else if (p.state === 'alive') {
        omega = mul(omega, Math.exp(-dt * 12));
        if (stableCratePush) {
          const tiltDamping = Math.exp(-dt * 20);
          omega[0] *= tiltDamping;
          omega[2] *= tiltDamping;
        }
        const face = nearestMovementFace(b.r, b.driveDirection || { x: 0, z: 0 });
        if (face) {
          const targetOmega = Math.max(-5.6, Math.min(5.6, face.angle * 14));
          const response = stableCratePush ? 50 : 10;
          omega[1] += (targetOmega - omega[1]) * (1 - Math.exp(-dt * response));
        }
      }
      const damping = Math.exp(-dt * (3 + this.decay * 10)),
        // A sliding crate moves as one piece: no internal wobble survives the step.
        keep = b.slides ? 0 : damping;
      let energy = 0;
      for (let n = 0; n < NODE_COUNT; n++) {
        const node = b.positions[n],
          v = b.velocities[n],
          s0 = node[0] - center[0],
          s1 = node[1] - center[1],
          s2 = node[2] - center[2],
          rigid0 = vcom[0] + (omega[1] * s2 - omega[2] * s1),
          rigid1 = vcom[1] + (omega[2] * s0 - omega[0] * s2),
          rigid2 = vcom[2] + (omega[0] * s1 - omega[1] * s0);
        v[0] = rigid0 + (v[0] - rigid0) * keep;
        v[1] = rigid1 + (v[1] - rigid1) * keep;
        v[2] = rigid2 + (v[2] - rigid2) * keep;
        energy += (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) / NODE_COUNT;
      }
      Object.assign(p, {
        x: center[0],
        z: center[2],
        y: center[1] - b.lift,
        vx: vcom[0],
        vz: vcom[2],
        vy: vcom[1],
      });
      for (let k = 0; k < 3; k++) {
        b.coreVelocity[k] += ((center[k] - b.core[k]) * 64 - 8 * b.coreVelocity[k]) * dt;
        b.core[k] += b.coreVelocity[k] * dt;
        b.core[k] = Math.max(center[k] - 0.12, Math.min(center[k] + 0.12, b.core[k]));
      }
      const driving = b.driven;
      const ground = world.heightAt(p.x, p.z, p.y + 0.2, p);
      const grounded = b.rigid
        ? crateGrounded
        : ground !== null && Math.abs(p.y - ground) < 0.15 && p.vy < 0.7;
      if (p.state === 'falling' && (b.support || grounded)) {
        p.state = 'alive';
        p.launchTimer = 0;
        events.push({ type: 'land', player: i });
      }
      if (
        p.state === 'alive' &&
        !b.support &&
        (b.rigid ? !crateGrounded : ground === null || p.y < ground - 0.2 || p.y > ground + 0.23)
      ) {
        p.state = 'falling';
        events.push({ type: 'fall', player: i });
      }
      if (p.state === 'falling' && p.y < -4) {
        p.state = 'dead';
        p.deaths++;
        p.respawnTimer = 0.55;
        p.vx = p.vz = 0;
        events.push({ type: 'death', player: i });
      }
      if (p.state === 'alive' && !driving && energy < 0.003) {
        b.calm += dt;
        if (b.calm > 0.65) {
          b.sleeping = true;
          b.velocities.forEach((v) => v.fill(0));
          p.vx = p.vy = p.vz = 0;
        }
      } else b.calm = 0;
    });
    world.refresh(players);
    return events;
  }
}
export {
  System,
  bodyLift,
  LARGE_WIDTH,
  Lattice,
  rest,
  tets,
  edges,
  cells,
  RES,
  WIDTH,
  NODE_COUNT,
  rounded,
  det,
  nearestMovementFace,
  rotation,
};
