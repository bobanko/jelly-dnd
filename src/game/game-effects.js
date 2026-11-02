import Levels from '../world/levels.js';
import { cells as LATTICE_CELLS, NODE_COUNT, RES, WIDTH } from '../world/soft-body.js';
// Short-lived visual particles. They never become gameplay colliders.
// Live particles at most; the oldest are dropped first.
const MAX_PARTICLES = 160;
export const PORTAL_TRAVEL_TIME = 0.3;
const palettes = [
  [0.12, 0.9, 0.16],
  [0.025, 0.17, 1],
  [1, 0.065, 0.035],
  [0.65, 0.1, 1],
  [1, 0.65, 0.035],
];
const runeColors = [
    [0.45, 1, 0.08],
    [0.035, 0.17, 1],
    [1, 0.055, 0.025],
    [0.68, 0.12, 1],
    [1, 0.65, 0.025],
  ],
  RUNE_LIMIT = 32;
// A dying jelly breaks along its lattice cells into rounded chunks: some single cells, some
// two or four glued together. Chunks tumble, bounce off floors and walls, settle on a face
// and finally melt away. Visual only.
const CHUNK_LIMIT = 72,
  CHUNK_GRAVITY = 9,
  CHUNK_MELT = 0.4,
  CHUNK_SHAPES = [
    [2, 1, 1],
    [1, 2, 1],
    [1, 1, 2],
    [2, 2, 1],
    [2, 1, 2],
    [1, 2, 2],
  ],
  IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
// Rotation by `angle` about the unit vector `a`, applied on the left of row-major `m`.
function rotate(m, [x, y, z], angle) {
  const c = Math.cos(angle),
    s = Math.sin(angle),
    t = 1 - c,
    r = [
      t * x * x + c,
      t * x * y - s * z,
      t * x * z + s * y,
      t * x * y + s * z,
      t * y * y + c,
      t * y * z - s * x,
      t * x * z - s * y,
      t * y * z + s * x,
      t * z * z + c,
    ],
    out = new Array(9);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      out[i * 3 + j] = r[i * 3] * m[j] + r[i * 3 + 1] * m[3 + j] + r[i * 3 + 2] * m[6 + j];
  return out;
}
// Half size of a turned chunk along world axis k.
const chunkExtent = (c, k) =>
  Math.abs(c.rotation[k * 3]) * c.half[0] +
  Math.abs(c.rotation[k * 3 + 1]) * c.half[1] +
  Math.abs(c.rotation[k * 3 + 2]) * c.half[2];
class System {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.particles = [];
    this.rings = [];
    this.runes = [];
    this.bones = [];
    this.chunks = [];
    this.lasers = [];
    this.laserTimers = new Map();
    this.runeTimers = [];
    this.runeActive = [];
    // Per-player materialisation: hidden for `delay`, then grows from a point (visual only).
    this.warps = [];
    this.seed = 1;
  }
  warp(player, delay = 0) {
    this.warps[player] = { age: 0, delay: this.reducedMotion ? 0 : delay };
  }
  warpScale(player) {
    const warp = this.warps[player];
    if (!warp) return 1;
    const t = (warp.age - warp.delay) / (this.reducedMotion ? 0.12 : 0.38);
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Ease out with a slight overshoot, like the gel snapping into shape.
    const u = t - 1;
    return 1 + 2.4 * u * u * u + 1.4 * u * u;
  }
  random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  clear() {
    this.warps = [];
    this.particles.length = 0;
    this.rings.length = 0;
    this.runes.length = 0;
    this.bones.length = 0;
    this.chunks.length = 0;
    this.lasers.length = 0;
    this.laserTimers.clear();
    this.runeTimers = [];
    this.runeActive = [];
  }
  laserImpact(beam, player, count = this.reducedMotion ? 1 : 3) {
    const direction = beam.from.map((v, k) => v - beam.to[k]),
      length = Math.hypot(...direction);
    if (length < 0.001) return;
    const normal = direction.map((v) => v / length),
      jelly = player && player.kind !== 'crate',
      slot = jelly ? (player.slot ?? beam.hit) : undefined,
      color = jelly ? palettes[slot] : [1, 0.72, 0.24];
    for (let i = 0; i < count; i++) {
      const scatter = normal.map(() => this.random() - 0.5),
        along = scatter.reduce((sum, v, k) => sum + v * normal[k], 0),
        speed = 0.7 + this.random() * 1.5;
      this.particles.push({
        kind: jelly ? 'jelly' : 'spark',
        position: beam.to.map((v, k) => v + normal[k] * 0.015),
        velocity: normal.map(
          (v, k) => v * speed + (scatter[k] - along * v) * 2.8 + (k === 1 ? 0.65 : 0),
        ),
        size: jelly ? 0.025 + this.random() * 0.035 : 0.008 + this.random() * 0.006,
        phase: this.random() * Math.PI * 2,
        color,
        slot,
        age: 0,
        life: this.reducedMotion ? 0.16 : (jelly ? 0.3 : 0.18) + this.random() * 0.16,
      });
    }
    this.particles = this.particles.slice(-MAX_PARTICLES);
  }
  stepLaserImpacts(dt, world, players) {
    const active = new Set(),
      interval = this.reducedMotion ? 0.2 : 0.06;
    for (const beam of world.droneBeams || []) {
      if (!beam.impact) continue;
      const player = (world.bodies || players)[beam.hit];
      // Lethal contacts already emit at the moment of death, before the body disappears.
      if (player?.state === 'dead') continue;
      active.add(beam.drone);
      let remaining = this.laserTimers.get(beam.drone) ?? 0;
      remaining -= dt;
      while (remaining < 0) {
        this.laserImpact(beam, player);
        remaining += interval;
      }
      this.laserTimers.set(beam.drone, remaining);
    }
    for (const drone of this.laserTimers.keys())
      if (!active.has(drone)) this.laserTimers.delete(drone);
  }
  // Splits the 3×3×3 cell grid into pieces: in random order, each free cell starts a piece,
  // often grown into a free 2×1×1 or 2×2×1 block.
  splitCells() {
    const free = new Array(RES ** 3).fill(true),
      at = (x, y, z) => x + RES * (y + RES * z),
      order = free.map((_, i) => i),
      pieces = [];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const start of order) {
      if (!free[start]) continue;
      const x = start % RES,
        y = Math.floor(start / RES) % RES,
        z = Math.floor(start / RES ** 2);
      let size = [1, 1, 1];
      if (this.random() < 0.55) {
        const offset = Math.floor(this.random() * CHUNK_SHAPES.length);
        for (let n = 0; n < CHUNK_SHAPES.length; n++) {
          const [sx, sy, sz] = CHUNK_SHAPES[(offset + n) % CHUNK_SHAPES.length];
          if (x + sx > RES || y + sy > RES || z + sz > RES) continue;
          let fits = true;
          for (let k = 0; k < sz; k++)
            for (let j = 0; j < sy; j++)
              for (let i = 0; i < sx; i++) fits &&= free[at(x + i, y + j, z + k)];
          if (fits) {
            size = [sx, sy, sz];
            break;
          }
        }
      }
      const ids = [];
      for (let k = 0; k < size[2]; k++)
        for (let j = 0; j < size[1]; j++)
          for (let i = 0; i < size[0]; i++) {
            free[at(x + i, y + j, z + k)] = false;
            ids.push(at(x + i, y + j, z + k));
          }
      pieces.push({ cell: [x, y, z], size, ids });
    }
    return pieces;
  }
  shatter(body, slot) {
    const random = () => this.random(),
      nodes = body.positions,
      lattice = nodes.length === NODE_COUNT,
      r = body.r || IDENTITY,
      core =
        body.core || [0, 1, 2].map((k) => nodes.reduce((sum, q) => sum + q[k], 0) / nodes.length),
      // A falling body keeps its fall; sideways drift is capped so chunks stay near.
      carry = (body.coreVelocity || [0, 0, 0]).map((v, k) =>
        k === 1 ? Math.min(v, 2) : Math.max(-1.5, Math.min(1.5, v)) * 0.6,
      ),
      cell = WIDTH / RES;
    for (const piece of this.splitCells()) {
      // Offset of the piece's centre in the jelly's own frame.
      const local = piece.cell.map((v, k) => (v + piece.size[k] / 2) * cell - WIDTH / 2);
      let center;
      if (lattice) {
        // Follow the deformed lattice: the mean of the piece's cell nodes.
        const ids = new Set(piece.ids.flatMap((i) => LATTICE_CELLS[i]));
        center = [0, 0, 0];
        for (const id of ids) for (let k = 0; k < 3; k++) center[k] += nodes[id][k] / ids.size;
      } else
        center = [0, 1, 2].map(
          (k) => core[k] + r[k * 3] * local[0] + r[k * 3 + 1] * local[1] + r[k * 3 + 2] * local[2],
        );
      let out = center.map((v, k) => v - core[k]);
      const distance = Math.hypot(...out);
      if (distance < 0.05) {
        const a = random() * Math.PI * 2;
        out = [Math.cos(a), 0, Math.sin(a)];
      } else out = out.map((v) => v / distance);
      const cells = piece.ids.length,
        speed = (0.55 + random() * 0.85) / Math.sqrt(cells),
        spin = (5 + random() * 8) / Math.sqrt(cells),
        axis = [random() - 0.5, random() - 0.5, random() - 0.5],
        axisLength = Math.hypot(...axis) || 1;
      this.chunks.push({
        kind: 'chunk',
        position: center,
        velocity: out.map((v, k) => carry[k] + v * speed + (k === 1 ? 1.8 + random() * 1.5 : 0)),
        rotation: r.slice(),
        omega: axis.map((v) => (v / axisLength) * spin),
        half: piece.size.map((v) => v * cell * (0.42 + random() * 0.05)),
        color: palettes[slot],
        slot,
        squash: 0,
        squashAge: 0,
        age: 0,
        life: 1.5 + random() * 0.6,
      });
    }
    this.chunks = this.chunks.slice(-CHUNK_LIMIT);
  }
  stepChunks(dt, world) {
    this.chunks = this.chunks.filter((c) => c.age < c.life);
    if (!this.chunks.length) return;
    const walls = (world.collisionBoxes?.() || []).filter(
      (b) => b.kind === 'wall' || b.maxY > 0.15,
    );
    for (const c of this.chunks) {
      c.age += dt;
      c.squashAge += dt;
      const previousBottom = c.position[1] - chunkExtent(c, 1);
      c.velocity[1] -= CHUNK_GRAVITY * dt;
      for (let k = 0; k < 3; k++) c.position[k] += c.velocity[k] * dt;
      const spin = Math.hypot(...c.omega);
      if (spin > 1e-4)
        c.rotation = rotate(
          c.rotation,
          c.omega.map((v) => v / spin),
          spin * dt,
        );
      const extent = [0, 1, 2].map((k) => chunkExtent(c, k));
      for (const b of walls) {
        const lo = [
            b.x - (b.halfX ?? b.half) - extent[0],
            b.minY - extent[1],
            b.z - (b.halfZ ?? b.half) - extent[2],
          ],
          hi = [
            b.x + (b.halfX ?? b.half) + extent[0],
            b.maxY + extent[1],
            b.z + (b.halfZ ?? b.half) + extent[2],
          ];
        if (c.position.some((v, k) => v < lo[k] || v > hi[k])) continue;
        let axis = 0,
          side = lo[0],
          distance = Infinity;
        for (let k = 0; k < 3; k++)
          for (const edge of [lo[k], hi[k]])
            if (Math.abs(c.position[k] - edge) < distance) {
              distance = Math.abs(c.position[k] - edge);
              axis = k;
              side = edge;
            }
        c.position[axis] = side;
        if (axis === 1 && side === hi[1]) c.velocity[1] = Math.max(0, c.velocity[1]);
        else c.velocity[axis] *= -0.3;
        for (let k = 0; k < 3; k++) c.omega[k] *= 0.8;
      }
      const floor = world.heightAt(c.position[0], c.position[2], previousBottom + 0.05);
      if (
        floor === null ||
        previousBottom < floor - 0.02 ||
        c.position[1] - extent[1] > floor + 0.002
      )
        continue;
      // On the floor: bounce a little, squash, roll from any slide, rub and settle on a face.
      c.position[1] = floor + extent[1];
      const impact = -c.velocity[1];
      if (impact > 0.9) {
        c.squash = Math.min(0.4, impact * 0.075);
        c.squashAge = 0;
        const reach = Math.max(...c.half);
        c.omega = [c.velocity[2] / reach, c.omega[1] * 0.5, -c.velocity[0] / reach].map(
          (v, k) => (v + c.omega[k]) * 0.5,
        );
      }
      c.velocity[1] = impact > 0.9 ? impact * 0.26 : 0;
      const rub = Math.exp(-dt * 7);
      c.velocity[0] *= rub;
      c.velocity[2] *= rub;
      for (let k = 0; k < 3; k++) c.omega[k] *= Math.exp(-dt * 6);
      // Turn the local axis nearest to vertical upright.
      let best = 0;
      for (let a = 1; a < 3; a++)
        if (Math.abs(c.rotation[3 + a]) > Math.abs(c.rotation[3 + best])) best = a;
      const sign = Math.sign(c.rotation[3 + best]) || 1,
        up = [c.rotation[best] * sign, c.rotation[3 + best] * sign, c.rotation[6 + best] * sign],
        // up × (0, 1, 0)
        tilt = [-up[2], 0, up[0]],
        sine = Math.hypot(...tilt);
      if (sine > 1e-4)
        c.rotation = rotate(
          c.rotation,
          tilt.map((v) => v / sine),
          Math.asin(Math.min(1, sine)) * Math.min(1, dt * 10),
        );
    }
  }
  skeletonBurst(event) {
    this.bones = this.bones.filter((p) => p.archer !== event.archer);
    const parts = [
      [0, 1.04, 0, 0.14],
      [0, 0.43, 0, 0.09],
      [-0.14, 0.04, 0.09, 0.07],
      [0.14, 0.04, 0.09, 0.07],
    ];
    for (const side of [-1, 1])
      for (const y of [0.22, 0.55, 0.65, 0.75, 0.83])
        parts.push([side * (y < 0.4 ? 0.11 : 0.13), y, 0, 0.055]);
    for (let i = 0; i < parts.length; i++) {
      const [x, y, z, size] = parts[i],
        dir = event.direction || { x: 0, z: 1 },
        home = [
          event.position[0] + dir.z * x + dir.x * z,
          event.position[1] + y,
          event.position[2] - dir.x * x + dir.z * z,
        ],
        a = this.random() * Math.PI * 2;
      this.bones.push({
        kind: 'bone',
        archer: event.archer,
        home,
        position: [...home],
        velocity: this.reducedMotion
          ? [0, 0, 0]
          : [
              Math.cos(a) * (0.25 + this.random() * 0.45),
              0.6 + this.random() * 1.3,
              Math.sin(a) * (0.25 + this.random() * 0.45),
            ],
        size,
        phase: this.random() * 6.28,
        color: [0.72, 0.67, 0.47],
        age: 0,
        life: 5,
        skull: i === 0,
      });
    }
    this.bones = this.bones.slice(-56);
  }
  emitRune(goal, index, world) {
    if (this.runes.length >= RUNE_LIMIT) return;
    const a = this.random() * Math.PI * 2,
      edge = Math.floor(this.random() * 4),
      offset = (this.random() - 0.5) * 0.6;
    const x = edge < 2 ? (edge === 0 ? -0.4 : 0.4) : offset,
      z = edge >= 2 ? (edge === 2 ? -0.4 : 0.4) : offset;
    this.runes.push({
      glyph: index,
      position: [goal.x + x, (goal.y ?? world.heightAt(goal.x, goal.z) ?? 0) + 0.07, goal.z + z],
      velocity: [Math.cos(a) * 0.045, 0.72 + this.random() * 0.2, Math.sin(a) * 0.045],
      color: runeColors[index],
      size: 0.105 + this.random() * 0.035,
      phase: this.random() * Math.PI * 2,
      age: 0,
      life: 1.8 + this.random() * 0.4,
    });
  }
  burst(event, players, soft) {
    const random = () => this.random();
    if (event.type === 'victory') {
      if (this.reducedMotion) return;
      players.forEach((player, index) => {
        const slot = player.slot ?? index,
          color = runeColors[slot],
          center = [player.x, (player.y || 0) + 0.06, player.z];
        this.rings.push({ center, color, age: 0, life: 0.9 });
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2,
            r = 0.28 + random() * 0.15;
          this.particles.push({
            kind: 'magic',
            position: [
              center[0] + Math.cos(a) * r,
              center[1] + 0.15 + random() * 0.5,
              center[2] + Math.sin(a) * r,
            ],
            velocity: [Math.cos(a) * 0.45, 0.45 + random() * 0.65, Math.sin(a) * 0.45],
            size: 0.018 + random() * 0.02,
            phase: a,
            color,
            age: 0,
            life: 0.7 + random() * 0.5,
          });
        }
        for (let i = 0; i < 3 && this.runes.length < RUNE_LIMIT; i++) {
          const a = (i / 3) * Math.PI * 2;
          this.runes.push({
            glyph: slot,
            position: [
              center[0] + Math.cos(a) * 0.5,
              center[1] + 0.18,
              center[2] + Math.sin(a) * 0.5,
            ],
            velocity: [Math.cos(a) * 0.08, 0.55, Math.sin(a) * 0.08],
            color,
            size: 0.12,
            phase: a,
            age: 0,
            life: 1.4,
          });
        }
      });
    } else if (event.type === 'death') {
      if (event.beam) {
        this.lasers.push({ ...event.beam, age: 0, life: 0.18 });
        this.lasers = this.lasers.slice(-8);
      }
      const player = players[event.player],
        body = soft.get(player),
        slot = player.slot ?? event.player,
        color = palettes[slot],
        count = this.reducedMotion ? 6 : 10;
      if (event.beam) this.laserImpact(event.beam, player, this.reducedMotion ? 2 : 10);
      if (!this.reducedMotion) this.shatter(body, slot);
      const life = this.reducedMotion ? Math.min(0.3, player.respawnTimer || 0.3) : 0.55;
      for (let i = 0; i < count; i++) {
        const q = body.positions[Math.floor(random() * body.positions.length)],
          a = random() * Math.PI * 2,
          speed = 0.6 + random() * 1.8;
        // With reduced motion a few tiny cubes stand in for the chunks; otherwise these are
        // splash droplets around them.
        const cube = this.reducedMotion && i % 3 !== 2;
        this.particles.push({
          kind: 'jelly',
          cube,
          position: [...q],
          velocity: [Math.cos(a) * speed, 1 + random() * 2.2, Math.sin(a) * speed],
          size: cube ? 0.07 + random() * 0.08 : 0.03 + random() * 0.03,
          phase: random() * 6.28,
          spin: (random() < 0.5 ? -1 : 1) * (5 + random() * 9),
          color,
          slot,
          age: 0,
          life: life * (0.7 + random() * 0.3),
        });
      }
    } else if (event.type === 'archerDeath') {
      this.skeletonBurst(event);
    } else if (event.type === 'shieldBreak') {
      for (let i = 0; i < (this.reducedMotion ? 4 : 14); i++) {
        const a = random() * Math.PI * 2;
        this.particles.push({
          kind: 'wood',
          position: [...event.position],
          velocity: [Math.cos(a) * (1 + random()), 1 + random() * 2, Math.sin(a) * (1 + random())],
          size: 0.035 + random() * 0.025,
          phase: a,
          color: [0.38, 0.22, 0.085],
          age: 0,
          life: 0.7 + random() * 0.3,
        });
      }
    } else if (event.type === 'arrowBlock' || event.type === 'arrowImpact') {
      const color = event.type === 'arrowBlock' ? [1, 0.72, 0.26] : [0.48, 0.4, 0.29];
      for (let i = 0; i < (this.reducedMotion ? 2 : 7); i++) {
        const a = random() * Math.PI * 2;
        this.particles.push({
          kind: 'magic',
          position: [...event.position],
          velocity: [Math.cos(a) * 0.8, 0.3 + random() * 0.7, Math.sin(a) * 0.8],
          size: 0.012 + random() * 0.012,
          phase: a,
          color,
          age: 0,
          life: 0.18 + random() * 0.12,
        });
      }
    } else if (event.type === 'portal' || event.type === 'respawn' || event.type === 'summon') {
      const player = players[event.player],
        traveller = event.crate ? [1, 0.97, 0.9] : palettes[player?.slot ?? event.player];
      // A portal hop: the traveller collapses into sparks at the entrance, a glowing wisp
      // flies to the exit, and the traveller materialises there as the wisp arrives.
      const travel = event.type === 'portal' ? PORTAL_TRAVEL_TIME : 0;
      // During the level assembly the renderer grows the jelly itself; only add the sparkle.
      if (!event.crate && event.type !== 'summon') this.warp(event.player, travel);
      if (!this.reducedMotion && event.type === 'portal') {
        const [sx, sy, sz] = event.source,
          [dx, dy, dz] = event.destination;
        for (let i = 0; i < 14; i++) {
          const a = random() * Math.PI * 2,
            r = 0.3 + random() * 0.25,
            life = 0.16 + random() * 0.1;
          this.particles.push({
            kind: 'magic',
            position: [
              sx + Math.cos(a) * r,
              sy + 0.42 + (random() - 0.5) * 0.5,
              sz + Math.sin(a) * r,
            ],
            velocity: [(-Math.cos(a) * r) / life, 0, (-Math.sin(a) * r) / life],
            size: 0.03 + random() * 0.03,
            phase: a,
            color: traveller,
            age: 0,
            life,
          });
        }
        // Three glowing strands spiral around an arc from entrance to exit; later sparks lag
        // behind the leaders, so the wisp reads as a swirling comet with a tail.
        for (let i = 0; i < 26; i++) {
          const lag = (i % 9) * 0.018;
          this.particles.push({
            kind: 'wisp',
            from: [sx, sy + 0.42, sz],
            to: [dx, dy + 0.42, dz],
            travel,
            lag,
            position: [sx, sy + 0.42, sz],
            velocity: [0, 0, 0],
            size: (0.09 - lag * 0.3) * (0.8 + random() * 0.4),
            phase: Math.floor(i / 9) * 2.09 + random() * 0.3,
            color: i % 3 ? Levels.portalColor(event.color).glow : traveller,
            age: 0,
            life: travel + lag,
          });
        }
      }
      if (event.type === 'respawn' || event.type === 'summon') {
        // Summoned back: a ring and rising sparks at the spawn as the jelly grows in.
        const center = [player.x, (player.y || 0) + 0.04, player.z];
        this.rings.push({
          center,
          color: traveller,
          age: 0,
          life: this.reducedMotion ? 0.25 : 0.6,
        });
        for (let i = 0; i < (this.reducedMotion ? 0 : 16); i++) {
          const a = random() * Math.PI * 2,
            r = 0.2 + random() * 0.25;
          this.particles.push({
            kind: 'magic',
            position: [
              center[0] + Math.cos(a) * r,
              center[1] + random() * 0.3,
              center[2] + Math.sin(a) * r,
            ],
            velocity: [-Math.cos(a) * 0.4, 0.8 + random() * 1.4, -Math.sin(a) * 0.4],
            size: 0.02 + random() * 0.03,
            phase: a,
            color: traveller,
            age: 0,
            life: 0.45 + random() * 0.25,
          });
        }
      }
    }
    if (event.type === 'scuff') {
      // A crate or barrel moving over the floor kicks a little dust out from under the sides
      // of its base, trailing behind it.
      const [x, y, z] = event.center,
        [dx, dz] = event.direction,
        strength = Math.max(0.2, Math.min(1, event.strength));
      for (const side of this.reducedMotion ? [] : [-1, 1]) {
        if (random() > 0.35 + strength * 0.5) continue;
        const along = (random() - 0.6) * event.half,
          out = event.half * (0.9 + random() * 0.15),
          // Perpendicular to the motion, on this side.
          sx = -dz * side,
          sz = dx * side;
        this.particles.push({
          kind: 'dust',
          position: [x + sx * out + dx * along, y + 0.03, z + sz * out + dz * along],
          velocity: [
            sx * (0.3 + random() * 0.4) - dx * 0.25,
            0.12 + random() * 0.25,
            sz * (0.3 + random() * 0.4) - dz * 0.25,
          ],
          size: (0.08 + random() * 0.07) * (0.7 + strength * 0.5),
          phase: random() * Math.PI * 2,
          color: [0.3, 0.27, 0.23].map((v) => v * (0.85 + random() * 0.3)),
          age: 0,
          life: 0.6 + random() * 0.5,
        });
      }
    }
    if (event.type === 'sweat') {
      // A jelly straining against a load: a cartoon drop of sweat beads at the top of a side
      // face the camera can see, then runs down it, speeding up, and fades at the bottom.
      // It rides on the jelly (see stepSweat), turning with its faces.
      const player = players[event.player],
        body = soft?.get(player);
      if (this.reducedMotion || !body) return;
      const r = body.r,
        [cx, cz] = event.toCamera,
        faces = [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 0, 1],
          [0, 0, -1],
        ].filter((n) => (r[0] * n[0] + r[2] * n[2]) * cx + (r[6] * n[0] + r[8] * n[2]) * cz > 0.15);
      if (!faces.length) return;
      this.soft = soft;
      this.particles.push({
        kind: 'sweat',
        player: event.player,
        face: faces[Math.floor(random() * faces.length)],
        across: (random() - 0.5) * 0.44,
        down: 0.2 + random() * 0.06,
        speed: 0.02 + random() * 0.03,
        position: [...body.core],
        size: 0.07 + random() * 0.02,
        phase: 0,
        color: [0.35, 0.68, 1],
        age: 0,
        life: 1.6,
      });
    }
    if (event.type === 'dust') {
      // A body thuds down after a drop: puffs of stone dust roll out from under its edges,
      // rise a little, slow down and settle. `strength` (0..1) grows with the height fallen.
      const [x, y, z] = event.center,
        half = event.half,
        strength = Math.max(0.3, Math.min(1, event.strength));
      for (let i = 0; i < (this.reducedMotion ? 0 : Math.round(16 + strength * 20)); i++) {
        const a = random() * Math.PI * 2,
          // A point on the square footprint's outline, pushed outwards from its centre.
          edge = Math.max(Math.abs(Math.cos(a)), Math.abs(Math.sin(a))),
          ox = (Math.cos(a) / edge) * half,
          oz = (Math.sin(a) / edge) * half,
          speed = (0.7 + random() * 0.9) * (0.6 + strength * 0.6);
        this.particles.push({
          kind: 'dust',
          position: [x + ox, y + 0.04 + random() * 0.06, z + oz],
          velocity: [Math.cos(a) * speed, 0.25 + random() * 0.45 * strength, Math.sin(a) * speed],
          size: (0.1 + random() * 0.1) * (0.7 + strength * 0.5),
          phase: a,
          color: [0.3, 0.27, 0.23].map((v) => v * (0.85 + random() * 0.3)),
          age: 0,
          life: 0.7 + random() * 0.6,
        });
      }
    }
    if (event.type === 'torchOut' || event.type === 'torchLit') {
      // A snuffed torch: a puff of smoke and a few dying embers. Relit: a little spray of sparks.
      const out = event.type === 'torchOut',
        [x, y, z] = event.position;
      for (let i = 0; i < (this.reducedMotion ? 0 : out ? 10 : 0); i++) {
        const a = random() * Math.PI * 2;
        this.particles.push({
          kind: 'smoke',
          position: [x + Math.cos(a) * 0.05, y + random() * 0.1, z + Math.sin(a) * 0.05],
          velocity: [Math.cos(a) * 0.25, 0.5 + random() * 0.5, Math.sin(a) * 0.25],
          size: 0.05 + random() * 0.05,
          phase: a,
          color: [0.3, 0.28, 0.26],
          age: 0,
          life: 0.9 + random() * 0.6,
        });
      }
      for (let i = 0; i < (this.reducedMotion ? 0 : out ? 6 : 9); i++) {
        const a = random() * Math.PI * 2,
          speed = out ? 0.6 + random() * 0.8 : 0.8 + random() * 1.2;
        this.particles.push({
          kind: 'spark',
          position: [x, y, z],
          velocity: [
            Math.cos(a) * speed * 0.5,
            (out ? 0.6 : 1.4) + random(),
            Math.sin(a) * speed * 0.5,
          ],
          size: 0.012 + random() * 0.01,
          phase: a,
          color: [1, 0.45, 0.08],
          age: 0,
          life: 0.3 + random() * 0.3,
        });
      }
    }
    if (event.type === 'crateTeleport') {
      // A mage's teleport: a white flash swallowing the crate and sparks bursting off its
      // sides in every direction.
      const white = [1, 0.97, 0.9],
        [x, y, z] = event.center;
      for (const [size, life] of [
        [0.66, 0.16],
        [0.5, 0.26],
      ])
        this.particles.push({
          kind: 'magic',
          position: [x, y, z],
          velocity: [0, 0, 0],
          size,
          phase: 0,
          color: white,
          age: 0,
          life,
        });
      for (let i = 0; i < (this.reducedMotion ? 0 : 24); i++) {
        const a = random() * Math.PI * 2,
          up = random() * 2 - 1,
          side = Math.sqrt(1 - up * up),
          direction = [Math.cos(a) * side, up, Math.sin(a) * side],
          speed = 1.4 + random() * 2;
        this.particles.push({
          kind: 'magic',
          position: direction.map((d, k) => event.center[k] + d * 0.5),
          velocity: direction.map((d) => d * speed),
          size: 0.025 + random() * 0.035,
          phase: a,
          color: white,
          age: 0,
          life: 0.3 + random() * 0.3,
        });
      }
    }
    if (event.type === 'portal') {
      const color = Levels.portalColor(event.color).glow;
      for (const center of [event.source, event.destination]) {
        this.rings.push({
          center: [...center],
          color,
          age: 0,
          life: this.reducedMotion ? 0.25 : 0.65,
        });
        for (let i = 0; i < (this.reducedMotion ? 0 : 14); i++) {
          const a = random() * Math.PI * 2,
            r = 0.12 + random() * 0.3;
          this.particles.push({
            kind: 'magic',
            position: [
              center[0] + Math.cos(a) * r,
              center[1] + 0.06 + random() * 0.5,
              center[2] + Math.sin(a) * r,
            ],
            velocity: [Math.cos(a) * 0.35, 0.5 + random() * 1.6, Math.sin(a) * 0.35],
            size: 0.018 + random() * 0.026,
            phase: a,
            color,
            age: 0,
            life: 0.4 + random() * 0.22,
          });
        }
      }
    }
    this.particles = this.particles.slice(-MAX_PARTICLES);
    this.rings = this.rings.slice(-8);
  }
  // A sweat drop sits on a jelly face (local normal `face`, `across` it and `down` from its
  // centre) and runs down it under a gentle pull; its world pose follows the jelly's lattice.
  stepSweat(p, dt, players) {
    const player = players[p.player],
      body = player && player.state !== 'dead' ? this.soft?.get(player) : null;
    if (!body) {
      p.age = p.life;
      return;
    }
    p.speed += 0.55 * dt;
    p.down -= p.speed * dt;
    // Off the bottom edge: fade out quickly.
    if (p.down < -0.3) p.age = Math.max(p.age, p.life * 0.82);
    const r = body.r,
      [nx, , nz] = p.face,
      local = [nx * 0.39 + nz * p.across, p.down, nz * 0.39 + nx * p.across],
      world = (v) =>
        [0, 1, 2].map((i) => r[i * 3] * v[0] + r[i * 3 + 1] * v[1] + r[i * 3 + 2] * v[2]);
    const offset = world(local);
    p.position = body.core.map((v, i) => v + offset[i]);
    // Across the face, up the face and out of it, for the drop's teardrop shape.
    p.basis = [world([nz, 0, nx]), world([0, 1, 0]), world([nx, 0, nz])];
  }
  step(dt, world, goals = [], players = []) {
    // Cap long background-tab gaps for stable presentation.
    dt = Math.min(Math.max(0, dt), 0.1);
    for (const warp of this.warps) if (warp) warp.age += dt;
    for (const ray of this.lasers) ray.age += dt;
    this.lasers = this.lasers.filter((ray) => ray.age < ray.life);
    for (const p of this.particles) {
      p.age += dt;
      const previousY = p.position[1];
      if (p.kind === 'wisp') {
        const s = Math.max(0, Math.min(1, (p.age - p.lag) / p.travel)),
          dx = p.to[0] - p.from[0],
          dz = p.to[2] - p.from[2],
          length = Math.hypot(dx, dz) || 1,
          side = [-dz / length, 0, dx / length],
          radius = 0.24 * Math.sin(Math.PI * s),
          a = p.phase + s * 14,
          lift = 0.7 * Math.sin(Math.PI * s);
        for (let k = 0; k < 3; k++)
          p.position[k] =
            p.from[k] +
            (p.to[k] - p.from[k]) * s +
            side[k] * Math.cos(a) * radius +
            (k === 1 ? lift + Math.sin(a) * radius : 0);
        continue;
      }
      if (p.kind === 'sweat') {
        this.stepSweat(p, dt, players);
        continue;
      }
      if (p.kind === 'jelly' || p.kind === 'wood') p.velocity[1] -= 7 * dt;
      else if (p.kind === 'spark') p.velocity[1] -= 5 * dt;
      else if (p.kind === 'smoke')
        for (let k = 0; k < 3; k++) p.velocity[k] *= 1 - Math.min(1, dt * 1.6);
      // Dust rolls out fast, then hangs in the air and slowly settles.
      else if (p.kind === 'dust') {
        for (let k = 0; k < 3; k++) p.velocity[k] *= 1 - Math.min(1, dt * 3.2);
        p.velocity[1] -= 0.25 * dt;
      }
      for (let k = 0; k < 3; k++) p.position[k] += p.velocity[k] * dt;
      if (p.kind === 'jelly' || p.kind === 'wood') {
        const floor = world.heightAt(p.position[0], p.position[2], previousY);
        if (
          floor !== null &&
          previousY >= floor - 0.01 &&
          p.position[1] < floor + p.size * 0.45 &&
          p.velocity[1] < 0
        ) {
          p.position[1] = floor + p.size * 0.45;
          p.velocity[1] *= -0.22;
          p.velocity[0] *= 0.65;
          p.velocity[2] *= 0.65;
        }
      }
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    this.stepChunks(dt, world);
    this.stepLaserImpacts(dt, world, players);
    for (const ring of this.rings) ring.age += dt;
    this.rings = this.rings.filter((r) => r.age < r.life);
    // These fragments follow the gameplay resurrection clock, including after undo.
    (world.archers || []).forEach((a, i) => {
      if (a.state === 'dead' && !this.bones.some((p) => p.archer === i))
        this.skeletonBurst({
          archer: i,
          position: [a.x, a.y ?? world.heightAt(a.x, a.z) ?? 0, a.z],
          direction: { x: a.dx || 0, z: a.dz ?? 1 },
        });
    });
    this.bones = this.bones.filter((p) => world.archers?.[p.archer]?.state === 'dead');
    const boneWalls = this.bones.length
      ? (world.collisionBoxes?.() || []).filter((b) => b.kind === 'wall' || b.maxY > 0.15)
      : [];
    for (const p of this.bones) {
      const timer = world.archers[p.archer].respawnTimer;
      p.age = 5 - timer;
      if (timer < 0.7 && !this.reducedMotion) {
        p.gatherFrom ??= [...p.position];
        const t = 1 - timer / 0.7,
          s = t * t * (3 - 2 * t);
        p.position = p.gatherFrom.map((v, k) => v + (p.home[k] - v) * s);
        continue;
      }
      const previous = p.position[1];
      p.velocity[1] -= 7 * dt;
      for (let k = 0; k < 3; k++) p.position[k] += p.velocity[k] * dt;
      for (const b of boneWalls) {
        const lo = [
            b.x - (b.halfX ?? b.half) - p.size * 0.5,
            b.minY - p.size * 0.5,
            b.z - (b.halfZ ?? b.half) - p.size * 0.5,
          ],
          hi = [
            b.x + (b.halfX ?? b.half) + p.size * 0.5,
            b.maxY + p.size * 0.5,
            b.z + (b.halfZ ?? b.half) + p.size * 0.5,
          ];
        if (p.position.some((v, k) => v < lo[k] || v > hi[k])) continue;
        let axis = 0,
          side = lo[0],
          distance = Infinity;
        for (let k = 0; k < 3; k++)
          for (const edge of [lo[k], hi[k]])
            if (Math.abs(p.position[k] - edge) < distance) {
              distance = Math.abs(p.position[k] - edge);
              axis = k;
              side = edge;
            }
        p.position[axis] = side;
        p.velocity[axis] *= -0.2;
      }
      const floor = world.heightAt(p.position[0], p.position[2], previous);
      if (floor !== null && previous >= floor && p.position[1] < floor + p.size * 0.5) {
        p.position[1] = floor + p.size * 0.5;
        p.velocity[1] *= -0.12;
        p.velocity[0] *= 0.65;
        p.velocity[2] *= 0.65;
      }
    }
    for (const rune of this.runes) {
      rune.age += dt;
      for (let k = 0; k < 3; k++) rune.position[k] += rune.velocity[k] * dt;
    }
    this.runes = this.runes.filter((r) => r.age < r.life);
    if (!this.reducedMotion)
      goals.slice(0, 5).forEach((goal, i) => {
        const slot = goal?.slot ?? i,
          charge = world.goalCharge(
            goal,
            players.find((p, j) => (p.slot ?? j) === slot),
          );
        if (charge <= 0.1) {
          this.runeActive[i] = false;
          this.runeTimers[i] = 0;
          return;
        }
        if (!this.runeActive[i]) {
          this.runeActive[i] = true;
          this.runeTimers[i] = 0;
          this.emitRune(goal, slot, world);
        }
        this.runeTimers[i] += dt * charge;
        while (this.runeTimers[i] >= 0.25) {
          this.runeTimers[i] -= 0.25;
          this.emitRune(goal, slot, world);
        }
      });
  }
}
export { System, CHUNK_MELT };
