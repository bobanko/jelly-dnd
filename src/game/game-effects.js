import Levels from '../world/levels.js';
// Short-lived visual particles. They never become gameplay colliders.
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
class System {
  constructor({ reducedMotion = false } = {}) {
    this.reducedMotion = reducedMotion;
    this.particles = [];
    this.rings = [];
    this.runes = [];
    this.bones = [];
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
      color = jelly ? palettes[player.slot ?? beam.hit] : [1, 0.72, 0.24];
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
        age: 0,
        life: this.reducedMotion ? 0.16 : (jelly ? 0.3 : 0.18) + this.random() * 0.16,
      });
    }
    this.particles = this.particles.slice(-96);
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
        count = this.reducedMotion ? 6 : 22;
      if (event.beam) this.laserImpact(event.beam, player, this.reducedMotion ? 2 : 10);
      const life = Math.min(this.reducedMotion ? 0.3 : 0.68, player.respawnTimer || 0.68);
      for (let i = 0; i < count; i++) {
        const q = body.positions[Math.floor(random() * body.positions.length)],
          a = random() * Math.PI * 2,
          speed = 0.6 + random() * 1.8;
        // Most pieces are small tumbling jelly cubes; the rest are droplets.
        const cube = i % 3 !== 2;
        this.particles.push({
          kind: 'jelly',
          cube,
          position: [...q],
          velocity: [Math.cos(a) * speed, 1 + random() * 2.2, Math.sin(a) * speed],
          size: cube ? 0.07 + random() * 0.08 : 0.035 + random() * 0.03,
          phase: random() * 6.28,
          spin: (random() < 0.5 ? -1 : 1) * (5 + random() * 9),
          color: palettes[player.slot ?? event.player],
          age: 0,
          life,
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
        jelly = palettes[player?.slot ?? event.player];
      // A portal hop: the jelly collapses into sparks at the entrance, a glowing wisp flies
      // to the exit, and the jelly grows back there as the wisp arrives.
      const travel = event.type === 'portal' ? 0.3 : 0;
      // During the level assembly the renderer grows the jelly itself; only add the sparkle.
      if (event.type !== 'summon') this.warp(event.player, travel);
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
            color: jelly,
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
            color: i % 3 ? Levels.portalColor(event.color).glow : jelly,
            age: 0,
            life: travel + lag,
          });
        }
      }
      if (event.type === 'respawn' || event.type === 'summon') {
        // Summoned back: a ring and rising sparks at the spawn as the jelly grows in.
        const center = [player.x, (player.y || 0) + 0.04, player.z];
        this.rings.push({ center, color: jelly, age: 0, life: this.reducedMotion ? 0.25 : 0.6 });
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
            color: jelly,
            age: 0,
            life: 0.45 + random() * 0.25,
          });
        }
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
    this.particles = this.particles.slice(-96);
    this.rings = this.rings.slice(-8);
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
      if (p.kind === 'jelly' || p.kind === 'wood') p.velocity[1] -= 7 * dt;
      else if (p.kind === 'spark') p.velocity[1] -= 5 * dt;
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
export { System };
