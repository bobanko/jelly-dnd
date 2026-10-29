import { bridgePose } from '../level-features.js';
import { PORTAL_LIMIT } from './layout.js';
import { dot } from './math.js';
import { sphere, rod } from './mesh.js';
import { beamColors } from './geometry/mobs.js';
import { phaseTints, portalRing } from './geometry/mechanisms.js';
export const effectsMethods = {
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
  },
  updateRunes(system, level) {
    const runes = [...(system?.runes || [])];
    for (const bridge of level.bridges.filter((p) => p.color !== undefined)) {
      const progress = bridge.progress ?? (level.world.soft ? 0 : 1),
        pose = bridgePose(bridge, progress),
        color = phaseTints[bridge.color ?? 1] || phaseTints[1];
      for (let i = 0; i < 3; i++) {
        const phase =
          ((level.world.featureTime || 0) * 0.22 + i / 3 + bridge.x * 0.071 + bridge.z * 0.037) % 1;
        runes.push({
          position: [
            bridge.x + (i - 1) * 0.25,
            pose.center[1] + 0.18 + phase * 0.72,
            pose.center[2],
          ],
          size: 0.11 + phase * 0.035,
          color,
          glyph: bridge.color,
          opacity: (0.24 + progress * 0.56) * Math.sin(phase * Math.PI),
          phase: i,
          spectral: true,
        });
      }
    }
    const count = Math.min(32, runes.length),
      data = this.runeData;
    for (let i = 0; i < count; i++) {
      const p = runes[i],
        k = i * 12,
        t = p.age / p.life,
        enter = Math.min(1, p.age / 0.18),
        end = Math.max(0, Math.min(1, (1 - t) / 0.4)),
        opacity = p.spectral
          ? p.opacity
          : enter * enter * (3 - 2 * enter) * end * end * (3 - 2 * end) * 0.8;
      data[k] = p.position[0];
      data[k + 1] = p.position[1];
      data[k + 2] = p.position[2];
      data[k + 3] = p.size;
      data[k + 4] = p.color[0];
      data[k + 5] = p.color[1];
      data[k + 6] = p.color[2];
      data[k + 7] = opacity;
      data[k + 8] = p.glyph;
      data[k + 9] = Math.sin(p.phase + (p.age || 0) * 0.9) * 0.12;
      data[k + 10] = data[k + 11] = 0;
    }
    if (count) this.device.queue.writeBuffer(this.runeBuffer, 0, data.buffer, 0, count * 48);
    this.runeCount = count;
  },
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
  },
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
    for (let i = 0; i < this.dustData.length / 4; i++) {
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
  },
  drawEffects(pass, level, effectCount) {
    pass.setBindGroup(0, this.sceneGroup);
    pass.setBindGroup(1, this.skinGroups[0]);
    const visibleDust = Math.min(
      this.dustData.length / 4,
      Math.round(this.dustCount * this.dustDensity),
    );
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
  },
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
  },
};
