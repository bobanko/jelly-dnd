import Levels from '../world/levels.js';
import { box, lowSphere, sphere, rod } from './mesh.js';
import { crateGeometry } from './geometry/wood.js';
import { assemblyDropOffset, assemblyFloatOffset, assemblyRock } from './assembly.js';
import { shieldGeometry, arrowGeometry, swordGeometry } from './geometry/equipment.js';
import {
  beamColors,
  BUBBLES,
  BUBBLE_SPACING,
  droneGeometry,
  archerGeometry,
  bowGeometry,
} from './geometry/mobs.js';
import {
  spikeTint,
  spikeSocket,
  spike,
  portalRing,
  pressureSurface,
  conveyorTile,
} from './geometry/mechanisms.js';
import { goalRune } from './geometry/runes.js';
export const propsMethods = {
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
      const socket = [];
      pressureSurface(
        socket,
        [0, 0, 0],
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
        socket,
        [0, 0.004, 0],
        [
          [0, 0],
          [0.294, 0],
          [0.294, 0.012],
          [0, 0.012],
        ],
        [0.027, 0.03, 0.029],
        13,
      );
      append('pressureSocket', i, socket);
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
  },
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
      fz = (c - s) * 0.7071,
      crateLandingStart = level.plates.length + players.length,
      pickupLandingStart = crateLandingStart + (level.crates || []).length,
      archerLandingStart = pickupLandingStart + level.world.pickups.length,
      droneLandingStart = archerLandingStart + level.world.archers.length,
      landingCount = droneLandingStart + (level.world.drones || []).length;
    let cursor = 0,
      opaqueCount = null;
    this.crystalPieces = [];
    // Reuse immutable local meshes and one upload array. No per-frame tessellation
    // or large JS number arrays for rigid decorations.
    for (const piece of this.propPieces) {
      const i = piece.index,
        source = piece.data,
        landingIndex =
          piece.kind === 'pressureButton' || piece.kind === 'pressureSocket'
            ? i
            : piece.kind === 'jelly' || piece.kind === 'bubble'
              ? level.plates.length + i
              : piece.kind === 'crate'
                ? crateLandingStart + i
                : piece.kind === 'pickup'
                  ? pickupLandingStart + i
                  : piece.kind.startsWith('archer') || piece.kind === 'nockedArrow'
                    ? archerLandingStart + i
                    : piece.kind === 'drone' || piece.kind === 'droneCrystal'
                      ? droneLandingStart + i
                      : null,
        dropOffset =
          landingIndex === null
            ? null
            : piece.kind === 'drone' || piece.kind === 'droneCrystal'
              ? assemblyFloatOffset(level.assembly, landingIndex, landingCount)
              : assemblyDropOffset(level.assembly, landingIndex, landingCount),
        rock =
          piece.kind.startsWith('archer') || piece.kind === 'nockedArrow'
            ? assemblyRock(level.assembly, landingIndex, landingCount)
            : 0;
      if (level.assembly && (landingIndex === null || dropOffset === null)) continue;
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
      } else if (piece.kind === 'pressureButton' || piece.kind === 'pressureSocket') {
        const p = level.plates[i];
        x = p.x;
        y =
          (p.y ?? level.world.heightAt(p.x, p.z) ?? 0) +
          (piece.kind === 'pressureButton' ? 0.02 - this.platePress[i] * 0.065 : 0);
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
      if (dropOffset) y += dropOffset;
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
        const rockC = Math.cos(rock),
          rockS = Math.sin(rock);
        for (let n = 0; n < source.length; n += 12) {
          const k = cursor + n,
            px = data[k] * rockC - data[k + 1] * rockS,
            py = data[k] * rockS + data[k + 1] * rockC,
            localZ = data[k + 2] - stringPull * Math.max(0, 1 - Math.abs(py - 0.57) / 0.38),
            nx = data[k + 3] * rockC - data[k + 4] * rockS,
            ny = data[k + 3] * rockS + data[k + 4] * rockC,
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
        // Neighbouring belts on the same floor: one ahead continues this belt, one behind
        // or to a side that points here feeds it, so no roller or rail closes that edge.
        const beltAt = (ox, oz) =>
            level.world.conveyors.find(
              (o) =>
                o.x === belt.x + ox &&
                o.z === belt.z + oz &&
                (o.y ?? level.world.heightAt(o.x, o.z) ?? 0) === y,
            ),
          feeds = (o) => o && o.x + (o.dx || 0) === belt.x && o.z + (o.dz ?? 1) === belt.z;
        conveyorTile(mesh, {
          code,
          speed: belt.speed ?? 0.85,
          openBack: !feeds(beltAt(-dx, -dz)),
          openFront: !beltAt(dx, dz),
          // Local side s lies at world offset (dz * s, -dx * s).
          railLeft: !feeds(beltAt(-dz, dx)),
          railRight: !feeds(beltAt(dz, -dx)),
        });
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
  },
};
