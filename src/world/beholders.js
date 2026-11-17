import { segmentBox, bodyBox } from './combat.js';

// A slow ping-pong with zero velocity and acceleration at both turning points.
// Pure arithmetic keeps the hovering eye and its trigger ray identical in lockstep.
export function beholderBob(b, time = 0) {
  const phase = (((time / 6.8 + b.x * 0.071 + b.z * 0.113) % 1) + 1) % 1,
    t = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  return 0.12 * t * t * t * (t * (t * 6 - 15) + 10);
}
export function beholderOrigin(b, base = 0, time = 0) {
  return [b.x, (b.y ?? base) + 0.58 + beholderBob(b, time), b.z];
}

// Stationary, harmless sight triggers. Rendering and activation share the same raycast.
export function install(World) {
  Object.assign(World.prototype, {
    beholderOrigin(b) {
      return beholderOrigin(b, this.heightAt(b.x, b.z) ?? 0, this.featureTime || 0);
    },
    beholderSight(b, bodies = this.bodies || [], soft = this.soft) {
      const dx = b.dx ?? 0,
        dz = b.dz ?? 1,
        y = this.beholderOrigin(b)[1],
        from = [b.x + dx * 0.44, y, b.z + dz * 0.44],
        limit = this.size ?? 32,
        end = [
          dx ? (dx > 0 ? limit - 0.5 : -limit + 0.5) : b.x,
          y,
          dz ? (dz > 0 ? limit - 0.5 : -limit + 0.5) : b.z,
        ];
      let nearest = 1,
        hit = -1;
      for (const box of this.collisionBoxes()) {
        // As with drone beams, the open bars of a grate do not stop sight.
        if (box.kind === 'grate') continue;
        const t = segmentBox(from, end, {
          min: [box.x - (box.halfX ?? box.half), box.minY, box.z - (box.halfZ ?? box.half)],
          max: [box.x + (box.halfX ?? box.half), box.maxY, box.z + (box.halfZ ?? box.half)],
        });
        if (t !== null && t < nearest) nearest = t;
      }
      for (let i = 0; i < bodies.length; i++) {
        const p = bodies[i];
        if (p.state === 'dead') continue;
        const t = segmentBox(from, end, bodyBox(p, soft));
        if (t !== null && t < nearest) {
          nearest = t;
          hit = i;
        }
      }
      const player = bodies[hit];
      return {
        from,
        to: from.map((v, k) => v + (end[k] - v) * nearest),
        hit,
        detected:
          !!player && player.kind !== 'crate' && (!player.state || player.state === 'alive'),
        dashed: true,
        color: 2,
      };
    },
    traceBeholders(bodies = this.bodies || [], soft = this.soft) {
      return this.beholders.map((b, i) => ({
        ...this.beholderSight(b, bodies, soft),
        beholder: i,
      }));
    },
  });
}
